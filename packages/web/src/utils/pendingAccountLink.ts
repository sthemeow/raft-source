import { create } from "zustand";
import type { SocialAuthProviderId } from "../hooks/useAuthProviders";
import { sanitizeReturnTo } from "./socialAuth";

/** Short-lived server handle; never an OAuth access token or an email address. */
export type PendingAccountLinkToken = string & { readonly __pendingAccountLinkToken: unique symbol };
export interface PendingAccountLink {
  token: PendingAccountLinkToken;
  provider: SocialAuthProviderId;
  returnTo: string;
  email: string;
  expiresAt: string;
  signInMethods: { password: boolean; providers: SocialAuthProviderId[] };
}
const STORAGE_KEY = "raft.pending-account-link";

// Network/storage adapter: only this boundary constructs the opaque handle.
export function parsePendingAccountLink(value: unknown): PendingAccountLink | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.token !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(data.token)) return null;
  if (data.provider !== "google" && data.provider !== "github" && data.provider !== "apple" && data.provider !== "oidc") return null;
  if (typeof data.email !== "string" || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt))) return null;
  const methods = data.signInMethods;
  if (!methods || typeof methods !== "object") return null;
  const m = methods as Record<string, unknown>;
  if (typeof m.password !== "boolean" || !Array.isArray(m.providers) || !m.providers.every((v) => v === "google" || v === "github" || v === "apple" || v === "oidc")) return null;
  return {
    email: data.email, expiresAt: data.expiresAt,
    signInMethods: { password: m.password, providers: m.providers as SocialAuthProviderId[] },
    token: data.token as PendingAccountLinkToken,
    provider: data.provider,
    returnTo: sanitizeReturnTo(typeof data.returnTo === "string" ? data.returnTo : "/"),
  };
}

function readStored(): PendingAccountLink | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pending = parsePendingAccountLink(JSON.parse(raw));
    if (!pending) sessionStorage.removeItem(STORAGE_KEY);
    return pending;
  } catch { return null; }
}

export const usePendingAccountLink = create<{ pending: PendingAccountLink | null; failure: string | null }>(() => ({ pending: readStored(), failure: null }));

export function setPendingAccountLink(pending: PendingAccountLink | null): void {
  try {
    if (pending) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The desktop continuation still works in-memory when session storage is unavailable.
  }
  usePendingAccountLink.setState({ pending, failure: null });
}

/** A stale attempt cannot consume a successor's continuation. */
export function clearPendingAccountLink(token: PendingAccountLinkToken): void {
  if (usePendingAccountLink.getState().pending?.token === token) setPendingAccountLink(null);
}

/** Parse the opt-in conflict response; legacy errors remain ordinary failures. */
export function pendingAccountLinkFromError(error: unknown): PendingAccountLink | null {
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = error.response;
  if (!response || typeof response !== "object" || !("data" in response)) return null;
  const data = response.data;
  if (!data || typeof data !== "object" || !("code" in data) || data.code !== "account_link_required" || !("pendingLinkToken" in data)) return null;
  return parsePendingAccountLink({ ...data, token: data.pendingLinkToken });
}

export function accountLinkErrorCode(error: unknown): string | null {
  if (error instanceof Error && error.message === "ACCOUNT_LINK_NOT_COMPLETED") return "account_link_unconfirmed";
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = error.response;
  if (!response || typeof response !== "object" || !("data" in response)) return null;
  const data = response.data;
  return data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : null;
}
export function failPendingAccountLink(token: PendingAccountLinkToken, error: unknown): void {
  if (usePendingAccountLink.getState().pending?.token === token) {
    usePendingAccountLink.setState({ failure: accountLinkErrorCode(error) ?? "failed" });
  }
}

/** Never publish a session from an older server that ignored the continuation. */
export function assertAccountLinkCompleted(data: unknown, pending: PendingAccountLink): void {
  if (usePendingAccountLink.getState().pending?.token !== pending.token
    || !data || typeof data !== "object" || !("linkedProvider" in data) || data.linkedProvider !== pending.provider) {
    throw new Error("ACCOUNT_LINK_NOT_COMPLETED");
  }
}

export function accountLinkHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("response" in error)) return null;
  const response = error.response;
  return response && typeof response === "object" && "status" in response && typeof response.status === "number" ? response.status : null;
}
