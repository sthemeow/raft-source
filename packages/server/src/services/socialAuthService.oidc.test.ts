import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, test } from "vitest";

import { buildAuthorizationUrl } from "./socialAuthService";
import { resetOidcCaches } from "./oidcProvider";

let server: Server;
let issuer: string;

function setEnv(overrides: Record<string, string | undefined>): void {
  const keys = ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI", "OIDC_AUTO_START"];
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      if (req.url === "/.well-known/openid-configuration") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        }));
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
});

beforeEach(() => {
  resetOidcCaches();
});

afterAll(() => {
  server?.close();
  setEnv({});
});

test("OIDC start requires a PKCE challenge", async () => {
  setEnv({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
  });
  await assert.rejects(
    () => buildAuthorizationUrl("oidc", "state", "login", "nonce"),
    /oidc_code_challenge_required/,
  );
});

test("silent is ignored unless the deployment opted in", async () => {
  setEnv({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
  });
  const url = new URL(await buildAuthorizationUrl("oidc", "state", "login", "nonce", {
    codeChallenge: "challenge",
    silent: true,
  }));
  assert.equal(url.searchParams.get("prompt"), null);
});

test("silent becomes prompt=none only when autoStart is on", async () => {
  setEnv({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    OIDC_AUTO_START: "true",
  });
  const url = new URL(await buildAuthorizationUrl("oidc", "state", "login", "nonce", {
    codeChallenge: "challenge",
    silent: true,
  }));
  assert.equal(url.searchParams.get("prompt"), "none");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("an explicit link never uses prompt=none", async () => {
  setEnv({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "secret",
    OIDC_REDIRECT_URI: "http://localhost/api/auth/oidc/callback",
    OIDC_AUTO_START: "true",
  });
  const url = new URL(await buildAuthorizationUrl("oidc", "state", "link", "nonce", {
    codeChallenge: "challenge",
    silent: true,
  }));
  assert.equal(url.searchParams.get("prompt"), "select_account");
});

test("oidc stays unavailable when configuration is incomplete", async () => {
  setEnv({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "client",
  });
  await assert.rejects(
    () => buildAuthorizationUrl("oidc", "state", "login", "nonce", { codeChallenge: "challenge" }),
    /OIDC is not configured/,
  );
});
