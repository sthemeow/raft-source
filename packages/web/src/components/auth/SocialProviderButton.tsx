import { useCallback } from "react";
import { useIntl } from "react-intl";
import { Button } from "@botiverse/raft-ui";
import { ShieldCheck } from "lucide-react";
import type { SocialAuthProviderId } from "../../hooks/useAuthProviders";
import { AppleLogo, GitHubLogo, GoogleLogo } from "../icons/ProviderLogos";

const SOCIAL_BUTTON_BASE = "w-full gap-3";

export default function SocialProviderButton({
  providerId,
  label,
  onClick,
  disabled,
}: {
  disabled?: boolean;
  providerId: SocialAuthProviderId;
  label: string;
  onClick: (providerId: SocialAuthProviderId) => void;
}) {
  const { formatMessage } = useIntl();
  const handleClick = useCallback(() => {
    onClick(providerId);
  }, [onClick, providerId]);
  const logo = providerId === "google"
    ? <GoogleLogo />
    : providerId === "github"
      ? <GitHubLogo />
      : providerId === "apple"
        ? <AppleLogo />
        : <ShieldCheck aria-hidden="true" className="size-5" />;

  return (
    <Button
      disabled={disabled}
      type="button"
      variant="outline"
      size="lg"
      className={SOCIAL_BUTTON_BASE}
      onClick={handleClick}
    >
      {logo}
      <span>{formatMessage({ id: "auth.social.continueWith" }, { provider: label })}</span>
    </Button>
  );
}
