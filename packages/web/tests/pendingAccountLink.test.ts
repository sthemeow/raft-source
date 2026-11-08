import { expect, test } from "vitest";
import { assertAccountLinkCompleted, parsePendingAccountLink, pendingAccountLinkFromError, setPendingAccountLink } from "../src/utils/pendingAccountLink";
const payload = {
  token: "a-short-lived-server-handle", provider: "google", email: "existing@example.com",
  expiresAt: "2099-01-01T00:00:00Z", returnTo: "https://untrusted.example/path",
  signInMethods: { password: false, providers: ["github"] },
};
test("network boundary accepts only typed continuation handles and sign-in methods", () => {
  expect(parsePendingAccountLink(payload)?.returnTo).toBe("/");
  expect(parsePendingAccountLink({ ...payload, token: "bad token" })).toBeNull();
  expect(parsePendingAccountLink({ ...payload, provider: "unknown" })).toBeNull();
  expect(parsePendingAccountLink({ ...payload, expiresAt: "invalid" })).toBeNull();
  expect(parsePendingAccountLink({ ...payload, signInMethods: { password: false, providers: ["unknown"] } })).toBeNull();
});
test("OIDC account conflicts can require explicit account linking", () => {
  const pending = parsePendingAccountLink({ ...payload, provider: "oidc", signInMethods: { password: false, providers: ["oidc"] } });
  expect(pending?.provider).toBe("oidc");
  expect(pending?.signInMethods.providers).toEqual(["oidc"]);
  expect(parsePendingAccountLink({ ...payload, provider: "oidc", signInMethods: { password: false, providers: ["untrusted-provider"] } })).toBeNull();
});
test("legacy conflicts and ordinary failures cannot become a link continuation", () => {
  expect(pendingAccountLinkFromError({ response: { data: { code: "account_conflict", ...payload } } })).toBeNull();
  expect(pendingAccountLinkFromError(new Error("account_link_required"))).toBeNull();
  expect(pendingAccountLinkFromError({ response: { data: { ...payload, code: "account_link_required", pendingLinkToken: payload.token } } })?.token).toBe(payload.token);
});

test("a session is publishable only with the expected binding and the live attempt", () => {
  const pending = parsePendingAccountLink(payload);
  if (!pending) throw new Error("invalid fixture");
  setPendingAccountLink(pending);
  expect(() => assertAccountLinkCompleted({ linkedProvider: "google" }, pending)).not.toThrow();
  expect(() => assertAccountLinkCompleted({ accessToken: "unbound-session" }, pending)).toThrow("ACCOUNT_LINK_NOT_COMPLETED");
  expect(() => assertAccountLinkCompleted({ linkedProvider: "github" }, pending)).toThrow("ACCOUNT_LINK_NOT_COMPLETED");
  setPendingAccountLink(null);
  expect(() => assertAccountLinkCompleted({ linkedProvider: "google" }, pending)).toThrow("ACCOUNT_LINK_NOT_COMPLETED");
});
