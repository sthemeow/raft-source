import { useState, useCallback, useEffect } from "react";
import { Input, Button, Separator, TextSans } from "@botiverse/raft-ui";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useIntl } from "react-intl";
import { CURRENT_LEGAL_ACCEPTANCE } from "@botiverse/raft-shared";
import { useAccountLinkSignIn } from "../../hooks/useAccountLinkSignIn";
import { useAuthStore } from "../../store/authStore";
import type { SocialAuthProviderId } from "../../hooks/useAuthProviders";
import { useAuthProviders } from "../../hooks/useAuthProviders";
import { buildSocialAuthStartUrl, getCurrentReturnTo, getExternalBrowserLoginUrl, isEmbeddedBrowser } from "../../utils/socialAuth";
import { claimOidcSilentAttempt, navigateToSilentOidc, prepareOidcInteractiveLogin } from "../../utils/oidcAutoLogin";
import { hasDesktopBridge } from "../../desktopRuntimeEnvironment";
import AuthPageFrame, { AuthPageIntro } from "./AuthPageFrame";
import TextLink from "../ui/TextLink";
import Banner from "../ui/Banner";
import FormField from "../ui/FormField";
import { AUTH_MESSAGE_IDS, authServerErrorMessage, isValidEmailFormat } from "./authErrors";
import OpenInBrowserSignInGuide from "./OpenInBrowserSignInGuide";
import SocialProviderButton from "./SocialProviderButton";

// Fine-print links are prose links (DS Message › rf-link): link ink, 2px
// underline, pink underline on hover.
const LEGAL_LINK_CLASS = "text-foreground-link underline decoration-2 underline-offset-2 hover:decoration-attention";

export interface AccountLinkSignIn {
  terminal: "expired" | "conflict" | null;
  restart: () => void;
  attemptId: string;
  provider: SocialAuthProviderId;
  providerLabel: string;
  email: string;
  signInMethods: { password: boolean; providers: SocialAuthProviderId[] };
  busy: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  socialSignIn: (provider: SocialAuthProviderId) => void;
  cancel: () => void;
}

interface LoginPageProps {
  accountLink?: AccountLinkSignIn;
  onSwitchToRegister?: () => void;
  onForgotPassword: () => void;
}

export default function LoginPage(props: LoginPageProps) {
  const pendingAccountLink = useAccountLinkSignIn();
  const accountLink = props.accountLink ?? pendingAccountLink;
  return <LoginPageForm key={accountLink?.attemptId ?? "ordinary-login"} {...props} accountLink={accountLink} />;
}

function LoginPageForm({ onSwitchToRegister, onForgotPassword, accountLink }: LoginPageProps) {
  const { formatMessage } = useIntl();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const { enabledProviders } = useAuthProviders();
  const [email, setEmail] = useState(accountLink?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showOpenInBrowserGuide, setShowOpenInBrowserGuide] = useState(false);

  useEffect(() => {
    const oidc = enabledProviders.find((provider) => provider.id === "oidc" && provider.autoStart === true);
    if (!oidc || accountLink || isEmbeddedBrowser() || hasDesktopBridge() || !claimOidcSilentAttempt()) return;
    navigateToSilentOidc(buildSocialAuthStartUrl("oidc", getCurrentReturnTo()));
  }, [accountLink, enabledProviders]);

  const signInProviders = accountLink ? enabledProviders.filter((provider) => accountLink.signInMethods.providers.includes(provider.id)) : enabledProviders;

  const handleSocialLogin = useCallback((providerId: SocialAuthProviderId) => {
    if (providerId === "oidc") prepareOidcInteractiveLogin();
    if (accountLink) {
      accountLink.socialSignIn(providerId);
      return;
    }
    if (isEmbeddedBrowser()) {
      setShowOpenInBrowserGuide(true);
      return;
    }
    window.location.href = buildSocialAuthStartUrl(providerId, getCurrentReturnTo());
  }, [accountLink]);

  const handleBackFromGuide = useCallback(() => {
    setShowOpenInBrowserGuide(false);
  }, []);

  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
  }, [fieldErrors.email]);

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
  }, [fieldErrors.password]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading || accountLink?.busy) return;
    setError("");
    setFieldErrors({});
    if (!isValidEmailFormat(email)) {
      setFieldErrors({ email: formatMessage({ id: AUTH_MESSAGE_IDS.invalidEmail }) });
      return;
    }
    if (!password) {
      setFieldErrors({ password: formatMessage({ id: AUTH_MESSAGE_IDS.passwordRequired }) });
      return;
    }
    try {
      if (accountLink) await accountLink.signIn(email, password);
      else await login(email, password);
    } catch (err: any) {
      setError(authServerErrorMessage(err, formatMessage({ id: "pages.login.failed" }), formatMessage));
    }
  };

  if (showOpenInBrowserGuide) {
    return (
      <OpenInBrowserSignInGuide
        loginUrl={getExternalBrowserLoginUrl()}
        onBack={handleBackFromGuide}
      />
    );
  }

  return (
    <AuthPageFrame>
      <div className="w-full">
        <AuthPageIntro title={formatMessage({ id: accountLink ? "auth.accountLink.title" : "pages.login.title" })} />

        {accountLink && !accountLink.terminal && (
          <Banner intent="warning" className="mb-4">
            {formatMessage({ id: "auth.accountLink.description" }, { provider: accountLink.providerLabel })}
          </Banner>
        )}
        {accountLink?.error && <Banner intent="warning" className="mb-4">{accountLink.error}</Banner>}

        {error && (
          <Banner intent="warning" className="mb-4">{error}</Banner>
        )}

        {(!accountLink || (!accountLink.terminal && accountLink.signInMethods.password)) && <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on" noValidate>
          <FormField label={formatMessage({ id: "pages.login.emailLabel" })} error={fieldErrors.email} htmlFor="login-email">
            <Input
              id="login-email"
              name="username"
              type="email"
              autoComplete="username"
              value={email}
              onChange={handleEmailChange}
              data-invalid={fieldErrors.email ? true : undefined}
              required
            />
          </FormField>
          <FormField
            label={formatMessage({ id: "pages.login.passwordLabel" })}
            labelAction={(
              <TextLink variant="muted" className="text-footnote" onClick={onForgotPassword}>
                {formatMessage({ id: "pages.login.forgotPassword" })}
              </TextLink>
            )}
            error={fieldErrors.password}
            htmlFor="login-password"
          >
            <Input
              id="login-password"
              name="password"
              type="password"
              autoFocus={!!accountLink}
              autoComplete="current-password"
              value={password}
              onChange={handlePasswordChange}
              data-invalid={fieldErrors.password ? true : undefined}
              required
            />
          </FormField>
          <Button
            type="submit"
            disabled={loading || accountLink?.busy}
            size="xl"
            variant="accent"
            className="w-full"
          >
            {loading || accountLink?.busy
            ? formatMessage({ id: "pages.login.signingIn" })
            : accountLink
              ? formatMessage({ id: "auth.accountLink.submit" }, { provider: accountLink.providerLabel })
              : formatMessage({ id: "pages.login.submit" })}
          </Button>
        </form>}

        {accountLink && !accountLink.terminal && !accountLink.signInMethods.password && (
          <TextLink variant="muted" className="mb-4 text-sm" onClick={onForgotPassword}>
            {formatMessage({ id: "pages.login.forgotPassword" })}
          </TextLink>
        )}

        {!accountLink?.terminal && signInProviders.length > 0 && (
          <>
            <Separator className="my-1">{formatMessage({ id: "pages.login.or" })}</Separator>
            <div className="space-y-2">
              {signInProviders.map((provider) => (
                <SocialProviderButton
                  key={provider.id}
                  disabled={accountLink?.busy}
                  providerId={provider.id}
                  label={provider.label}
                  onClick={handleSocialLogin}
                />
              ))}
            </div>
          </>
        )}

        {accountLink?.terminal === "expired" && (
          <Button type="button" variant="accent" size="xl" className="mt-4 w-full" onClick={accountLink.restart}>
            {formatMessage({ id: "auth.social.continueWith" }, { provider: accountLink.providerLabel })}
          </Button>
        )}
        {accountLink && (
          <Button type="button" variant="outline" size="lg" className="mt-4 w-full" disabled={accountLink.busy} onClick={accountLink.cancel}>
            {accountLink.terminal
              ? formatMessage({ id: "auth.backToSignIn.button" })
              : formatMessage({ id: "auth.accountLink.cancel" }, { provider: accountLink.providerLabel })}
          </Button>
        )}

        {!accountLink && onSwitchToRegister && (
          <TextSans size="small" className="mt-4 text-center">
            {formatMessage(
              { id: "pages.login.noAccountPrompt" },
              {
                create: (c: ReactNode) => (
                  <TextLink key="create" variant="primary" onClick={onSwitchToRegister}>
                    {c}
                  </TextLink>
                ),
              },
            )}
          </TextSans>
        )}

        <TextSans size="caption" className="mt-6 text-center">
          {formatMessage(
            { id: "pages.login.legalAgreement" },
            {
              terms: (c: ReactNode) => (
                <a
                  key="terms"
                  href={CURRENT_LEGAL_ACCEPTANCE.termsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={LEGAL_LINK_CLASS}
                >
                  {c}
                </a>
              ),
              privacy: (c: ReactNode) => (
                <a
                  key="privacy"
                  href={CURRENT_LEGAL_ACCEPTANCE.privacyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={LEGAL_LINK_CLASS}
                >
                  {c}
                </a>
              ),
            },
          )}
        </TextSans>
      </div>
    </AuthPageFrame>
  );
}
