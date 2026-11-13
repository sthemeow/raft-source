import { useCallback, useState } from "react";
import { CURRENT_LEGAL_ACCEPTANCE } from "@botiverse/raft-shared";
import { Input, Button, TextSans, TextLink } from "@botiverse/raft-ui";
import type { ChangeEvent, FormEvent } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useAuthStore } from "../../store/authStore";
import { ArrowLeft } from "lucide-react";
import AuthPageFrame, { AuthPageIntro } from "./AuthPageFrame";
import Banner from "../ui/Banner";
import FormField from "../ui/FormField";
import { AUTH_MESSAGE_IDS, authServerErrorMessage } from "./authErrors";

interface ResetPasswordPageProps {
  token: string;
  onBack: () => void;
}

export default function ResetPasswordPage({ token, onBack }: ResetPasswordPageProps) {
  const { formatMessage } = useIntl();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  // The account-setup link an administrator's "create account" email sends
  // carries `setup=1`: this person has not accepted the terms yet, and is the
  // one who must accept them (#Raft-Dev:a5519ad5).
  const [isSetup] = useState(() => new URLSearchParams(window.location.search).get("setup") === "1");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState("");

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (fieldErrors.password) setFieldErrors((current) => ({ ...current, password: undefined }));
  }, [fieldErrors.password]);

  const handleConfirmPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (fieldErrors.confirmPassword) setFieldErrors((current) => ({ ...current, confirmPassword: undefined }));
  }, [fieldErrors.confirmPassword]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (password.length < 8) {
      setFieldErrors({ password: formatMessage({ id: AUTH_MESSAGE_IDS.passwordTooShort }) });
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: formatMessage({ id: AUTH_MESSAGE_IDS.passwordsDoNotMatch }) });
      return;
    }
    setTermsError("");
    if (isSetup && !acceptedTerms) {
      setTermsError(formatMessage({ id: "pages.resetPassword.termsRequired" }));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(
        token,
        password,
        isSetup
          ? {
            acceptTerms: true,
            termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
            privacyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyVersion,
          }
          : undefined,
      );
      setSuccess(true);
      // Clean up URL — drop ONLY the reset token; preserve any other query params
      // (invite/verify/etc.) so a following flow isn't silently lost.
      const url = new URL(window.location.href);
      url.searchParams.delete("reset");
      url.searchParams.delete("setup");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch (err: any) {
      setError(authServerErrorMessage(err, formatMessage({ id: "pages.resetPassword.failed" }), formatMessage));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthPageFrame>
        <div className="w-full">
          <AuthPageIntro
            title={formatMessage({ id: "pages.resetPassword.successTitle" })}
            description={formatMessage({ id: "pages.resetPassword.successDescription" })}
          />
          <Button
            onClick={onBack}
            size="xl"
            variant="accent"
            className="w-full"
          >
            <ArrowLeft size={16} />
            {formatMessage({ id: "auth.backToSignIn.button" })}
          </Button>
        </div>
      </AuthPageFrame>
    );
  }

  return (
    <AuthPageFrame>
      <div className="w-full">
        <AuthPageIntro
          title={formatMessage({ id: isSetup ? "pages.resetPassword.setupTitle" : "pages.resetPassword.title" })}
          {...(isSetup ? { description: formatMessage({ id: "pages.resetPassword.setupDescription" }) } : {})}
        />

        {error && (
          <Banner intent="warning" className="mb-4">{error}</Banner>
        )}

        <Banner intent="info" className="mb-4">{formatMessage({ id: "pages.resetPassword.deviceLoginNotice" })}</Banner>

        <form onSubmit={handleSubmit} className="stack-y-4 md:pointer-fine:stack-y-3" noValidate>
          <FormField label={formatMessage({ id: "pages.resetPassword.newPasswordLabel" })} error={fieldErrors.password}>
            <Input
              type="password"
              value={password}
              onChange={handlePasswordChange}
              data-invalid={fieldErrors.password ? true : undefined}
              placeholder={formatMessage({ id: "pages.resetPassword.passwordPlaceholder" })}
              required
            />
          </FormField>
          <FormField label={formatMessage({ id: "pages.resetPassword.confirmPasswordLabel" })} error={fieldErrors.confirmPassword}>
            <Input
              type="password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              data-invalid={fieldErrors.confirmPassword ? true : undefined}
              required
            />
          </FormField>
          {isSetup ? (
            <div>
              <label className="flex items-start gap-2 text-sans-small text-foreground-muted" data-testid="reset-terms">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => { setAcceptedTerms(e.target.checked); if (e.target.checked) setTermsError(""); }}
                  className="mt-0.5"
                />
                <span>
                  <FormattedMessage
                    id="pages.resetPassword.terms"
                    values={{
                      terms: <a href={CURRENT_LEGAL_ACCEPTANCE.termsUrl} target="_blank" rel="noreferrer" className="underline">{formatMessage({ id: "pages.resetPassword.termsLink" })}</a>,
                      privacy: <a href={CURRENT_LEGAL_ACCEPTANCE.privacyUrl} target="_blank" rel="noreferrer" className="underline">{formatMessage({ id: "pages.resetPassword.privacyLink" })}</a>,
                    }}
                  />
                </span>
              </label>
              {termsError ? <p className="mt-1 text-sans-small text-danger" role="alert">{termsError}</p> : null}
            </div>
          ) : null}
          <Button
            type="submit"
            disabled={loading}
            size="xl"
            variant="accent"
            className="w-full"
          >
            {loading
              ? formatMessage({ id: "pages.resetPassword.resetting" })
              : formatMessage({ id: "pages.resetPassword.submit" })}
          </Button>
        </form>

        <TextSans size="small" className="mt-4 text-center">
          <TextLink onClick={onBack}>
            {formatMessage({ id: "auth.backToSignIn.link" })}
          </TextLink>
        </TextSans>
      </div>
    </AuthPageFrame>
  );
}
