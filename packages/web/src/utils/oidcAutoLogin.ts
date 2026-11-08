// Silent retries are bounded per tab; an explicit logout is shared by all tabs.
const ATTEMPT_KEY = "raft.oidc.silent-attempt";
const SIGNED_OUT_KEY = "raft.oidc.explicit-signout";
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

export function buildSilentOidcUrl(startUrl: string): string {
  const url = new URL(startUrl);
  url.searchParams.set("silent", "1");
  return url.toString();
}

export function navigateToSilentOidc(startUrl: string): void {
  window.location.assign(buildSilentOidcUrl(startUrl));
}

function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function claimOidcSilentAttempt(): boolean {
  try {
    const storage = tabStorage();
    if (!storage || isOidcSilentSuppressed()) return false;
    const prior = storage.getItem(ATTEMPT_KEY);
    if (prior) {
      const previousMs = Number(prior.slice(5));
      if (!prior.startsWith("auto:") || !Number.isFinite(previousMs) || Date.now() - previousMs < RETRY_INTERVAL_MS) return false;
    }
    storage.setItem(ATTEMPT_KEY, `auto:${Date.now()}`);
    return true;
  } catch {
    return false;
  }
}

export function hasPendingOidcSilentAttempt(): boolean {
  try {
    return tabStorage()?.getItem(ATTEMPT_KEY)?.startsWith("auto:") === true;
  } catch {
    return false;
  }
}

export function isOidcSilentSuppressed(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(SIGNED_OUT_KEY) !== null;
  } catch {
    return true;
  }
}

export function prepareOidcInteractiveLogin(): void {
  try {
    tabStorage()?.removeItem(ATTEMPT_KEY);
  } catch {
    // The explicit sign-in can still proceed without storage.
  }
}

export function suppressOidcSilentAttempt(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // Unavailable localStorage already prevents silent attempts.
  }
}

export function clearOidcSilentAttempt(): void {
  try {
    tabStorage()?.removeItem(ATTEMPT_KEY);
    if (typeof window !== "undefined") window.localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // Unavailable storage already prevents silent attempts.
  }
}
