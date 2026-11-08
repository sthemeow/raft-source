import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "./helpers/domSetup";
import { TestIntlProvider } from "./helpers/intl";
import SocialAuthCallbackPage from "../src/components/auth/SocialAuthCallbackPage";
import LoginPage from "../src/components/auth/LoginPage";
import { clearPendingAccountLink, parsePendingAccountLink, setPendingAccountLink, usePendingAccountLink } from "../src/utils/pendingAccountLink";
import { claimOidcSilentAttempt, clearOidcSilentAttempt, isOidcSilentSuppressed, suppressOidcSilentAttempt } from "../src/utils/oidcAutoLogin";

const fixture = vi.hoisted(() => ({ post: vi.fn(), login: vi.fn(), setTokens: vi.fn(), loadUser: vi.fn() }));
vi.mock("../src/api/client", () => ({ default: { post: fixture.post } }));
vi.mock("../src/store/authStore", () => {
  const state = { login: fixture.login, setTokens: fixture.setTokens, loadUser: fixture.loadUser, loading: false };
  return { useAuthStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) };
});
vi.mock("../src/hooks/useAuthProviders", () => ({ useAuthProviders: () => ({ enabledProviders: [
  { id: "google", label: "Google", enabled: true }, { id: "github", label: "GitHub", enabled: true },
] }) }));
const conflict = {
  code: "account_link_required", pendingLinkToken: "a-valid-short-lived-handle", provider: "google",
  email: "existing@example.com", expiresAt: "2099-01-01T00:00:00Z", returnTo: "/s/test",
  signInMethods: { password: true, providers: ["github"] },
};
function seed() {
  const pending = parsePendingAccountLink({ ...conflict, token: conflict.pendingLinkToken });
  if (!pending) throw new Error("invalid fixture");
  setPendingAccountLink(pending);
  return pending;
}
beforeEach(() => { vi.clearAllMocks(); setPendingAccountLink(null); clearOidcSilentAttempt(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); setPendingAccountLink(null); clearOidcSilentAttempt(); });

// Exercises the actual callback -> continuation -> shared form, not just its copy.
test("code conflict resumes the same account connection without issuing a session", async () => {
  window.history.replaceState({}, "", "/?auth_callback=social&provider=google&code=one-time-code");
  fixture.post.mockRejectedValue({ response: { status: 409, data: conflict } });
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("button", { name: "Sign in and connect Google" });
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(conflict.email);
  expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
  expect(fixture.setTokens).not.toHaveBeenCalled();
  expect(window.location.search).toBe("");
  expect(usePendingAccountLink.getState().pending?.token).toBe(conflict.pendingLinkToken);
});

test("OIDC callback sends the completion to the matching provider and does not auto-link an existing account", async () => {
  const oidcConflict = { ...conflict, provider: "oidc" };
  window.history.replaceState({}, "", "/?auth_callback=social&provider=oidc&code=one-time-code");
  fixture.post.mockRejectedValue({ response: { status: 409, data: oidcConflict } });
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("button", { name: "Sign in and connect SSO" });
  expect(fixture.post).toHaveBeenCalledWith("/auth/oidc/complete", { code: "one-time-code" });
  expect(fixture.setTokens).not.toHaveBeenCalled();
  expect(usePendingAccountLink.getState().pending?.provider).toBe("oidc");
});

test("silent OIDC login_required falls back to normal login without retrying", async () => {
  expect(claimOidcSilentAttempt()).toBe(true);
  window.history.replaceState({}, "", "/?auth_callback=social&provider=oidc&error=login_required");
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("heading", { name: "Sign In" });
  expect(fixture.post).not.toHaveBeenCalled();
  expect(fixture.setTokens).not.toHaveBeenCalled();
  expect(claimOidcSilentAttempt()).toBe(false);
});

test("a sign-out in another tab cannot be undone by an in-flight silent callback", async () => {
  expect(claimOidcSilentAttempt()).toBe(true);
  let resolveCompletion!: (value: unknown) => void;
  fixture.post.mockImplementation((path: string) => path === "/auth/oidc/complete"
    ? new Promise((resolve) => { resolveCompletion = resolve; })
    : Promise.resolve({ status: 204 }));
  window.history.replaceState({}, "", "/?auth_callback=social&provider=oidc&code=one-time-code");
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await waitFor(() => expect(fixture.post).toHaveBeenCalledWith("/auth/oidc/complete", { code: "one-time-code" }));
  suppressOidcSilentAttempt();
  await act(async () => resolveCompletion({ data: { mode: "login", accessToken: "late-access", refreshToken: "late-refresh" } }));
  await screen.findByRole("heading", { name: "Sign In" });
  expect(fixture.setTokens).not.toHaveBeenCalled();
  expect(fixture.post).toHaveBeenCalledWith("/auth/logout", { refreshToken: "late-refresh" });
});

test.each(["oidc", "google", "github", "apple"])("successful interactive %s clears explicit sign-out suppression", async (provider) => {
  suppressOidcSilentAttempt();
  window.history.replaceState({}, "", `/?auth_callback=social&provider=${provider}&code=one-time-code`);
  fixture.post.mockResolvedValue({ data: { mode: "login", accessToken: "access", refreshToken: "refresh" } });
  fixture.loadUser.mockResolvedValue(undefined);
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await waitFor(() => expect(fixture.setTokens).toHaveBeenCalledWith("access", "refresh"));
  expect(isOidcSilentSuppressed()).toBe(false);
});

test("passwordless account offers only its real original provider", () => {
  seed();
  usePendingAccountLink.setState((s) => ({ pending: s.pending && { ...s.pending, signInMethods: { password: false, providers: ["github"] } } }));
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Sign in and connect Google" })).toBeNull();
  expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
});

test("wrong-account sign-in keeps the continuation and cannot set a session", async () => {
  const pending = seed();
  fixture.login.mockRejectedValue({ response: { status: 403, data: { code: "pending_link_account_mismatch" } } });
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "original-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and connect Google" }));
  await screen.findByText(/You signed in to a different account than existing@example.com/);
  expect(fixture.login).toHaveBeenCalledWith(conflict.email, "original-password", pending);
  expect(usePendingAccountLink.getState().pending?.token).toBe(pending.token);
  expect(fixture.setTokens).not.toHaveBeenCalled();
});

test("expired continuation stops credential submission and offers fresh authorization", async () => {
  seed();
  fixture.login.mockRejectedValue({ response: { status: 410, data: { code: "pending_link_expired" } } });
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and connect Google" }));
  await screen.findByText(/This Google sign-in has expired/);
  expect(screen.queryByText(/Sign in the way you usually do/)).toBeNull();
  expect(screen.getByRole("button", { name: /Back to sign in/i })).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
});

test("cancel revokes the server handle before returning to ordinary login", async () => {
  const pending = seed();
  fixture.post.mockResolvedValue({ status: 204 });
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Don't connect Google" }));
  await waitFor(() => expect(usePendingAccountLink.getState().pending).toBeNull());
  expect(fixture.post).toHaveBeenCalledWith("/auth/pending-link/cancel", { pendingLinkToken: pending.token });
  expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
});

test("an old completion cannot clear a newer continuation", async () => {
  const old = seed();
  const next = parsePendingAccountLink({ ...old, token: "a-new-short-lived-handle" });
  if (!next) throw new Error("invalid fixture");
  await act(async () => setPendingAccountLink(next));
  clearPendingAccountLink(old.token);
  expect(usePendingAccountLink.getState().pending).toEqual(next);
});

test("original OAuth completion carries the pending connection before receiving any session", async () => {
  const pending = seed();
  window.history.replaceState({}, "", "/?auth_callback=social&provider=github&code=original-provider-code");
  fixture.post.mockRejectedValue({ response: { status: 403, data: { code: "pending_link_account_mismatch" } } });
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("button", { name: "Sign in and connect Google" });
  expect(fixture.post).toHaveBeenCalledWith("/auth/github/complete", { code: "original-provider-code", pendingLinkToken: pending.token });
  expect(fixture.setTokens).not.toHaveBeenCalled();
});

test("ordinary settings link completion never consumes a login continuation", async () => {
  const pending = seed();
  window.history.replaceState({}, "", "/?auth_callback=social&mode=link&provider=github&code=settings-code");
  fixture.post.mockRejectedValue({ response: { status: 400, data: { error: "settings failure" } } });
  render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByText("settings failure");
  expect(fixture.post).toHaveBeenCalledWith("/auth/github/complete", { code: "settings-code" });
  expect(screen.queryByRole("button", { name: "Sign in and connect Google" })).toBeNull();
  expect(usePendingAccountLink.getState().pending?.token).toBe(pending.token);
});

test("a callback that was left cannot restore a stale pending connection", async () => {
  let reject!: (error: object) => void;
  fixture.post.mockImplementation(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
  window.history.replaceState({}, "", "/?auth_callback=social&provider=google&code=abandoned-code");
  const view = render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => reject({ response: { status: 409, data: conflict } }));
  expect(usePendingAccountLink.getState().pending).toBeNull();
  expect(fixture.setTokens).not.toHaveBeenCalled();
});

test("changing the recovery page language cannot replay its one-time callback", async () => {
  fixture.post.mockRejectedValue({ response: { status: 409, data: conflict } });
  window.history.replaceState({}, "", "/?auth_callback=social&provider=google&code=consumed-code");
  const view = render(<TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("button", { name: "Sign in and connect Google" });
  view.rerender(<TestIntlProvider locale="zh-cn"><SocialAuthCallbackPage /></TestIntlProvider>);
  await screen.findByRole("button", { name: "登录并连接 Google" });
  expect(fixture.post).toHaveBeenCalledOnce();
});

test("a provider connected elsewhere offers only return, never sign-in to the other account", async () => {
  seed();
  fixture.login.mockRejectedValue({ response: { status: 409, data: { code: "provider_conflict" } } });
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and connect Google" }));
  await screen.findByText(/already connected to another Raft account/);
  expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Continue with GitHub" })).toBeNull();
  expect(screen.queryByText(/Sign in the way you usually do/)).toBeNull();
  expect(screen.getByRole("button", { name: /Back to sign in/i })).toBeTruthy();
  expect(fixture.setTokens).not.toHaveBeenCalled();
});

test.each([
  { response: { status: 500, data: { error: "session creation failed after binding" } } },
  new Error("network unavailable after request"),
])("an ambiguous login failure does not claim the provider was not connected", async (error) => {
  seed();
  fixture.login.mockRejectedValue(error);
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and connect Google" }));
  await screen.findByText("Login failed");
  expect(screen.queryByText(/We couldn't connect Google/)).toBeNull();
  expect(screen.queryByText(/session creation failed/)).toBeNull();
});

test("missing server binding confirmation uses the explicit unconfirmed-link explanation", async () => {
  seed();
  fixture.login.mockRejectedValue(new Error("ACCOUNT_LINK_NOT_COMPLETED"));
  render(<TestIntlProvider><LoginPage onForgotPassword={vi.fn()} /></TestIntlProvider>);
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in and connect Google" }));
  await screen.findByText(/We couldn't connect Google, so you haven't been signed in/);
  expect(fixture.setTokens).not.toHaveBeenCalled();
});

test("StrictMode effect replay observes one exchange of the one-time code", async () => {
  const { StrictMode } = await import("react");
  fixture.post.mockRejectedValueOnce({ response: { status: 409, data: conflict } })
    .mockRejectedValue({ response: { status: 410, data: { code: "expired" } } });
  window.history.replaceState({}, "", "/?auth_callback=social&provider=google&code=one-time-only");
  render(<StrictMode><TestIntlProvider><SocialAuthCallbackPage /></TestIntlProvider></StrictMode>);
  await screen.findByRole("button", { name: "Sign in and connect Google" });
  expect(fixture.post).toHaveBeenCalledOnce();
  expect(usePendingAccountLink.getState().pending?.token).toBe(conflict.pendingLinkToken);
});
