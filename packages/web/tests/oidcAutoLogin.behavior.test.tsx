import { afterEach, expect, test, vi } from "vitest";
import "./helpers/domSetup";
import { buildSilentOidcUrl, claimOidcSilentAttempt, clearOidcSilentAttempt, hasPendingOidcSilentAttempt, prepareOidcInteractiveLogin, suppressOidcSilentAttempt } from "../src/utils/oidcAutoLogin";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  clearOidcSilentAttempt();
});

test("silent start preserves the original return path and requests a silent attempt", () => {
  const url = new URL(buildSilentOidcUrl("https://raft.example/api/auth/oidc/start?returnTo=%2Fchannel&linkOnConflict=1"));
  expect(url.pathname).toBe("/api/auth/oidc/start");
  expect(url.searchParams.get("returnTo")).toBe("/channel");
  expect(url.searchParams.get("silent")).toBe("1");
});

test("a failed or cancelled attempt cannot redirect repeatedly in the same tab", () => {
  vi.useFakeTimers();
  expect(claimOidcSilentAttempt()).toBe(true);
  expect(claimOidcSilentAttempt()).toBe(false);
  vi.advanceTimersByTime(5 * 60 * 1000);
  expect(claimOidcSilentAttempt()).toBe(true);
});

test("an explicit sign-out suppresses an immediate silent sign-in", () => {
  suppressOidcSilentAttempt();
  sessionStorage.clear(); // Simulate a new tab: localStorage remains shared.
  expect(claimOidcSilentAttempt()).toBe(false);
  clearOidcSilentAttempt();
  expect(claimOidcSilentAttempt()).toBe(true);
});

test("an interactive retry is not mistaken for the prior silent attempt", () => {
  expect(claimOidcSilentAttempt()).toBe(true);
  expect(hasPendingOidcSilentAttempt()).toBe(true);
  prepareOidcInteractiveLogin();
  expect(hasPendingOidcSilentAttempt()).toBe(false);
});

test("unavailable tab storage disables auto-start rather than risking a loop", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(claimOidcSilentAttempt()).toBe(false);
});
