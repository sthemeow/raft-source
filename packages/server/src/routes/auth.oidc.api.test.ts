import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, test } from "vitest";

import { openTestApp } from "../test/integration/app";
import { getDb } from "../db/index";
import { eq } from "drizzle-orm";
import { userAuthIdentities, users } from "../db/schema";
import { resetOidcCaches } from "../services/oidcProvider";

/**
 * Route-level proof for the OIDC start contract. Uses the in-process PGlite
 * database and a local mock provider, so no live services or real provider
 * credentials are involved.
 */

let provider: Server;
let issuer: string;
let tokenSubject = "user-unverified";
let tokenNonce = "";
let tokenEmailVerified = false;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

const OIDC_ENV_KEYS = [
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
  "OIDC_AUTO_START",
] as const;

type SavedEmv = Partial<Record<(typeof OIDC_ENV_KEYS)[number], string | undefined>>;
let saved: SavedEmv = {};

function setOidcEnv(values: Partial<Record<(typeof OIDC_ENV_KEYS)[number], string>>): void {
  for (const key of OIDC_ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetOidcCaches();
}

beforeAll(async () => {
  for (const key of OIDC_ENV_KEYS) saved = { ...saved, [key]: process.env[key] };
  await new Promise<void>((resolve) => {
    provider = createServer((req, res) => {
      const url = req.url ?? "";
      if (url.endsWith("/.well-known/openid-configuration")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        }));
        return;
      }
      if (url.endsWith("/jwks")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          keys: [{ ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid: "k1", use: "sig", alg: "RS256" }],
        }));
        return;
      }
      if (url.endsWith("/token")) {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          const idToken = jwt.sign(
            {
              sub: tokenSubject,
              email: "unverified@example.com",
              email_verified: tokenEmailVerified,
              nonce: tokenNonce,
              iss: issuer,
              aud: "raft-client",
            },
            privatePem,
            { algorithm: "RS256", keyid: "k1", expiresIn: 120 },
          );
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id_token: idToken, access_token: "access" }));
        });
        return;
      }
      res.writeHead(404).end();
    });
    provider.listen(0, "127.0.0.1", () => {
      const address = provider.address();
      const port = typeof address === "object" && address ? address.port : 0;
      issuer = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  provider?.close();
  for (const key of OIDC_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetOidcCaches();
});

test("OIDC is hidden from providers when it is not configured", async () => {
  setOidcEnv({});
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    const response = await fetch(`${app.baseUrl}/api/auth/providers`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { providers: Array<{ id: string; enabled: boolean; autoStart?: boolean }> };
    const oidc = body.providers.find((entry) => entry.id === "oidc");
    assert.ok(oidc, "oidc provider entry should be present");
    assert.equal(oidc!.enabled, false);
    assert.equal(oidc!.autoStart, false);

    const start = await fetch(`${app.baseUrl}/api/auth/oidc/start`, { redirect: "manual" });
    assert.equal(start.status, 404);
  } finally {
    await app.close();
  }
});

test("two concurrent starts keep separate state and verifier cookies", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
      OIDC_AUTO_START: "true",
    });

    const [first, second] = await Promise.all([
      fetch(`${app.baseUrl}/api/auth/oidc/start?silent=1`, { redirect: "manual" }),
      fetch(`${app.baseUrl}/api/auth/oidc/start?silent=1`, { redirect: "manual" }),
    ]);
    assert.equal(first.status, 302);
    assert.equal(second.status, 302);

    const cookiesOf = (response: Response) =>
      (response.headers.getSetCookie?.() ?? []).filter((cookie) => cookie.startsWith("raft_oidc_code_verifier_"));
    const firstCookie = cookiesOf(first)[0];
    const secondCookie = cookiesOf(second)[0];
    assert.ok(firstCookie && secondCookie, "each start sets its own verifier cookie");
    assert.notEqual(firstCookie.split("=")[0], secondCookie.split("=")[0]);

    // Both states must remain valid independently: each carries its own nonce
    // and the verifier cookies are named after it.
    const firstState = new URL(first.headers.get("location")!).searchParams.get("state");
    const secondState = new URL(second.headers.get("location")!).searchParams.get("state");
    assert.ok(firstState && secondState && firstState !== secondState);
    for (const [state, cookie] of [[firstState!, firstCookie!], [secondState!, secondCookie!]]) {
      const decoded = JSON.parse(Buffer.from(state.split(".")[1], "base64url").toString("utf8")) as { nonce: string };
      assert.ok(cookie.startsWith(`raft_oidc_code_verifier_${decoded.nonce}=`));
    }
  } finally {
    await app.close();
  }
});

test("start redirects with PKCE and only opts into prompt=none when enabled", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const quiet = await fetch(`${app.baseUrl}/api/auth/oidc/start?returnTo=%2Fhome`, { redirect: "manual" });
    assert.equal(quiet.status, 302);
    const quietLocation = new URL(quiet.headers.get("location")!);
    assert.equal(quietLocation.origin, issuer);
    assert.equal(quietLocation.searchParams.get("code_challenge_method"), "S256");
    assert.ok(quietLocation.searchParams.get("code_challenge"));
    assert.equal(quietLocation.searchParams.get("prompt"), null);
    const cookies = quiet.headers.getSetCookie?.() ?? [];
    const verifierCookie = cookies.find((cookie) => cookie.startsWith("raft_oidc_code_verifier_"));
    assert.ok(verifierCookie, "a nonce-scoped verifier cookie is set");
    assert.ok(verifierCookie!.includes("HttpOnly"));

    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
      OIDC_AUTO_START: "true",
    });

    const silent = await fetch(`${app.baseUrl}/api/auth/oidc/start?silent=1`, { redirect: "manual" });
    assert.equal(silent.status, 302);
    assert.equal(new URL(silent.headers.get("location")!).searchParams.get("prompt"), "none");

    const providers = await fetch(`${app.baseUrl}/api/auth/providers`);
    const body = (await providers.json()) as { providers: Array<{ id: string; enabled: boolean; autoStart?: boolean }> };
    const oidc = body.providers.find((entry) => entry.id === "oidc");
    assert.equal(oidc?.enabled, true);
    assert.equal(oidc?.autoStart, true);
  } finally {
    await app.close();
  }
});

/**
 * Drives the browser callback the way the client would: start, capture the
 * nonce-scoped cookies, then call the callback with the signed state.
 */
async function runCallback(baseUrl: string, subject: string): Promise<URL> {
  const start = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: "manual" });
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get("location")!);
  const state = location.searchParams.get("state")!;
  tokenNonce = location.searchParams.get("nonce")!;
  tokenSubject = subject;

  const cookies = (start.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";")[0]);
  const callback = await fetch(
    `${baseUrl}/api/auth/oidc/callback?code=code-1&state=${encodeURIComponent(state)}`,
    { redirect: "manual", headers: { cookie: cookies.join("; ") } },
  );
  assert.equal(callback.status, 302);
  return new URL(callback.headers.get("location")!);
}

test("an unlinked identity with an unverified email is refused", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });
    const destination = await runCallback(app.baseUrl, "unlinked-user");
    assert.ok(destination.searchParams.get("error"), "callback reports an error");
    assert.match(destination.searchParams.get("error")!, /not verified/i);
    assert.equal(destination.searchParams.get("code"), null);
  } finally {
    await app.close();
  }
});

test("an already-linked identity signs in even when its email is unverified", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const db = getDb();
    const [user] = await db.insert(users).values({
      email: "linked@example.com",
      name: "linked",
      displayName: "linked",
      emailVerified: true,
      passwordHash: await argon2.hash("password123"),
    }).returning();
    await db.insert(userAuthIdentities).values({
      userId: user.id,
      provider: "oidc",
      providerUserId: `${issuer}|linked-user`,
      providerEmail: "linked@example.com",
    });

    const destination = await runCallback(app.baseUrl, "linked-user");
    assert.equal(destination.searchParams.get("error"), null);
    assert.ok(destination.searchParams.get("code"), "sign-in proceeds with a completion code");
  } finally {
    await app.close();
  }
});

test("an explicit link from Settings works with an unverified email", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const db = getDb();
    const [user] = await db.insert(users).values({
      email: "linker@example.com",
      name: "linker",
      displayName: "linker",
      emailVerified: true,
      passwordHash: await argon2.hash("password123"),
    }).returning();

    const loginResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "linker@example.com", password: "password123" }),
    });
    assert.equal(loginResponse.status, 200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    const start = await fetch(`${app.baseUrl}/api/auth/oidc/link/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ returnTo: "/settings" }),
    });
    assert.equal(start.status, 200);
    const { url } = (await start.json()) as { url: string };
    const authorize = new URL(url);
    const state = authorize.searchParams.get("state")!;
    tokenNonce = authorize.searchParams.get("nonce")!;
    tokenSubject = "link-target";
    assert.equal(authorize.searchParams.get("prompt"), "select_account");

    const cookies = (start.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";")[0]);
    const callback = await fetch(
      `${app.baseUrl}/api/auth/oidc/callback?code=code-link&state=${encodeURIComponent(state)}`,
      { redirect: "manual", headers: { cookie: cookies.join("; ") } },
    );
    assert.equal(callback.status, 302);
    const destination = new URL(callback.headers.get("location")!);
    assert.equal(destination.searchParams.get("error"), null, "link does not require a verified email");
    assert.equal(destination.searchParams.get("mode"), "link");
    const completionCode = destination.searchParams.get("code");
    assert.ok(completionCode);

    const complete = await fetch(`${app.baseUrl}/api/auth/oidc/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ code: completionCode }),
    });
    assert.equal(complete.status, 200);
    const [identity] = await db.select().from(userAuthIdentities)
      .where(eq(userAuthIdentities.userId, user.id));
    assert.equal(identity?.provider, "oidc");
    assert.equal(identity?.providerUserId, `${issuer}|link-target`);
  } finally {
    await app.close();
  }
});

test("linking an identity already owned by another account is rejected", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const db = getDb();
    const [owner] = await db.insert(users).values({
      email: "owner@example.com",
      name: "owner",
      displayName: "owner",
      emailVerified: true,
      passwordHash: await argon2.hash("password123"),
    }).returning();
    await db.insert(userAuthIdentities).values({
      userId: owner.id,
      provider: "oidc",
      providerUserId: `${issuer}|taken-subject`,
      providerEmail: "owner@example.com",
    });

    const [intruder] = await db.insert(users).values({
      email: "intruder@example.com",
      name: "intruder",
      displayName: "intruder",
      emailVerified: true,
      passwordHash: await argon2.hash("password123"),
    }).returning();

    const loginResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "intruder@example.com", password: "password123" }),
    });
    assert.equal(loginResponse.status, 200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    const start = await fetch(`${app.baseUrl}/api/auth/oidc/link/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ returnTo: "/settings" }),
    });
    const { url } = (await start.json()) as { url: string };
    const authorize = new URL(url);
    tokenNonce = authorize.searchParams.get("nonce")!;
    tokenSubject = "taken-subject";

    const cookies = (start.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";")[0]);
    const callback = await fetch(
      `${app.baseUrl}/api/auth/oidc/callback?code=code-steal&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`,
      { redirect: "manual", headers: { cookie: cookies.join("; ") } },
    );
    const destination = new URL(callback.headers.get("location")!);
    const completionCode = destination.searchParams.get("code");

    if (completionCode) {
      const complete = await fetch(`${app.baseUrl}/api/auth/oidc/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code: completionCode }),
      });
      assert.notEqual(complete.status, 200, "completing a stolen link must fail");
    }

    const [identity] = await db.select().from(userAuthIdentities)
      .where(eq(userAuthIdentities.providerUserId, `${issuer}|taken-subject`));
    assert.equal(identity?.userId, owner.id, "the identity still belongs to its original account");
    assert.notEqual(identity?.userId, intruder.id);
  } finally {
    await app.close();
  }
});

test("linking never marks the Raft account email verified from an unverified claim", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const db = getDb();
    // Same email as the token, but Raft has never verified it.
    const [user] = await db.insert(users).values({
      email: "unverified@example.com",
      name: "unverified",
      displayName: "unverified",
      emailVerified: false,
      passwordHash: await argon2.hash("password123"),
    }).returning();

    const loginResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unverified@example.com", password: "password123" }),
    });
    assert.equal(loginResponse.status, 200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    const start = await fetch(`${app.baseUrl}/api/auth/oidc/link/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ returnTo: "/settings" }),
    });
    const { url } = (await start.json()) as { url: string };
    const authorize = new URL(url);
    tokenNonce = authorize.searchParams.get("nonce")!;
    tokenSubject = "unverified-mail-subject";

    const cookies = (start.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";")[0]);
    const callback = await fetch(
      `${app.baseUrl}/api/auth/oidc/callback?code=code-unverified-email&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`,
      { redirect: "manual", headers: { cookie: cookies.join("; ") } },
    );
    const destination = new URL(callback.headers.get("location")!);
    const completionCode = destination.searchParams.get("code");
    assert.ok(completionCode, "the link itself is allowed");

    const complete = await fetch(`${app.baseUrl}/api/auth/oidc/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ code: completionCode }),
    });
    assert.equal(complete.status, 200);

    const [after] = await db.select({ emailVerified: users.emailVerified }).from(users)
      .where(eq(users.id, user.id));
    assert.equal(after?.emailVerified, false, "an unverified claim must not verify the account email");
  } finally {
    await app.close();
  }
});

test("a verified provider claim still verifies the account email (control)", async () => {
  const app = await openTestApp("pglite://", 0, {
    humanActivityMuteFlagDefaultEnabled: true,
    onboardingOpenerFlagDefaultEnabled: false,
  });
  try {
    setOidcEnv({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    });

    const db = getDb();
    const [user] = await db.insert(users).values({
      email: "unverified@example.com",
      name: "control",
      displayName: "control",
      emailVerified: false,
      passwordHash: await argon2.hash("password123"),
    }).returning();

    const loginResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unverified@example.com", password: "password123" }),
    });
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };

    const start = await fetch(`${app.baseUrl}/api/auth/oidc/link/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ returnTo: "/settings" }),
    });
    const { url } = (await start.json()) as { url: string };
    const authorize = new URL(url);
    tokenNonce = authorize.searchParams.get("nonce")!;
    tokenSubject = "verified-mail-subject";
    tokenEmailVerified = true;

    try {
      const cookies = (start.headers.getSetCookie?.() ?? []).map((cookie) => cookie.split(";")[0]);
      const callback = await fetch(
        `${app.baseUrl}/api/auth/oidc/callback?code=code-verified-email&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`,
        { redirect: "manual", headers: { cookie: cookies.join("; ") } },
      );
      const destination = new URL(callback.headers.get("location")!);
      const completionCode = destination.searchParams.get("code");
      assert.ok(completionCode);
      const complete = await fetch(`${app.baseUrl}/api/auth/oidc/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code: completionCode }),
      });
      assert.equal(complete.status, 200);

      const [after] = await db.select({ emailVerified: users.emailVerified }).from(users)
        .where(eq(users.id, user.id));
      assert.equal(after?.emailVerified, true, "a verified claim for the same address verifies the account");
    } finally {
      tokenEmailVerified = false;
    }
  } finally {
    await app.close();
  }
});
