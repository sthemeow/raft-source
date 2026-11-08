/**
 * Native OpenID Connect provider support for self-hosted Raft.
 *
 * Deliberately separate from the Google/GitHub/Apple paths: those read a
 * profile from a userinfo endpoint, while OIDC relies on a signed ID token
 * that must be verified against the provider's published keys. Everything
 * here is driven by environment configuration so a deployment can point at
 * Authentik (or any conformant provider) without code changes.
 *
 * Security posture:
 * - authorization code flow with PKCE S256 only;
 * - ID token signature, issuer, audience, expiry and nonce all checked;
 * - the identity key is (issuer, subject); email is display data and is only
 *   treated as verified when the provider says `email_verified === true`.
 *
 * Provider setup requirements (not enforceable from here):
 * - the provider must publish RS256 signing keys in its JWKS. An Authentik
 *   application with no signing key selected advertises HS256 only, and every
 *   login will fail ID-token verification until an RSA key is chosen.
 * - the issuer must be registered exactly as configured, including any
 *   trailing slash; it is compared verbatim against discovery and the token.
 */

import { createHash, createPublicKey, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  /** Opt-in: the browser may attempt one silent (prompt=none) sign-in. */
  autoStart: boolean;
}

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface OidcAuthorizationRequest {
  state: string;
  nonce: string;
  codeChallenge: string;
  /** When true the provider is asked for `prompt=none`. */
  silent?: boolean;
  /** Forces account selection for an explicit link. */
  selectAccount?: boolean;
}

export interface OidcTokenResponse {
  idToken: string;
  accessToken?: string;
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

const DEFAULT_SCOPES = "openid email profile";
const DISCOVERY_TIMEOUT_MS = 5_000;
const JWKS_TIMEOUT_MS = 5_000;
/** Tolerated clock difference between us and the provider. */
const CLOCK_SKEW_SECONDS = 60;
/** Discovery and JWKS documents are cached briefly; keys rotate rarely. */
const CACHE_TTL_MS = 10 * 60 * 1000;

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads OIDC configuration from the environment.
 *
 * Returns null unless a complete, usable configuration is present: a partial
 * configuration is a deployment mistake and must not present a button that
 * cannot work.
 */
export function getOidcConfig(env: NodeJS.ProcessEnv = process.env): OidcConfig | null {
  const issuer = nonEmpty(env.OIDC_ISSUER);
  const clientId = nonEmpty(env.OIDC_CLIENT_ID);
  const clientSecret = nonEmpty(env.OIDC_CLIENT_SECRET);
  const redirectUri = nonEmpty(env.OIDC_REDIRECT_URI);
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  // The identity key is `<issuer>|<subject>`; a pipe inside the issuer would
  // make that pair ambiguous.
  if (issuer.includes("|")) return null;

  // Authentik's issuer always ends with "/", and both the discovery document
  // and the ID token carry it verbatim. Preserve it exactly; only the
  // discovery URL drops a trailing slash.
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scopes: nonEmpty(env.OIDC_SCOPES) ?? DEFAULT_SCOPES,
    autoStart: env.OIDC_AUTO_START === "true",
  };
}

export function isOidcConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return getOidcConfig(env) !== null;
}

/** Silent (prompt=none) start is opt-in and requires a complete configuration. */
export function isOidcAutoStartEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getOidcConfig(env)?.autoStart === true;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let discoveryCache: CacheEntry<OidcDiscovery> | null = null;
let jwksCache: (CacheEntry<Record<string, unknown>> & { issuer: string }) | null = null;

/** Test seam: drop cached documents between cases. */
export function resetOidcCaches(): void {
  discoveryCache = null;
  jwksCache = null;
}

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`oidc_document_unavailable:${response.status}`);
    }
    const body = await response.json();
    if (!body || typeof body !== "object") {
      throw new Error("oidc_document_invalid");
    }
    return body as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function requireUrl(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`oidc_discovery_missing:${field}`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`oidc_discovery_invalid:${field}`);
  }
  const isLoopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new Error(`oidc_discovery_invalid:${field}`);
  }
  return parsed.toString();
}

/**
 * Fetches and validates the discovery document.
 *
 * The issuer in the document must match the configured issuer exactly;
 * otherwise a provider could redirect us to keys it does not own.
 */
export async function getOidcDiscovery(config: OidcConfig): Promise<OidcDiscovery> {
  const now = Date.now();
  if (discoveryCache && discoveryCache.expiresAt > now && discoveryCache.value.issuer === config.issuer) {
    return discoveryCache.value;
  }
  const document = await fetchJson(
    `${config.issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
    DISCOVERY_TIMEOUT_MS,
  );
  if (document.issuer !== config.issuer) {
    throw new Error("oidc_issuer_mismatch");
  }
  const discovery: OidcDiscovery = {
    issuer: config.issuer,
    authorization_endpoint: requireUrl(document.authorization_endpoint, "authorization_endpoint"),
    token_endpoint: requireUrl(document.token_endpoint, "token_endpoint"),
    jwks_uri: requireUrl(document.jwks_uri, "jwks_uri"),
    ...(document.end_session_endpoint
      ? { end_session_endpoint: requireUrl(document.end_session_endpoint, "end_session_endpoint") }
      : {}),
  };
  discoveryCache = { value: discovery, expiresAt: now + CACHE_TTL_MS };
  return discovery;
}

/** PKCE S256: base64url(SHA-256(verifier)). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function buildOidcAuthorizationUrl(
  config: OidcConfig,
  request: OidcAuthorizationRequest,
): Promise<string> {
  const discovery = await getOidcDiscovery(config);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", request.state);
  url.searchParams.set("nonce", request.nonce);
  url.searchParams.set("code_challenge", request.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (request.silent) {
    url.searchParams.set("prompt", "none");
  } else if (request.selectAccount) {
    url.searchParams.set("prompt", "select_account");
  }
  return url.toString();
}

/**
 * Exchanges an authorization code. PKCE is mandatory: a provider that does not
 * support it is a configuration error, not something to fall back from.
 */
export async function exchangeOidcCode(
  config: OidcConfig,
  params: { code: string; codeVerifier: string },
): Promise<OidcTokenResponse> {
  const discovery = await getOidcDiscovery(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: params.codeVerifier,
    });
    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: body.toString(),
    });
    if (!response.ok) {
      throw new Error(`oidc_token_exchange_failed:${response.status}`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.id_token !== "string" || !payload.id_token) {
      throw new Error("oidc_id_token_missing");
    }
    return {
      idToken: payload.id_token,
      ...(typeof payload.access_token === "string" ? { accessToken: payload.access_token } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getJwks(
  config: OidcConfig,
  discovery: OidcDiscovery,
  options: { forceRefresh?: boolean } = {},
): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (!options.forceRefresh && jwksCache && jwksCache.issuer === config.issuer && jwksCache.expiresAt > now) {
    return jwksCache.value;
  }
  const document = await fetchJson(discovery.jwks_uri, JWKS_TIMEOUT_MS);
  const keys = document.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error("oidc_jwks_invalid");
  }
  jwksCache = { value: document, expiresAt: now + CACHE_TTL_MS, issuer: config.issuer };
  return document;
}

function findSigningKey(jwks: Record<string, unknown>, kid: string | undefined) {
  const keys = (jwks.keys as Array<Record<string, unknown>>).filter(
    (key) => key.kty === "RSA" && (key.use === undefined || key.use === "sig"),
  );
  if (keys.length === 0) throw new Error("oidc_jwks_no_signing_key");
  const selected = kid ? keys.find((key) => key.kid === kid) : keys[0];
  if (!selected) throw new Error("oidc_jwks_unknown_kid");
  return createPublicKey({ key: selected as unknown as JsonWebKey, format: "jwk" });
}

/**
 * Verifies an ID token and returns the identity it asserts.
 *
 * `nonce` must be the value we stored when the flow started; a token whose
 * nonce does not match is a replay and is rejected.
 */
export async function verifyOidcIdToken(
  config: OidcConfig,
  idToken: string,
  expected: { nonce: string },
): Promise<OidcIdentity> {
  const discovery = await getOidcDiscovery(config);
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded !== "object" || !decoded.header) {
    throw new Error("oidc_id_token_malformed");
  }
  let jwks = await getJwks(config, discovery);
  let publicKey;
  try {
    publicKey = findSigningKey(jwks, decoded.header.kid);
  } catch (error) {
    // A rotated key shows up as an unknown kid; refetch once so the cache
    // cannot lock a deployment out for its whole TTL.
    if (error instanceof Error && error.message === "oidc_jwks_unknown_kid") {
      jwks = await getJwks(config, discovery, { forceRefresh: true });
      publicKey = findSigningKey(jwks, decoded.header.kid);
    } else {
      throw error;
    }
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: CLOCK_SKEW_SECONDS,
    }) as jwt.JwtPayload;
  } catch (error) {
    const code = error instanceof Error ? error.name : "unknown";
    throw new Error(`oidc_id_token_invalid:${code}`);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("oidc_id_token_missing_subject");
  }
  if (payload.nonce !== expected.nonce) {
    throw new Error("oidc_nonce_mismatch");
  }
  // OIDC requires both claims; jsonwebtoken does not insist on either.
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    throw new Error("oidc_id_token_missing_time_claims");
  }
  // With more than one audience, the token must name the party it was issued
  // to, and that party must be us.
  if (Array.isArray(payload.aud) && payload.aud.length > 1) {
    if (payload.azp !== config.clientId) {
      throw new Error("oidc_azp_mismatch");
    }
  }

  const email = typeof payload.email === "string" && payload.email ? payload.email : null;
  // Only a literal boolean true counts. Authentik's default mapping marks
  // email as unverified, and strings such as "true" are not a verification
  // claim we are willing to trust for account matching.
  const emailVerified = payload.email_verified === true;

  const name = typeof payload.name === "string" ? payload.name : null;
  const picture = typeof payload.picture === "string" ? payload.picture : null;

  return {
    issuer: config.issuer,
    subject: payload.sub,
    email,
    emailVerified,
    displayName: name,
    avatarUrl: picture,
  };
}

/** Stable identity key stored in `user_auth_identities.provider_user_id`. */
export function oidcProviderUserId(identity: Pick<OidcIdentity, "issuer" | "subject">): string {
  return `${identity.issuer}|${identity.subject}`;
}
