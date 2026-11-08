import { assertAccountLinkCompleted, clearPendingAccountLink, failPendingAccountLink, pendingAccountLinkFromError, setPendingAccountLink, usePendingAccountLink } from "../../utils/pendingAccountLink";
import LoginPage from "./LoginPage";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { AxiosResponse } from "axios";
import type { PendingAccountLink } from "../../utils/pendingAccountLink";
import type { IntlShape } from "react-intl";
import { CURRENT_LEGAL_ACCEPTANCE } from "@botiverse/raft-shared";
import api from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { getExternalBrowserLoginUrl, isEmbeddedUserAgentProviderError, PENDING_INVITE_STORAGE_KEY, sanitizeReturnTo, takePendingInviteRedirectPath } from "../../utils/socialAuth";
import { completeSocialAuthWithOneLinkRefresh } from "../../utils/socialAuthCompletion";
import { clearOidcSilentAttempt, hasPendingOidcSilentAttempt, isOidcSilentSuppressed } from "../../utils/oidcAutoLogin";
import { refreshTokensWithDedupe } from "../../utils/refreshCoordinator";
import Banner from "../ui/Banner";
import { Button } from "@botiverse/raft-ui";
import type { SocialAuthProviderId } from "../../hooks/useAuthProviders";
import CenteredCardFrame from "./CenteredCardFrame";
import { AuthPageIntro } from "./AuthPageFrame";
import LegalAcceptanceCheckbox from "./LegalAcceptanceCheckbox";
import OpenInBrowserSignInGuide from "./OpenInBrowserSignInGuide";

function isSocialAuthProviderId(value: string | null): value is SocialAuthProviderId {
  return value === "google" || value === "github" || value === "apple" || value === "oidc";
}

function navigateHome() {
  window.location.replace("/");
}

function getProviderLabel(
  provider: SocialAuthProviderId | null,
  formatMessage: IntlShape["formatMessage"],
): string {
  switch (provider) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "apple":
      return "Apple";
    case "oidc":
      return "SSO";
    default:
      return formatMessage({ id: "auth.social.providerFallback" });
  }
}

interface SocialAuthCompletionData {
  mode?: string;
  accessToken?: string;
  refreshToken?: string;
  returnTo?: string;
  linkedProvider?: string;
}

export default function SocialAuthCallbackPage() {
  const { formatMessage } = useIntl();
  const setTokens = useAuthStore((state) => state.setTokens);
  const loadUser = useAuthStore((state) => state.loadUser);
  const completionEpoch = useRef(0);
  // React StrictMode replays effect setup. Both observers must share the same
  // one-time exchange and its original continuation; only the live observer acts.
  const initialCompletion = useRef<{
    pendingLink: PendingAccountLink | null;
    result: Promise<AxiosResponse<SocialAuthCompletionData>>;
  } | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [error, setError] = useState("");
  const [needsLegalAcceptance, setNeedsLegalAcceptance] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const callbackParams = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const provider = searchParams.get("provider");
    return {
      provider: isSocialAuthProviderId(provider) ? provider : null,
      mode: searchParams.get("mode"),
      code: searchParams.get("code"),
      returnTo: sanitizeReturnTo(searchParams.get("returnTo")),
      error: searchParams.get("error"),
    };
  }, []);

  const finishSignIn = useCallback(async (includeLegalAcceptance: boolean) => {
    const epoch = ++completionEpoch.current;
    const isSilentOidc = callbackParams.provider === "oidc" && callbackParams.mode !== "link" && hasPendingOidcSilentAttempt();
    setFinishing(true);
    setError("");
    try {
      if (isSilentOidc && isOidcSilentSuppressed()) {
        setRecovery(true);
        return;
      }
      if (callbackParams.error) {
        const pending = callbackParams.mode === "link" ? null : usePendingAccountLink.getState().pending;
        if (pending) {
          failPendingAccountLink(pending.token, { response: { data: { code: callbackParams.error } } });
          setRecovery(true);
          return;
        }
        if (isSilentOidc
          && ["login_required", "interaction_required", "consent_required", "account_selection_required"].includes(callbackParams.error)) {
          setRecovery(true);
          return;
        }
        setError(callbackParams.error);
        return;
      }

      if (!callbackParams.provider) {
        setError(formatMessage({ id: "pages.socialCallback.providerNotSupported" }));
        return;
      }

      if (!callbackParams.code) {
        setError(formatMessage(
          { id: "pages.socialCallback.noCode" },
          { provider: getProviderLabel(callbackParams.provider, formatMessage) },
        ));
        return;
      }

      let pendingLink = callbackParams.mode === "link" ? null : usePendingAccountLink.getState().pending;
      const completionBody = {
        ...(pendingLink ? { pendingLinkToken: pendingLink.token } : {}),
        code: callbackParams.code,
        ...(includeLegalAcceptance
          ? {
              acceptTerms: true,
              termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
              privacyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyVersion,
              legalAcceptanceSource: window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY) ? "invite" : "oauth",
            }
          : {}),
      };
      const requestCompletion = () => completeSocialAuthWithOneLinkRefresh({
        mode: callbackParams.mode,
        complete: () => api.post<SocialAuthCompletionData>(`/auth/${callbackParams.provider}/complete`, completionBody),
        refresh: refreshTokensWithDedupe,
      });
      if (!includeLegalAcceptance && !initialCompletion.current) {
        initialCompletion.current = { pendingLink, result: requestCompletion() };
      }
      const completion = includeLegalAcceptance ? requestCompletion() : initialCompletion.current!.result;
      if (!includeLegalAcceptance) pendingLink = initialCompletion.current!.pendingLink;
      const { data } = await completion;

      if (epoch !== completionEpoch.current) return;

      if (data.mode === "login") {
        if (!data.accessToken || !data.refreshToken) {
          setError(formatMessage(
          { id: "pages.socialCallback.noSession" },
          { provider: getProviderLabel(callbackParams.provider, formatMessage) },
        ));
          return;
        }
        if (pendingLink) {
          assertAccountLinkCompleted(data, pendingLink);
          clearPendingAccountLink(pendingLink.token);
        }
        if (isSilentOidc && isOidcSilentSuppressed()) {
          void api.post("/auth/logout", { refreshToken: data.refreshToken }).catch(() => {});
          setRecovery(true);
          return;
        }
        if (!isSilentOidc) clearOidcSilentAttempt();
        setTokens(data.accessToken, data.refreshToken);

        const pendingInviteRedirect = takePendingInviteRedirectPath();
        if (pendingInviteRedirect) {
          // Let the normal invite page consume the token after the OAuth round-trip.
          // Loading the user here would race App's pending-invite effect with this
          // callback redirect and can drop the invite before it is accepted.
          window.location.replace(pendingInviteRedirect);
          return;
        }

        await loadUser();
        window.location.replace(sanitizeReturnTo(data.returnTo ?? callbackParams.returnTo));
        return;
      }

      if (data.mode === "link") {
        window.location.replace(sanitizeReturnTo(data.returnTo ?? callbackParams.returnTo));
        return;
      }

      setError(formatMessage({ id: "pages.socialCallback.invalidCallback" }));
    } catch (err: any) {
      if (epoch !== completionEpoch.current) return;
      const conflict = callbackParams.mode !== "link" && pendingAccountLinkFromError(err);
      if (conflict) {
        setPendingAccountLink(conflict);
        setRecovery(true);
        return;
      }
      const pending = usePendingAccountLink.getState().pending;
      if (callbackParams.mode !== "link" && pending) {
        failPendingAccountLink(pending.token, err);
        setRecovery(true);
        return;
      }
      const errorCode = err?.response?.data?.error;
      if (errorCode === "LEGAL_ACCEPTANCE_REQUIRED" || errorCode === "TERMS_CHANGED") {
        setNeedsLegalAcceptance(true);
        setError(errorCode === "TERMS_CHANGED"
          ? formatMessage({ id: "pages.socialCallback.legalChanged" })
          : "");
        return;
      }
      setError(err?.response?.data?.error || err?.message || formatMessage({ id: "pages.socialCallback.finishFailed" }));
    } finally {
      if (epoch === completionEpoch.current) setFinishing(false);
    }
  }, [callbackParams, loadUser, setTokens, formatMessage]);

  const showRecoveryForgotPassword = useCallback(() => setForgotPassword(true), []);
  const showRecoveryLogin = useCallback(() => setForgotPassword(false), []);

  const handleFinishWithLegalAcceptance = useCallback(() => {
    void finishSignIn(true);
  }, [finishSignIn]);

  useLayoutEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-event-handler -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
    if (!needsLegalAcceptance && !recovery) {
      void finishSignIn(false);
    }
    return () => { completionEpoch.current += 1; };
  }, [finishSignIn, needsLegalAcceptance, recovery]);

  if (recovery) {
    return forgotPassword
      ? <ForgotPasswordPage onBack={showRecoveryLogin} />
      : <LoginPage onForgotPassword={showRecoveryForgotPassword} />;
  }

  if (isEmbeddedUserAgentProviderError(callbackParams.error)) {
    return <OpenInBrowserSignInGuide loginUrl={getExternalBrowserLoginUrl(callbackParams.returnTo)} />;
  }

  if (!needsLegalAcceptance && !error) {
    return null;
  }

  return (
    <CenteredCardFrame>
      <div className="w-full">
        <AuthPageIntro
          title={formatMessage(
            { id: "pages.socialCallback.providerSignInTitle" },
            { provider: getProviderLabel(callbackParams.provider, formatMessage) },
          )}
        />
        {needsLegalAcceptance ? (
          <div className="space-y-4">
            {error && (
              <Banner intent="warning">
                {error}
              </Banner>
            )}
            <LegalAcceptanceCheckbox
              checked={acceptedLegal}
              onChange={setAcceptedLegal}
              disabled={finishing}
            />
            <Button
              type="button"
              disabled={!acceptedLegal || finishing}
              onClick={handleFinishWithLegalAcceptance}
              size="xl"
              variant="accent"
              className="w-full"
            >
              {finishing ? formatMessage({ id: "pages.socialCallback.finishing" }) : formatMessage({ id: "pages.socialCallback.continue" })}
            </Button>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <Banner intent="warning">
              {error}
            </Banner>
            <Button size="lg"
              type="button"
              variant="outline"
              className="w-full"
              onClick={navigateHome}
            >
              {formatMessage({ id: "auth.backToSignIn.button" })}
            </Button>
          </div>
        ) : (
          <div className="text-center text-callout text-foreground-muted">{formatMessage({ id: "pages.socialCallback.finishingSignIn" })}</div>
        )}
      </div>
    </CenteredCardFrame>
  );
}
