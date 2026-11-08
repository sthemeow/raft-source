import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import jwt from "jsonwebtoken";

import {
  buildOidcAuthorizationUrl,
  createPkcePair,
  exchangeOidcCode,
  getOidcConfig,
  oidcProviderUserId,
  resetOidcCaches,
  verifyOidcIdToken,
  type OidcConfig,
} from "./oidcProvider";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
const KID = "test-key-1";

let server: Server;
let issuer: string;
let lastTokenRequest: URLSearchParams | null = null;

function startMockProvider(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const json = (body: unknown) => {
        const data = JSON.stringify(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(data);
      };
      if (url.pathname.endsWith("/.well-known/openid-configuration")) {
        return json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        });
      }
      if (url.pathname === "/jwks") {
        return json({ keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }] });
      }
      if (url.pathname === "/token" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          lastTokenRequest = new URLSearchParams(body);
          const nonce = (globalThis as Record<string, unknown>).__testNonce as string;
          const idToken = jwt.sign(
            {
              sub: "user-123",
              email: "person@example.com",
              email_verified: true,
              name: "Test Person",
              nonce,
            },
            privatePem,
            {
              algorithm: "RS256",
              keyid: KID,
              issuer,
              audience: "raft-client",
              expiresIn: 120,
            },
          );
          json({ id_token: idToken, access_token: "access-token" });
        });
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      issuer = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function config(overrides: Partial<OidcConfig> = {}): OidcConfig {
  return {
    issuer,
    clientId: "raft-client",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:3001/api/auth/oidc/callback",
    scopes: "openid email profile",
    autoStart: false,
    ...overrides,
  };
}

function signIdToken(claims: Record<string, unknown>, options: { audience?: string; issuer?: string } = {}) {
  return jwt.sign(claims, privatePem, {
    algorithm: "RS256",
    keyid: KID,
    issuer: options.issuer ?? issuer,
    audience: options.audience ?? "raft-client",
    expiresIn: 120,
  });
}

describe("oidc provider", () => {
  beforeAll(async () => {
    await startMockProvider();
  });

  beforeEach(() => {
    resetOidcCaches();
  });

  test("config requires issuer, client id, secret and redirect uri", async () => {
    assert.equal(getOidcConfig({} as NodeJS.ProcessEnv), null);
    assert.equal(
      getOidcConfig({ OIDC_ISSUER: issuer, OIDC_CLIENT_ID: "x" } as NodeJS.ProcessEnv),
      null,
    );
    const parsed = getOidcConfig({
      OIDC_ISSUER: `${issuer}/`,
      OIDC_CLIENT_ID: "raft-client",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_REDIRECT_URI: "http://localhost/cb",
      OIDC_AUTO_START: "true",
    } as NodeJS.ProcessEnv);
    assert.ok(parsed);
    assert.equal(parsed!.issuer, `${issuer}/`);
    assert.equal(parsed!.scopes, "openid email profile");
    assert.equal(parsed!.autoStart, true);
  });

  test("authorization url carries PKCE, state, nonce and optional prompt", async () => {
    const { challenge } = createPkcePair();
    const plain = await buildOidcAuthorizationUrl(config(), {
      state: "state-value",
      nonce: "nonce-value",
      codeChallenge: challenge,
    });
    const plainUrl = new URL(plain);
    assert.equal(plainUrl.searchParams.get("response_type"), "code");
    assert.equal(plainUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(plainUrl.searchParams.get("code_challenge"), challenge);
    assert.equal(plainUrl.searchParams.get("nonce"), "nonce-value");
    assert.equal(plainUrl.searchParams.get("prompt"), null);

    const silent = new URL(
      await buildOidcAuthorizationUrl(config(), {
        state: "s",
        nonce: "n",
        codeChallenge: challenge,
        silent: true,
        selectAccount: true,
      }),
    );
    assert.equal(silent.searchParams.get("prompt"), "none");
  });

  test("discovery must report the configured issuer", async () => {
    await assert.rejects(
      () => buildOidcAuthorizationUrl(config({ issuer: `${issuer}/other` }), {
        state: "s",
        nonce: "n",
        codeChallenge: "c",
      }),
      /oidc_document_unavailable|oidc_issuer_mismatch/,
    );
  });

  test("code exchange sends PKCE verifier and verifies the ID token", async () => {
    resetOidcCaches();
    const { verifier, challenge } = createPkcePair();
    assert.ok(challenge.length > 0);
    (globalThis as Record<string, unknown>).__testNonce = "nonce-abc";

    const tokens = await exchangeOidcCode(config(), { code: "code-1", codeVerifier: verifier });
    assert.equal(tokens.accessToken, "access-token");
    assert.equal(lastTokenRequest?.get("code_verifier"), verifier);
    assert.equal(lastTokenRequest?.get("grant_type"), "authorization_code");
    assert.equal(lastTokenRequest?.get("client_id"), "raft-client");

    const identity = await verifyOidcIdToken(config(), tokens.idToken, { nonce: "nonce-abc" });
    assert.equal(identity.subject, "user-123");
    assert.equal(identity.email, "person@example.com");
    assert.equal(identity.emailVerified, true);
    assert.equal(identity.displayName, "Test Person");
    assert.equal(oidcProviderUserId(identity), `${issuer}|user-123`);
  });

  test("nonce mismatch is rejected", async () => {
    const token = signIdToken({ sub: "user-1", email: "a@example.com", nonce: "expected" });
    await assert.rejects(
      () => verifyOidcIdToken(config(), token, { nonce: "different" }),
      /oidc_nonce_mismatch/,
    );
  });

  test("wrong audience and wrong issuer are rejected", async () => {
    const wrongAudience = signIdToken({ sub: "u", nonce: "n" }, { audience: "other-client" });
    await assert.rejects(
      () => verifyOidcIdToken(config(), wrongAudience, { nonce: "n" }),
      /oidc_id_token_invalid/,
    );
    const wrongIssuer = signIdToken({ sub: "u", nonce: "n" }, { issuer: `${issuer}/evil` });
    await assert.rejects(
      () => verifyOidcIdToken(config(), wrongIssuer, { nonce: "n" }),
      /oidc_id_token_invalid/,
    );
  });

  test("email is only verified when the claim is the boolean true", async () => {
    for (const value of ["true", 1, "yes", undefined]) {
      const token = signIdToken({ sub: "u", email: "a@example.com", email_verified: value, nonce: "n" });
      const identity = await verifyOidcIdToken(config(), token, { nonce: "n" });
      assert.equal(identity.emailVerified, false, `email_verified=${String(value)}`);
      assert.equal(identity.email, "a@example.com");
    }
  });

  test("a token with no subject is rejected", async () => {
    const token = signIdToken({ email: "a@example.com", nonce: "n" });
    await assert.rejects(
      () => verifyOidcIdToken(config(), token, { nonce: "n" }),
      /oidc_id_token_missing_subject/,
    );
  });
});

afterAll(() => {
  server?.close();
});

// ── Authentik compatibility and negative cases ──

function startProvider(options: {
  issuerSuffix?: string;
  extraKey?: { kid: string; jwk: Record<string, unknown> };
  httpEndpoint?: boolean;
} = {}): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    let requests = 0;
    const local = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const address = local.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const base = `http://127.0.0.1:${port}`;
      const issuerValue = `${base}${options.issuerSuffix ?? ""}`;
      const json = (body: unknown) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (url.pathname.endsWith("/.well-known/openid-configuration")) {
        const endpointBase = options.httpEndpoint ? "http://example.com" : base;
        return json({
          issuer: issuerValue,
          authorization_endpoint: `${endpointBase}/authorize`,
          token_endpoint: `${base}/token`,
          jwks_uri: `${base}/jwks`,
        });
      }
      if (url.pathname === "/jwks") {
        requests += 1;
        const keys = [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }];
        if (options.extraKey && requests > 1) keys.push({ ...options.extraKey.jwk, kid: options.extraKey.kid, use: "sig", alg: "RS256" });
        return json({ keys });
      }
      res.writeHead(404).end();
    });
    local.listen(0, "127.0.0.1", () => {
      const address = local.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}${options.issuerSuffix ?? ""}`, close: () => local.close() });
    });
  });
}

test("an Authentik-style issuer with a trailing slash is accepted", async () => {
  const provider = await startProvider({ issuerSuffix: "/application/o/raft/" });
  const cfg = config({ issuer: provider.url, redirectUri: "http://localhost/cb" });
  try {
    const token = jwt.sign(
      { sub: "user-9", email: "a@example.com", email_verified: true, nonce: "n" },
      privatePem,
      { algorithm: "RS256", keyid: KID, issuer: provider.url, audience: "raft-client", expiresIn: 120 },
    );
    const identity = await verifyOidcIdToken(cfg, token, { nonce: "n" });
    assert.equal(identity.subject, "user-9");
    assert.equal(identity.issuer, provider.url);
  } finally {
    provider.close();
    resetOidcCaches();
  }
});

test("a token without exp or iat is rejected", async () => {
  const noExp = jwt.sign({ sub: "u", nonce: "n" }, privatePem, {
    algorithm: "RS256", keyid: KID, issuer, audience: "raft-client", noTimestamp: true,
  });
  await assert.rejects(
    () => verifyOidcIdToken(config(), noExp, { nonce: "n" }),
    /oidc_id_token_invalid|oidc_id_token_missing_time_claims/,
  );
});

test("an expired token is rejected", async () => {
  const expired = jwt.sign(
    { sub: "u", nonce: "n", iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 },
    privatePem,
    { algorithm: "RS256", keyid: KID, issuer, audience: "raft-client" },
  );
  await assert.rejects(
    () => verifyOidcIdToken(config(), expired, { nonce: "n" }),
    /oidc_id_token_invalid/,
  );
});

test("a token signed with HS256 or alg none is rejected", async () => {
  const hs = jwt.sign({ sub: "u", nonce: "n" }, "shared-secret", { algorithm: "HS256", issuer, audience: "raft-client", expiresIn: 60 });
  await assert.rejects(() => verifyOidcIdToken(config(), hs, { nonce: "n" }), /oidc_id_token_invalid/);

  const noneToken = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "u", nonce: "n", iss: issuer, aud: "raft-client" })).toString("base64url")}.`;
  await assert.rejects(() => verifyOidcIdToken(config(), noneToken, { nonce: "n" }), /oidc_id_token_invalid/);
});

test("an unknown kid triggers one key refresh", async () => {
  const { privateKey: rotatedPrivate, publicKey: rotatedPublic } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const provider = await startProvider({
    extraKey: {
      kid: "rotated-key",
      jwk: rotatedPublic.export({ format: "jwk" }) as Record<string, unknown>,
    },
  });
  const cfg = config({ issuer: provider.url, redirectUri: "http://localhost/cb" });
  try {
    const token = jwt.sign(
      { sub: "u", nonce: "n" },
      rotatedPrivate.export({ format: "pem", type: "pkcs8" }).toString(),
      { algorithm: "RS256", keyid: "rotated-key", issuer: provider.url, audience: "raft-client", expiresIn: 60 },
    );
    const identity = await verifyOidcIdToken(cfg, token, { nonce: "n" });
    assert.equal(identity.subject, "u");
  } finally {
    provider.close();
    resetOidcCaches();
  }
});

test("multiple audiences require azp to be the client id", async () => {
  const withoutAzp = jwt.sign(
    { sub: "u", nonce: "n", aud: ["raft-client", "another-client"] },
    privatePem,
    { algorithm: "RS256", keyid: KID, issuer, expiresIn: 60 },
  );
  await assert.rejects(() => verifyOidcIdToken(config(), withoutAzp, { nonce: "n" }), /oidc_azp_mismatch/);

  const withWrongAzp = jwt.sign(
    { sub: "u", nonce: "n", aud: ["raft-client", "another-client"], azp: "another-client" },
    privatePem,
    { algorithm: "RS256", keyid: KID, issuer, expiresIn: 60 },
  );
  await assert.rejects(() => verifyOidcIdToken(config(), withWrongAzp, { nonce: "n" }), /oidc_azp_mismatch/);

  const good = jwt.sign(
    { sub: "u", nonce: "n", aud: ["raft-client", "another-client"], azp: "raft-client" },
    privatePem,
    { algorithm: "RS256", keyid: KID, issuer, expiresIn: 60 },
  );
  const identity = await verifyOidcIdToken(config(), good, { nonce: "n" });
  assert.equal(identity.subject, "u");
});

test("plain http endpoints are refused outside loopback", async () => {
  const provider = await startProvider({ httpEndpoint: true });
  try {
    await assert.rejects(
      () => buildOidcAuthorizationUrl(config({ issuer: provider.url, redirectUri: "http://localhost/cb" }), {
        state: "s", nonce: "n", codeChallenge: "c",
      }),
      /oidc_discovery_invalid:authorization_endpoint/,
    );
  } finally {
    provider.close();
    resetOidcCaches();
  }
});
