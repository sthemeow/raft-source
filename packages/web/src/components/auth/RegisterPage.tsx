import { useCallback, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useIntl } from "react-intl";
import { Button, Input, Separator, TextSans } from "@botiverse/raft-ui";
import { CURRENT_LEGAL_ACCEPTANCE } from "@botiverse/raft-shared";
import { useAuthStore } from "../../store/authStore";
import type { AuthProvider, SocialAuthProviderId } from "../../hooks/useAuthProviders";
import { prepareOidcInteractiveLogin } from "../../utils/oidcAutoLogin";
import { useAuthProviders } from "../../hooks/useAuthProviders";
import {
  buildSocialAuthStartUrl,
  getCurrentReturnTo,
  getExternalBrowserLoginUrl,
  isEmbeddedBrowser,
  PENDING_INVITE_STORAGE_KEY,
} from "../../utils/socialAuth";
import AuthPageFrame, { AuthPageIntro } from "./AuthPageFrame";
import TextLink from "../ui/TextLink";
import Banner from "../ui/Banner";
import FormField from "../ui/FormField";
import LegalAcceptanceCheckbox from "./LegalAcceptanceCheckbox";
import OpenInBrowserSignInGuide from "./OpenInBrowserSignInGuide";
import SocialProviderButton from "./SocialProviderButton";
import { AUTH_MESSAGE_IDS, authServerErrorMessage, isValidEmailFormat } from "./authErrors";

interface RegisterPageProps {
  onSwitchToLogin: () => void;
  previewProviders?: AuthProvider[];
}

export default function RegisterPage({ onSwitchToLogin, previewProviders }: RegisterPageProps) {
  const { formatMessage } = useIntl();
  const register = useAuthStore((state) => state.register);
  const loading = useAuthStore((state) => state.loading);
  const { enabledProviders: configuredProviders } = useAuthProviders();
  const enabledProviders = previewProviders ?? configuredProviders;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showOpenInBrowserGuide, setShowOpenInBrowserGuide] = useState(false);

  const handleSocialLogin = useCallback((providerId: SocialAuthProviderId) => {
    if (providerId === "oidc") prepareOidcInteractiveLogin();
    if (previewProviders) return;
    if (isEmbeddedBrowser()) {
      setShowOpenInBrowserGuide(true);
      return;
    }
    window.location.href = buildSocialAuthStartUrl(providerId, getCurrentReturnTo());
  }, [previewProviders]);

  const handleCloseOpenInBrowserGuide = useCallback(() => {
    setShowOpenInBrowserGuide(false);
  }, []);

  const handleEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    if (fieldErrors.email) setFieldErrors((current) => ({ ...current, email: undefined }));
  }, [fieldErrors.email]);

  const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
  }, [fieldErrors.password]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    if (!isValidEmailFormat(email)) {
      setFieldErrors({ email: formatMessage({ id: AUTH_MESSAGE_IDS.invalidEmail }) });
      return;
    }
    if (password.length < 8) {
      setFieldErrors({ password: formatMessage({ id: AUTH_MESSAGE_IDS.passwordTooShort }) });
      return;
    }
    if (!acceptedLegal) {
      setError(formatMessage({ id: "pages.register.legalRequired" }));
      return;
    }

    try {
      await register(email, password, {
        acceptTerms: true,
        termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
        privacyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyVersion,
        legalAcceptanceSource: window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY) ? "invite" : "signup",
      });
    } catch (err: any) {
      setError(authServerErrorMessage(err, formatMessage({ id: "pages.register.failed" }), formatMessage));
    }
  };

  if (showOpenInBrowserGuide) {
    return (
      <OpenInBrowserSignInGuide
        loginUrl={getExternalBrowserLoginUrl()}
        onBack={handleCloseOpenInBrowserGuide}
      />
    );
  }

  return (
    <AuthPageFrame>
      <div className="w-full">
        <AuthPageIntro title={formatMessage({ id: "pages.register.title" })} />

        {error ? <Banner intent="warning" className="mb-4">{error}</Banner> : null}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on" noValidate>
          <FormField label={formatMessage({ id: "pages.register.emailLabel" })} error={fieldErrors.email} htmlFor="register-email">
            <Input
              id="register-email"
              name="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              data-invalid={fieldErrors.email ? true : undefined}
              autoComplete="email"
              required
            />
          </FormField>

          <FormField label={formatMessage({ id: "pages.register.passwordLabel" })} error={fieldErrors.password} htmlFor="register-password">
            <Input
              id="register-password"
              name="new-password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              data-invalid={fieldErrors.password ? true : undefined}
              placeholder={formatMessage({ id: "pages.register.passwordPlaceholder" })}
              autoComplete="new-password"
              required
            />
          </FormField>

          <LegalAcceptanceCheckbox
            checked={acceptedLegal}
            onChange={setAcceptedLegal}
            disabled={loading}
          />

          <Button
            type="submit"
            disabled={loading || !acceptedLegal}
            size="xl"
            variant="accent"
            className="w-full"
          >
            {loading
              ? formatMessage({ id: "pages.register.creatingAccount" })
              : formatMessage({ id: "pages.register.submit" })}
          </Button>

          {/* task #724: a disabled Continue must say why. The reason is the
              unchecked legal box, which is otherwise easy to miss; show a
              persistent reason line (never hover-only — touch has no hover),
              and only while the box is unchecked so it does not read as an
              error next to the validation text. */}
          {!acceptedLegal && !loading ? (
            <p
              className="text-center text-caption text-foreground-hint"
              data-testid="register-legal-hint"
            >
              {formatMessage({ id: "auth.legalAcceptance.requiredHint" })}
            </p>
          ) : null}
        </form>

        {enabledProviders.length > 0 ? (
          <>
            <Separator className="my-1">{formatMessage({ id: "pages.register.or" })}</Separator>
            <div className="space-y-2">
              {enabledProviders.map((provider) => (
                <SocialProviderButton
                  key={provider.id}
                  providerId={provider.id}
                  label={provider.label}
                  onClick={handleSocialLogin}
                />
              ))}
            </div>
          </>
        ) : null}

        <TextSans size="small" className="mt-4 text-center">
          {formatMessage(
            { id: "pages.register.haveAccountPrompt" },
            {
              signin: (c: ReactNode) => (
                <TextLink key="signin" variant="primary" onClick={onSwitchToLogin}>
                  {c}
                </TextLink>
              ),
            },
          )}
        </TextSans>
      </div>
    </AuthPageFrame>
  );
}
