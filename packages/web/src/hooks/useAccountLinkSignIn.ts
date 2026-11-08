import api from "../api/client";
import { authServerErrorMessage } from "../components/auth/authErrors";
import { useState } from "react";
import { useIntl } from "react-intl";
import { useAuthStore } from "../store/authStore";
import { accountLinkErrorCode, accountLinkHttpStatus, clearPendingAccountLink, failPendingAccountLink, usePendingAccountLink } from "../utils/pendingAccountLink";
import { buildSocialAuthStartUrl, takePendingInviteRedirectPath } from "../utils/socialAuth";
import { prepareOidcInteractiveLogin } from "../utils/oidcAutoLogin";
import type { AccountLinkSignIn } from "../components/auth/LoginPage";

export function useAccountLinkSignIn(): AccountLinkSignIn | undefined {
  const pending = usePendingAccountLink((state) => state.pending);
  const failure = usePendingAccountLink((state) => state.failure);
  const { formatMessage } = useIntl();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!pending) return undefined;
  const providerLabel = { google: "Google", github: "GitHub", apple: "Apple", oidc: "SSO" }[pending.provider];
  const failureId = failure === "pending_link_expired" ? "auth.accountLink.expired"
    : failure === "pending_link_account_mismatch" ? "auth.accountLink.mismatch"
    : failure === "provider_conflict" ? "auth.accountLink.providerConflict"
    : failure === "account_link_unconfirmed" ? "auth.accountLink.failed" : "pages.login.failed";
  const terminal = failure === "pending_link_expired" ? "expired" : failure === "provider_conflict" ? "conflict" : null;
  return {
    terminal,
    restart() {
      clearPendingAccountLink(pending.token);
      if (pending.provider === "oidc") prepareOidcInteractiveLogin();
      window.location.href = buildSocialAuthStartUrl(pending.provider, pending.returnTo);
    },
    attemptId: pending.token, provider: pending.provider, providerLabel, email: pending.email, signInMethods: pending.signInMethods, busy, error: failure ? formatMessage({ id: failureId }, { provider: providerLabel, email: pending.email }) : error,
    async signIn(email, password) {
      if (busy) return;
      setBusy(true);
      setError("");
      usePendingAccountLink.setState({ failure: null });
      try {
        await useAuthStore.getState().login(email, password, pending);
        clearPendingAccountLink(pending.token);
        window.location.replace(takePendingInviteRedirectPath() ?? pending.returnTo);
      } catch (err) {
        const code = accountLinkErrorCode(err);
        if (code?.startsWith("pending_link_") || code === "provider_conflict" || code === "account_link_unconfirmed") failPendingAccountLink(pending.token, err);
        else {
          const status = accountLinkHttpStatus(err);
          setError(status === null || status >= 500
            ? formatMessage({ id: "pages.login.failed" })
            : authServerErrorMessage(err, formatMessage({ id: "pages.login.failed" }), formatMessage));
        }
      } finally { setBusy(false); }
    },
    socialSignIn(provider) {
      if (busy) return;
      if (provider === "oidc") prepareOidcInteractiveLogin();
      window.location.href = buildSocialAuthStartUrl(provider, pending.returnTo);
    },
    cancel() {
      setBusy(true);
      setError("");
      usePendingAccountLink.setState({ failure: null });
      void api.post("/auth/pending-link/cancel", { pendingLinkToken: pending.token }).then(() => {
        clearPendingAccountLink(pending.token);
      }).catch(() => {
        setError(formatMessage({ id: "pages.login.failed" }));
      }).finally(() => setBusy(false));
    },
  };
}
