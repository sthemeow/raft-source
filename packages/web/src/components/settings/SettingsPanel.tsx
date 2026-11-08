import { AppSetupFields, AppSetupPanel, AppSetupRequirement } from "../integrations/AppSetup";
import { AppWhenToUseField } from "./AppWhenToUseField";
import {
  ToggleGroup,
  ToggleGroupItem,
  Checkbox,
  Textarea,
  TextareaCounter,
  Skeleton,
  Badge,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  SelectTrigger,
  SelectValue,
  SegmentedControl,
  SegmentedControlItem,
  SegmentedControlLabel,
  Switch,
  Panel,
  Separator,
  DialogSurface,
  FormSection,
  Popover,
  PopoverTrigger,
  IconTile,
  ListRowGroup,
  ListRow,
  ListRowBody,
  ListRowDescription,
  ListRowTitle,
} from "@botiverse/raft-ui";
import CloseButton from "../ui/CloseButton";
import Tooltip from "../ui/Tooltip";
import { Fragment, useCallback, useState, useEffect, useEffectEvent, useMemo, useReducer, useRef } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Check,
  Copy,
  Plus,
  Bot,
  User,
  Users,
  Mail,
  Shield,
  Bell,
  Building2,
  Clock,
  Languages,
  X,
  CreditCard,
  AlertTriangle,
  Eye,
  Link2,
  ExternalLink,
  Trash2,
  LogOut,
  Upload,
  FileText,
  Tag,
  Type,
  FlaskConical,
  LayoutGrid,
  List,
  Smartphone,
  Monitor,
  Globe,
  Hash,
} from "lucide-react";
import MobileDownloadQr from "./MobileDownloadQr";
import DesktopDownloadOptions from "./DesktopDownloadOptions";
import { MOBILE_DOWNLOAD_CHOOSER_PATH, mobileDownloadUrl } from "../../utils/mobileDownloadUrl";
import { getApiErrorResponse } from "../../utils/apiErrorResponse";
import { normalizeAppSetupUrl,
  DEFAULT_BILLING_INTERVAL,
  DOWNGRADE_GRACE_PERIOD_DAYS,
  OAUTH_CLIENT_CATEGORIES,
  PROVIDER_CONNECTIONS_FEATURE_FLAG_KEY,
  PUBLIC_SERVER_FEATURE_FLAG_KEY,
  SERVER_GUEST_FEATURE_FLAG_KEY,
  SERVER_LABS_UI_FEATURE_FLAG_KEY,
  SLACK_BRIDGE_FEATURE_FLAG_KEYS,
  getEffectiveLimits,
  getFinitePlanLimitExcess,
  renderThirdPartyInertText,
  buildIntegrationInviteUrl,
  isAppWhenToUseTooLong,
  APP_WHEN_TO_USE_MAX_CODE_POINTS,
} from "@botiverse/raft-shared";
import type {
  BillingInterval,
  OAuthClientCategory,
  ServerRole,
  TimeFormatPreference,
} from "@botiverse/raft-shared";
import { useAuthStore } from "../../store/authStore";
import { useServerStore } from "../../store/serverStore";
import {
  SERVER_NOTIFICATION_PREFS_UPDATED_EVENT,
} from "../../store/events/notificationPrefsEvents";
import type {
  ServerNotificationPrefsUpdatedDetail,
} from "../../store/events/notificationPrefsEvents";
import { useAgentStore } from "../../store/agentStore";
import { requestServerSelection } from "../../utils/serverSelectionRequest";
import { useMobileBack } from "../../hooks/useAppNavigate";
import { useServerPermissions } from "../../hooks/useServerPermissions";
import { useTimeFormatter } from "../../hooks/useTimeFormatter";
import ConfirmDialog from "../ConfirmDialog";
import Modal from "../Modal";
import Banner from "../ui/Banner";
import { FormDialog } from "../ui/FormDialog";
import api from "../../api/client";
import { isElectronDesktopShell, shareableWebOrigin } from "../../utils/desktopShell";
import { useIntl } from "react-intl";
import type { IntlShape } from "react-intl";
import type { MessageId } from "../../i18n/messages";
import { useLocale } from "../../i18n/LocaleProvider";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "../../i18n/locale";
import type { Locale } from "../../i18n/locale";
import { persistDisplayLanguage } from "../../i18n/persistDisplayLanguage";
import { WEB_APP_VERSION } from "../../utils/webAppVersion";
import { bumpServerSetupRevision } from "../onboarding/serverSetupProjection";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermissionState,
  isPushServerConfigured,
  isPushSubscribed,
  sendTestPushNotification,
} from "../../utils/pushNotifications";
import { resolveNotificationChannel } from "../../utils/notificationChannel";
import type { NotificationChannel, NotificationUnsupportedReason } from "../../utils/notificationChannel";
import { isDesktopNativeNotificationsAvailable, showDesktopTestNotification } from "../../utils/desktopNativeNotifications";
import { avatarUploadApiErrorMessage, isAvatarFileTooLarge, isAvatarTooLargeError, PROFILE_AVATAR_ACCEPT } from "../../utils/avatarUpload";
import PanelHeader from "../ui/PanelHeader";
import SectionEyebrow from "../ui/SectionEyebrow";
import SectionHeader from "../ui/SectionHeader";
import { UsageDataSettingsCard, WorkspaceProductAnalyticsSection } from "./UsageDataSettings";
import CopyButton from "../ui/CopyButton";
import FormField from "../ui/FormField";
import AvatarSlot from "../ui/AvatarSlot";
import AvatarEditVeil from "../ui/AvatarEditVeil";
import SelectionPopover from "../ui/SelectionPopover";
import SurfaceListItem from "../ui/SurfaceListItem";
import SlugInput, { PrefixedInput } from "../ui/SlugInput";
import DeleteServerConfirmDialog from "./DeleteServerConfirmDialog";
import {
  AGENT_INBOUND_NEGATIVE_CAPABILITY_ID,
  AGENT_DIRECTORY_OAUTH_SCOPES,
  AGENT_INBOUND_OAUTH_SCOPES,
  DEFAULT_DECLARED_OAUTH_SCOPES,
  IDENTITY_OAUTH_SCOPES,
  OPTIONAL_IDENTITY_OAUTH_SCOPES,
  OAUTH_SCOPE_PRESENTATION,
  hasAgentInboundOAuthScope,
  normalizeDeclaredOAuthScopes,
  scopeGroupLabelId,
} from "../../lib/oauthScopePresentation";
import type {
  OAuthScopeTier,
  RaftOAuthScopeId,
} from "../../lib/oauthScopePresentation";
import MessageItem from "../message/MessageItem";
import type { MentionEntry } from "../message/MessageItem";
import { PwaInstallSettingsCard } from "../pwa/PwaInstallPrompt";
import ArchivedChannelsSection from "./ArchivedChannelsSection";
import ArchivedAgentsSection from "./ArchivedAgentsSection";
import IMBridgesSettingsSection from "./IMBridgesSettingsSection";
import { isSlackBridgeSurfaceEnabled } from "./slackBridgeVisibility";
import { useAuthProviders } from "../../hooks/useAuthProviders";
import type { AuthProvider, SocialAuthProviderId } from "../../hooks/useAuthProviders";
import type { Message } from "../../store/messageStore";
import type { Agent } from "../../store/agentStore";
import { useChannelStore } from "../../store/channelStore";
import { hasChatSurfaces } from "../../embed";
import type { Channel } from "../../store/channelStore";
import {
  getAdminCandidatePrincipals,
  getAdminPrincipalKey,
  getAdminPrincipalLabel,
  getAdminPrincipalRoleOptions,
  getAdminPrincipals,
} from "../../utils/serverAdminSettings";
import type {
  ServerAdminSettingsPrincipal,
} from "../../utils/serverAdminSettings";
import {
  createServerLabEnrollmentMutation,
  createServerLabMasterMutation,
  getServerLabSettingsAuthority,
  isServerLabEnrollmentEditable,
  normalizeServerLabSettingsReadback,
} from "../../utils/serverLabsSettings";
import type {
  CanonicalServerLabSettingsReadback,
  ServerLabSettingsReadback,
} from "../../utils/serverLabsSettings";
import { refreshServerFeatureFlags, useServerFeatureFlag } from "../../store/serverFeatureFlags";
import {
  beginServerLabsMutation,
  createServerLabsStoreContext,
  failServerLabsMutation,
  loadServerLabsSettings,
  publishServerLabsReadback,
  useServerLabsSettingsSnapshot,
} from "../../store/serverLabsSettingsStore";
import type {
  ServerLabsStoreContext,
} from "../../store/serverLabsSettingsStore";
import { getTimezoneOptions, getTranslationLanguageOptions, useTranslationStore } from "../../store/translationStore";
import type { PreferredTranslationMode } from "../../store/translationStore";
import AgreementBody from "../server/AgreementBody";
import { AppleLogo, GitHubLogo, GoogleLogo } from "../icons/ProviderLogos";
import {
  useAppearanceStore,
} from "../../store/appearanceStore";
import {
  ConnectedAppsTabSegmentedControl,
  MessageBodyFontSizeSegmentedControl,
} from "./SettingsSegmentedControls";
import type {
  ConnectedAppsTab,
} from "./SettingsSegmentedControls";
import {
  SETTINGS_TAB_TITLE_ID,
  canOpenSettingsTab,
  normalizeSettingsTab,
} from "./settingsNavigation";
import {
  ConnectedAppsErrorBanner,
  CONNECTED_APPS_ERROR_FORM,
  CONNECTED_APPS_ERROR_LISTING,
  CONNECTED_APPS_ERROR_PAGE,
  getConnectedAppsErrorSurface,
} from "./connectedAppsErrorSurface";
import SettingsProfileCard from "./SettingsProfileCard";
import { LazyAboutFeedbackPanel } from "./LazyAboutFeedbackDialog";
import { AgentMcpTab } from "../agent/AgentMcpTab";
import AppearanceThemePicker from "./AppearanceThemePicker";
import { useOptionalAppTheme } from "../../hooks/useAppTheme";
import ProviderConnectionsSettings from "./ProviderConnectionsSettings";
import { ProviderAccountRow } from "./ProviderAccountRow";
import { ServerLabRow } from "./ServerLabRow";
import { AdminPrincipalRow } from "./AdminPrincipalRow";
import { PendingInviteRow } from "./PendingInviteRow";
import { JoinLinkRow } from "./JoinLinkRow";
import { PlanSectionContent } from "./PlanSectionContent";
import { DeclaredScopeToggle } from "./DeclaredScopeToggle";
import { InstalledConnectedAppItem } from "./InstalledConnectedAppItem";
import { RegisteredConnectedAppItem } from "./RegisteredConnectedAppItem";
import {
  AppNotificationRequestSummary,
  DeveloperAppNotifications,
  DeveloperAppPermissions,
  InstalledAppNotifications,
} from "./AppNotificationsControls";
import type {
  AppNotificationSelection,
  AppNotificationsDeveloperState,
} from "./AppNotificationsControls";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function getSelectMenuOptions(
  options: readonly SelectOption[],
  value: string,
  {
    hideSelectedOption = false,
    hiddenOptionValues = [],
  }: {
    hideSelectedOption?: boolean;
    hiddenOptionValues?: readonly string[];
  } = {},
) {
  const hiddenValues = new Set(hiddenOptionValues);
  return options.filter((option) => {
    if (hiddenValues.has(option.value)) return false;
    return !(hideSelectedOption && option.value === value);
  });
}

function renderSelectItems(options: readonly SelectOption[]) {
  return options.map((option) => (
    <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
      <SelectItemText>{option.label}</SelectItemText>
      <SelectItemIndicator />
    </SelectItem>
  ));
}

const APPEARANCE_PREVIEW_AGENT: Agent = {
  id: "appearance-preview-agent",
  name: "cindy-preview",
  displayName: "Cindy",
  avatarUrl: "pixel:random:cindy-preview",
  description: null,
  status: "active",
  model: "preview",
  runtime: "preview",
  serverRole: null,
  reasoningEffort: null,
  executionMode: "cloud",
  envVars: null,
  machineId: null,
  runtimeProfile: null,
  creatorType: null,
  creatorId: null,
  creator: null,
  createdAgents: [],
  deletedAt: null,
  createdAt: "2026-05-19T00:00:00.000Z",
};

const APPEARANCE_PREVIEW_CHANNEL: Channel = {
  id: "appearance-preview-channel",
  name: "proj-uiux",
  description: null,
  type: "channel",
  createdAt: "2026-05-19T00:00:00.000Z",
};

const APPEARANCE_PREVIEW_CHANNELS: Channel[] = [APPEARANCE_PREVIEW_CHANNEL];

const APPEARANCE_PREVIEW_MENTION_MAP = new Map<string, MentionEntry>([
  ["joy", { displayName: "Joy", type: "user", id: "appearance-preview-joy" }],
]);

const PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH = 5_000;
const PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH_LABEL = "5,000";

// ── Account Section ──


export function SocialProviderIcon({ providerId }: { providerId: SocialAuthProviderId }) {
  if (providerId === "oidc") {
    return (
      <span className="inline-flex size-[18px] shrink-0 items-center justify-center text-foreground">
        <Shield aria-hidden="true" className="size-4" />
      </span>
    );
  }
  if (providerId === "google") {
    return (
      <span className="inline-flex size-[18px] shrink-0 items-center justify-center">
        <GoogleLogo className="size-4" />
      </span>
    );
  }
  if (providerId === "apple") {
    return (
      <span className="inline-flex size-[18px] shrink-0 items-center justify-center text-foreground">
        <AppleLogo className="size-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-[18px] shrink-0 items-center justify-center text-foreground">
      <GitHubLogo className="size-4" />
    </span>
  );
}

// Exported for the sub-batch-A i18n DOM smoke test: renders the Account section
// in isolation.
export function AccountSection({
  initialError,
  passwordChangeIntent = false,
}: {
  initialError?: string;
  passwordChangeIntent?: boolean;
} = {}) {
  const { formatMessage } = useIntl();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const { providers } = useAuthProviders();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [savedDisplayName, setSavedDisplayName] = useState(user?.displayName || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [linkedIdentities, setLinkedIdentities] = useState<Record<string, { providerEmail: string | null }>>({});
  const [passwordConfigured, setPasswordConfigured] = useState<boolean | null>(null);
  const [linkingProviderId, setLinkingProviderId] = useState<SocialAuthProviderId | null>(null);
  const [pendingDisconnectProvider, setPendingDisconnectProvider] = useState<AuthProvider | null>(null);
  const [passwordSetupLoading, setPasswordSetupLoading] = useState(false);
  const [passwordSetupError, setPasswordSetupError] = useState("");
  const [passwordSetupEmailSent, setPasswordSetupEmailSent] = useState(false);
  const [passwordSetupSentForProvider, setPasswordSetupSentForProvider] = useState<AuthProvider | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  // User-scoped form re-sync (NOT server-scoped, so the future
  // SettingsPanel key-remount-by-server follow-up doesn't cover this).
  // Same FP family as Cluster 2/3 form-reset effects.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    const nextDisplayName = user?.displayName || "";
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setDisplayName(nextDisplayName);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setSavedDisplayName(nextDisplayName);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setSaved(false);
  }, [user?.id, user?.displayName]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentities() {
      try {
        const { data } = await api.get("/auth/identities");
        if (cancelled) return;
        const next: Record<string, { providerEmail: string | null }> = {};
        for (const identity of data.identities ?? []) {
          if (identity?.provider) {
            next[identity.provider] = { providerEmail: identity.providerEmail ?? null };
          }
        }
        setLinkedIdentities(next);
        setPasswordConfigured(data.passwordConfigured === true);
      } catch {
        if (!cancelled) {
          setLinkedIdentities({});
          setPasswordConfigured(null);
        }
      }
    }

    void loadIdentities();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const visibleProviders = useMemo(
    () => providers.filter((provider) => provider.enabled || !!linkedIdentities[provider.id]),
    [linkedIdentities, providers],
  );
  const linkedProviderLabels = visibleProviders
    .filter((provider) => !!linkedIdentities[provider.id])
    .map((provider) => provider.label)
    .join(", ");
  const linkedIdentityCount = Object.keys(linkedIdentities).length;
  const passwordFormOpen = passwordChangeIntent || showPasswordChange;
  const pendingDisconnectRequiresPassword = !!pendingDisconnectProvider
    && linkedIdentityCount === 1
    && passwordConfigured === false;

  const applyAuthMethods = useCallback((data: {
    identities?: Array<{ provider?: string; providerEmail?: string | null }>;
    passwordConfigured?: boolean;
  }) => {
    const next: Record<string, { providerEmail: string | null }> = {};
    for (const identity of data.identities ?? []) {
      if (identity.provider) {
        next[identity.provider] = { providerEmail: identity.providerEmail ?? null };
      }
    }
    setLinkedIdentities(next);
    setPasswordConfigured(data.passwordConfigured === true);
  }, []);

  const handleConnectProvider = useCallback(async (provider: AuthProvider) => {
    setError("");
    setLinkingProviderId(provider.id);
    try {
      const { data } = await api.post(`/auth/${provider.id}/link/start`, {
        returnTo: `${window.location.pathname}${window.location.search}`,
      });
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.account.failedConnectProvider" }, { label: provider.label }));
      setLinkingProviderId(null);
    }
  }, [formatMessage]);

  const handleRequestDisconnectProvider = useCallback((provider: AuthProvider) => {
    setPasswordSetupError("");
    setPasswordSetupSentForProvider(null);
    setPendingDisconnectProvider(provider);
  }, []);

  const handleDisconnectProvider = useCallback(async (provider: AuthProvider) => {
    try {
      const { data } = await api.delete(`/auth/identities/${provider.id}`);
      applyAuthMethods(data);
      setPendingDisconnectProvider(null);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { code?: string } } };
      if (axiosError.response?.data?.code === "PASSWORD_CREDENTIAL_REQUIRED") {
        try {
          const { data } = await api.get("/auth/identities");
          applyAuthMethods(data);
        } catch {
          setPasswordConfigured(false);
        }
      }
      throw err;
    }
  }, [applyAuthMethods]);

  const userEmail = user?.email;
  const handleSendPasswordSetup = useCallback(async (provider?: AuthProvider) => {
    setPasswordSetupError("");
    setPasswordSetupLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: userEmail });
      setPasswordSetupEmailSent(true);
      setPasswordSetupSentForProvider(provider ?? null);
      setPendingDisconnectProvider(null);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setPasswordSetupError(axiosError.response?.data?.error || formatMessage({ id: "settings.account.failedSendPasswordSetup" }));
      if (provider) throw err;
    } finally {
      setPasswordSetupLoading(false);
    }
  }, [formatMessage, userEmail]);

  const handleSetPasswordByEmail = useCallback(() => {
    void handleSendPasswordSetup();
  }, [handleSendPasswordSetup]);

  const handleConfirmDisconnect = useCallback(() => {
    if (!pendingDisconnectProvider) return;
    return pendingDisconnectRequiresPassword
      ? handleSendPasswordSetup(pendingDisconnectProvider)
      : handleDisconnectProvider(pendingDisconnectProvider);
  }, [handleDisconnectProvider, handleSendPasswordSetup, pendingDisconnectProvider, pendingDisconnectRequiresPassword]);

  const handleCloseDisconnect = useCallback(() => setPendingDisconnectProvider(null), []);

  const handleDisplayNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDisplayName(e.target.value);
    setSaved(false);
  }, []);

  const handleCurrentPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value), []);
  const handleNewPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value), []);
  const handleConfirmPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value), []);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ displayName });
      setSavedDisplayName(displayName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.account.failedUpdateProfile" }));
    } finally {
      setSaving(false);
    }
  };

  const profileDirty = displayName !== savedDisplayName;

  const handleUploadAvatar = async (file: File) => {
    if (isAvatarFileTooLarge(file)) {
      setAvatarError(formatMessage({ id: "avatar.tooLarge" }, { maxLabel: formatMessage({ id: "common.fileSize.maxLabel5mb" }) }));
      return;
    }
    setAvatarError("");
    setAvatarSaving(true);
    try {
      await uploadAvatar(file);
    } catch (err: any) {
      setAvatarError(isAvatarTooLargeError(err)
        ? formatMessage({ id: "avatar.tooLarge" }, { maxLabel: formatMessage({ id: "common.fileSize.maxLabel5mb" }) })
        : avatarUploadApiErrorMessage(err, formatMessage({ id: "settings.account.failedUploadAvatar" })));
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError(formatMessage({ id: "settings.account.newPasswordTooShort" }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(formatMessage({ id: "settings.account.passwordsDoNotMatch" }));
      return;
    }

    setSaving(true);
    setPasswordSaved(false);
    try {
      await updateProfile({ currentPassword, newPassword });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSaved(false), 2000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || formatMessage({ id: "settings.account.failedChangePassword" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <SectionHeader
          className="mb-3"
          icon={<User size={16} />}
          label={formatMessage({ id: "settings.account.sectionLabel" })}
        />

        <SettingsProfileCard
          testId="account-profile-card"
          title={user?.displayName || user?.name || formatMessage({ id: "settings.account.sectionLabel" })}
          subtitle={user?.name ? `@${user.name}` : ""}
          avatar={
            <Tooltip content={avatarSaving ? formatMessage({ id: "settings.common.uploadingAvatar" }) : formatMessage({ id: "settings.common.uploadImage" })}>
            <label
              className={`group/avatar-edit relative flex shrink-0 rounded-sticker has-[:focus-visible]:shadow-focus ${avatarSaving ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <input
                type="file"
                accept={PROFILE_AVATAR_ACCEPT}
                className="peer/avatar-edit sr-only"
                aria-label={avatarSaving ? formatMessage({ id: "settings.common.uploadingAvatar" }) : formatMessage({ id: "settings.common.uploadImage" })}
                disabled={avatarSaving}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void handleUploadAvatar(file);
                }}
              />
              <AvatarSlot context="profile-tile" type="human" humanAvatarUrl={user?.avatarUrl} email={user?.email} />
              <AvatarEditVeil busy={avatarSaving} />
            </label>
            </Tooltip>
          }
        >
          {avatarError ? (
            <p className="text-caption text-danger-strong" role="alert">{avatarError}</p>
          ) : null}
          {/* Profile form */}
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <FormField label={formatMessage({ id: "settings.account.displayNameLabel" })} size="compact">
              <Input
                data-testid="account-profile-display-name-input"
                type="text"
                value={displayName}
                onChange={handleDisplayNameChange}
              />
            </FormField>
            <FormField label={formatMessage({ id: "settings.account.usernameLabel" })} size="compact">
              <PrefixedInput
                data-testid="account-profile-username-input"
                type="text"
                value={user?.name ?? ""}
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                prefix="@"
                className="border-line-hairline bg-fill-muted shadow-none focus-within:shadow-none"
                inputClassName="cursor-default text-foreground-muted"
              />
            </FormField>
            <FormField label={formatMessage({ id: "settings.account.emailLabel" })} size="compact">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate font-mono text-mono-code text-foreground">{user?.email}</span>
                {user?.emailVerified ? (
                  <Badge variant="success" appearance="soft">
                    <Shield size={10} /> {formatMessage({ id: "settings.account.verified" })}
                  </Badge>
                ) : (
                  <Badge variant="warning" appearance="soft">
                    {formatMessage({ id: "settings.account.unverified" })}
                  </Badge>
                )}
              </div>
            </FormField>

          {error && (
            <Banner intent="warning" density="sm">{error}</Banner>
          )}

            <Button
              type="submit"
              disabled={!profileDirty || saving}
              size="sm"
              variant="accent"
            >
              {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? (
                <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
              ) : formatMessage({ id: "settings.account.saveProfile" })}
            </Button>
          </form>

        {/* Divider */}
        <Separator />

        {visibleProviders.length > 0 && (
          <>
            <div>
              <div className="mb-2 text-subhead font-semibold">{formatMessage({ id: "settings.account.connectedAccounts" })}</div>
              <div className="space-y-2">
                {visibleProviders.map((provider) => (
                  <ProviderAccountRow
                    key={provider.id}
                    provider={provider}
                    identity={linkedIdentities[provider.id]}
                    linking={linkingProviderId === provider.id}
                    onConnect={handleConnectProvider}
                    onRequestDisconnect={handleRequestDisconnectProvider}
                  />
                ))}
              </div>
              {passwordSetupSentForProvider && (
                <Banner intent="success" density="sm" className="mt-3">
                  {formatMessage(
                    { id: "settings.account.passwordSetupSentForProvider" },
                    { label: passwordSetupSentForProvider.label },
                  )}
                </Banner>
              )}
            </div>

            <Separator />
          </>
        )}

        {/* Password credential */}
        <div>
          {passwordChangeIntent && passwordConfigured === null ? (
            <p className="text-footnote text-foreground-muted" role="status">
              {formatMessage({ id: "settings.account.loadingSignInMethods" })}
            </p>
          ) : passwordChangeIntent && passwordConfigured === false ? (
            <div className="space-y-2" data-testid="password-managed-by-provider">
              <div className="text-subhead font-semibold">
                {formatMessage({ id: "settings.account.passwordManagedTitle" })}
              </div>
              <p className="text-footnote text-foreground-muted">
                {formatMessage(
                  { id: "settings.account.passwordManagedDescription" },
                  {
                    providers: linkedProviderLabels
                      || formatMessage({ id: "settings.account.connectedSignInProvider" }),
                  },
                )}
              </p>
            </div>
          ) : passwordConfigured === false ? (
            <div className="space-y-3">
              <div>
                <div className="text-subhead font-semibold">{formatMessage({ id: "settings.account.setPassword" })}</div>
                <p className="mt-1 text-footnote text-foreground-muted">
                  {formatMessage({ id: "settings.account.setPasswordDescription" })}
                </p>
              </div>
              {passwordSetupError && (
                <Banner intent="warning" density="sm">{passwordSetupError}</Banner>
              )}
              {passwordSetupEmailSent && !passwordSetupSentForProvider && (
                <Banner intent="success" density="sm">
                  {formatMessage({ id: "settings.account.passwordSetupEmailSent" })}
                </Banner>
              )}
              <Button
                variant="accent" size="sm"
                type="button"
                onClick={handleSetPasswordByEmail}
                disabled={passwordSetupLoading}
              >
                {passwordSetupLoading
                  ? formatMessage({ id: "settings.account.sendingSetupEmail" })
                  : formatMessage({ id: "settings.account.setPasswordByEmail" })}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              className="-mx-1 flex items-center gap-2 rounded-control px-1 text-subhead font-semibold text-foreground outline-none hover:bg-fill-pressed focus-visible:shadow-focus"
            >
              <ChevronRight
                size={16}
                className={`text-foreground-hint transition-transform ${passwordFormOpen ? "rotate-90" : ""}`}
              />
              {formatMessage({ id: "settings.account.changePassword" })}
            </button>
          )}

          {(!passwordChangeIntent || passwordConfigured === true) && passwordFormOpen && (
            <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
              <FormField label={formatMessage({ id: "settings.account.currentPassword" })} size="compact">
                <Input
                  type="password"
                  name="current-password"
                  autoComplete="current-password"
                  aria-label={formatMessage({ id: "settings.account.currentPassword" })}
                  value={currentPassword}
                  onChange={handleCurrentPasswordChange}
                  className="w-full"
                  required
                />
              </FormField>
              <FormField label={formatMessage({ id: "settings.account.newPassword" })} size="compact">
                <Input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  aria-label={formatMessage({ id: "settings.account.newPassword" })}
                  value={newPassword}
                  onChange={handleNewPasswordChange}
                  className="w-full"
                  placeholder={formatMessage({ id: "settings.account.minCharsPlaceholder" })}
                  required
                />
              </FormField>
              <FormField label={formatMessage({ id: "settings.account.confirmPassword" })} size="compact">
                <Input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  aria-label={formatMessage({ id: "settings.account.confirmPassword" })}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  className="w-full"
                  required
                />
              </FormField>

              {passwordError && (
                <Banner intent="warning" density="sm">{passwordError}</Banner>
              )}

              {passwordSaved && (
                <Banner intent="success" density="sm" role="status">{formatMessage({ id: "settings.account.passwordUpdated" })}</Banner>
              )}

              <Button

                variant="accent" size="sm"
                type="submit"
                disabled={saving}
              >
                {saving ? formatMessage({ id: "settings.account.updating" }) : formatMessage({ id: "settings.account.changePassword" })}
              </Button>
            </form>
          )}
        </div>
        </SettingsProfileCard>
      </div>

      {pendingDisconnectProvider && (
        <ConfirmDialog
          title={formatMessage(
            {
              id: pendingDisconnectRequiresPassword
                ? "settings.account.passwordRequiredTitle"
                : "settings.account.disconnectTitle",
            },
            { label: pendingDisconnectProvider.label },
          )}
          message={formatMessage(
            {
              id: pendingDisconnectRequiresPassword
                ? "settings.account.passwordRequiredMessage"
                : "settings.account.disconnectMessage",
            },
            { label: pendingDisconnectProvider.label },
          )}
          confirmLabel={formatMessage({
            id: pendingDisconnectRequiresPassword
              ? "settings.account.sendSetupEmail"
              : "settings.account.disconnect",
          })}
          loadingLabel={formatMessage({
            id: pendingDisconnectRequiresPassword
              ? "settings.account.sendingSetupEmail"
              : "settings.account.disconnecting",
          })}
          confirmVariant={pendingDisconnectRequiresPassword
            ? "accent"
            : undefined}
          chromeLocale="active"
          onConfirm={handleConfirmDisconnect}
          onClose={handleCloseDisconnect}
        />
      )}

      {/* Log out — sibling section so it gets its own mb-6 spacing and
          renders at the same indent level as Account / Browser / Server. */}
      <AccountSignOutSection />
    </>
  );
}

function AccountSignOutSection() {
  const { formatMessage } = useIntl();
  const logout = useAuthStore((s) => s.logout);
  const [showConfirm, setShowConfirm] = useState(false);
  const handleOpenConfirm = useCallback(() => setShowConfirm(true), []);
  const handleCloseConfirm = useCallback(() => setShowConfirm(false), []);
  const handleConfirmLogout = useCallback(() => { logout(); }, [logout]);

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<LogOut size={16} />}
        label={formatMessage({ id: "settings.session.sectionLabel" })}
      />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-subhead font-semibold text-foreground">
              {formatMessage({ id: "settings.session.logOutTitle" })}
            </div>
            <p className="text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.session.logOutDescription" })}
            </p>
          </div>
          <Button
            variant="warning" size="sm"
            type="button"
            onClick={handleOpenConfirm}
            data-testid="account-logout"
            className="ml-4 shrink-0"
          >
            {formatMessage({ id: "settings.session.logOutAction" })}
          </Button>
        </div>
      </Card>

      {showConfirm && (
        <ConfirmDialog
          title={formatMessage({ id: "settings.session.confirmTitle" })}
          message={formatMessage({ id: "settings.session.confirmMessage" })}
          confirmLabel={formatMessage({ id: "settings.session.confirmLabel" })}
          loadingLabel={formatMessage({ id: "settings.session.confirmLoadingLabel" })}
          confirmVariant="warning"
          confirmTestId="account-logout-confirm-button"
          onConfirm={handleConfirmLogout}
          onClose={handleCloseConfirm}
        />
      )}
    </div>
  );
}

function NotificationsTabContent() {
  return (
    <>
      <PwaInstallSettingsCard />
      <NotificationsSection />
    </>
  );
}

interface PublicTranslationSettingsContext {
  serverId: string;
  serverSlug: string;
  translationEnabled: boolean;
  translationAvailable: boolean;
  browserLocalPreferences: boolean;
}

function LanguageRegionSection({ publicContext }: { publicContext?: PublicTranslationSettingsContext }) {
  const currentServer = useServerStore((s) => s.current);
  const translationServerId = publicContext?.serverId ?? currentServer?.id;
  const settings = useTranslationStore((s) => s.settings);
  const settingsLoading = useTranslationStore((s) => s.settingsLoading);
  const settingsError = useTranslationStore((s) => s.settingsError);
  const loadSettings = useTranslationStore((s) => s.loadSettings);
  const updatePreferredLanguage = useTranslationStore((s) => s.updatePreferredLanguage);
  const updatePreferredTimezone = useTranslationStore((s) => s.updatePreferredTimezone);
  const updatePreferredTranslationMode = useTranslationStore((s) => s.updatePreferredTranslationMode);
  const updatePreferredTranslationDisplay = useTranslationStore((s) => s.updatePreferredTranslationDisplay);
  const updatePreferredTimeFormat = useTranslationStore((s) => s.updatePreferredTimeFormat);
  const [savingLanguageRegion, setSavingLanguageRegion] = useState(false);
  const [savingDateTime, setSavingDateTime] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const [timezoneError, setTimezoneError] = useState("");
  const [translationDisplayError, setTranslationDisplayError] = useState("");
  const [timeFormatError, setTimeFormatError] = useState("");
  const savedTranslationTarget = settings.preferredLanguage ?? "browser";
  const savedTranslationMode = settings.preferredTranslationMode;
  const savedTimezone = settings.preferredTimezone ?? "";
  const savedTimeFormat = settings.effectiveTimeFormat === "24h" ? "24h" : "12h";
  const [translationTarget, setTranslationTarget] = useState(savedTranslationTarget);
  const [translationMode, setTranslationMode] = useState<PreferredTranslationMode>(savedTranslationMode);
  const [translationDisplay, setTranslationDisplay] = useState(settings.preferredTranslationDisplay);
  const [timezone, setTimezone] = useState(savedTimezone);
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(savedTimeFormat);
  const [languageRegionSaved, setLanguageRegionSaved] = useState(false);
  const [dateTimeSaved, setDateTimeSaved] = useState(false);

  // UI display language (app-chrome i18n) — distinct from the translation
  // target above. `locale` is the live client locale; `displayLanguage` is the
  // form draft and must not trigger the app-wide locale swap until Save.
  const { formatMessage } = useIntl();
  const { locale, setLocale } = useLocale();
  const [displayLanguage, setDisplayLanguage] = useState<Locale>(locale);
  const displayLanguageOptions = useMemo(
    () => SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_LABELS[code] })),
    [],
  );

  useEffect(() => {
    void loadSettings(translationServerId, publicContext);
  }, [loadSettings, publicContext, translationServerId]);

  // oxlint-disable-next-line react-doctor/no-derived-state-effect
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setDisplayLanguage(locale);
  }, [locale]);

  // Language/region and date-time form state re-sync from `saved*` props when
  // the active server changes (`currentServer?.id` in deps). This re-sync is
  // INTENTIONAL on server-switch: opening the same Settings panel under a
  // different server should reflect that server's saved values, not the
  // previous server's. The seed-once guard from PR #2532 would be wrong here
  // (it would break the server-switch re-sync).
  //
  // The mid-server "clobber" risk (user editing while saved value changes
  // externally) is theoretically present but practically near-zero —
  // savedLanguage/savedTimezone are per-user personal settings, not
  // socket-pushed multi-actor state (unlike AddMembersDialog's `members`).
  //
  // The proper React-idiomatic fix is `<SettingsPanel key={currentServer.id}>`
  // (key-remount-by-server, same pattern as HumanDetailPanel in PR #2527) to
  // remove `currentServer?.id` from these deps; tracked as a follow-up.
  // For now inline-disable so @铁根 can flip no-derived-state-effect to error.
  // @铁根 plan verdict: msg=6551077c (no-derived-state-effect disable per PR #2539).
  // Sister rules broadened for cluster-4 sweep — same FP shape.
  // oxlint-disable-next-line react-doctor/no-derived-state-effect, react-doctor/no-cascading-set-state
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setTranslationTarget(savedTranslationTarget);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setTranslationMode(savedTranslationMode);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setTranslationDisplay(settings.preferredTranslationDisplay);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setLanguageRegionSaved(false);
  }, [translationServerId, savedTranslationTarget, savedTranslationMode, settings.preferredTranslationDisplay]);

  // oxlint-disable-next-line react-doctor/no-derived-state-effect, react-doctor/no-cascading-set-state
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setTimezone(savedTimezone);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setTimeFormat(savedTimeFormat);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setDateTimeSaved(false);
  }, [translationServerId, savedTimezone, savedTimeFormat]);

  const languageOptions = useMemo(
    () => getTranslationLanguageOptions(settings.effectiveLanguage, formatMessage),
    [formatMessage, settings.effectiveLanguage],
  );
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(settings.effectiveTimezone, formatMessage),
    [formatMessage, settings.effectiveTimezone],
  );
  const hiddenTimezoneOptionValues = useMemo(
    () => [
      "",
      ...(!settings.preferredTimezone && settings.effectiveTimezone ? [settings.effectiveTimezone] : []),
    ],
    [settings.effectiveTimezone, settings.preferredTimezone],
  );
  // Keep `items` as the full collection so the trigger can resolve the current
  // value label; filter only the popup rows to preserve the old menu behavior.
  const languageMenuOptions = getSelectMenuOptions(languageOptions, translationTarget, { hideSelectedOption: true });
  const timezoneMenuOptions = getSelectMenuOptions(timezoneOptions, timezone, {
    hideSelectedOption: true,
    hiddenOptionValues: hiddenTimezoneOptionValues,
  });

  const languageRegionDirty =
    displayLanguage !== locale
    || translationTarget !== savedTranslationTarget
    || translationMode !== savedTranslationMode
    || translationDisplay !== settings.preferredTranslationDisplay;
  const dateTimeDirty = timezone !== savedTimezone || timeFormat !== savedTimeFormat;

  const handleSaveLanguageRegion = async (event: FormEvent) => {
    event.preventDefault();
    if (!languageRegionDirty) return;
    setSavingLanguageRegion(true);
    setLanguageError("");
    setTranslationDisplayError("");
    setLanguageRegionSaved(false);
    try {
      if (translationMode !== savedTranslationMode) {
        await updatePreferredTranslationMode(translationMode);
      }
      if (translationTarget !== savedTranslationTarget) {
        await updatePreferredLanguage(translationTarget === "browser" ? null : translationTarget);
      }
      if (translationDisplay !== settings.preferredTranslationDisplay) {
        await updatePreferredTranslationDisplay(translationDisplay);
      }
      if (displayLanguage !== locale) {
        await persistDisplayLanguage(displayLanguage, setLocale);
      }
      setLanguageRegionSaved(true);
      window.setTimeout(() => setLanguageRegionSaved(false), 1500);
    } catch (err: any) {
      setLanguageError(err.response?.data?.error || formatMessage({ id: "settings.language.updateFailed" }));
    } finally {
      setSavingLanguageRegion(false);
    }
  };

  const handleSaveDateTime = async (event: FormEvent) => {
    event.preventDefault();
    if (!dateTimeDirty) return;
    setSavingDateTime(true);
    setTimezoneError("");
    setTimeFormatError("");
    setDateTimeSaved(false);
    try {
      if (timezone !== savedTimezone) {
        await updatePreferredTimezone(timezone || null);
      }
      if (timeFormat !== savedTimeFormat) {
        await updatePreferredTimeFormat(timeFormat as TimeFormatPreference);
      }
      setDateTimeSaved(true);
      window.setTimeout(() => setDateTimeSaved(false), 1500);
    } catch (err: any) {
      setTimezoneError(err.response?.data?.error || formatMessage({ id: "settings.dateTime.updateFailed" }));
    } finally {
      setSavingDateTime(false);
    }
  };

  const handleDisplayLanguageChange = useCallback((next: string | null) => {
    if (next == null) return;
    setLanguageRegionSaved(false);
    setLanguageError("");
    setDisplayLanguage(next as Locale);
  }, []);

  const handleTranslationModeChange = useCallback((next: PreferredTranslationMode) => {
    setLanguageRegionSaved(false);
    setLanguageError("");
    setTranslationMode(next);
  }, []);

  const handleTranslationTargetChange = useCallback((next: string | null) => {
    if (next == null) return;
    setLanguageRegionSaved(false);
    setLanguageError("");
    setTranslationTarget(next);
  }, []);

  const handleTranslationDisplayChange = useCallback((next: "translated" | "original" | "bilingual") => {
    setLanguageRegionSaved(false);
    setTranslationDisplayError("");
    setTranslationDisplay(next);
  }, []);

  const handleTimezoneChange = useCallback((next: string | null) => {
    if (next == null) return;
    setDateTimeSaved(false);
    setTimezoneError("");
    setTimezone(next);
  }, []);

  const handleTimeFormatChange = useCallback((next: "12h" | "24h") => {
    setDateTimeSaved(false);
    setTimeFormatError("");
    setTimeFormat(next);
  }, []);

  if (!translationServerId) return null;

  return (
    <>
      <div className="mb-6">
        <SectionHeader
          className="mb-3"
          icon={<Languages size={16} />}
          label={formatMessage({ id: "settings.language.sectionLabel" })}
        />

        <Card render={<form onSubmit={handleSaveLanguageRegion} />} className="block space-y-4 p-4">
          <div className="space-y-3">
            <div>
              <div className="text-subhead font-semibold text-foreground">
                {formatMessage({ id: "settings.language.displayLanguageTitle" })}
              </div>
              <div className="text-footnote text-foreground-muted mt-0.5">
                {formatMessage({ id: "settings.language.displayLanguageDescription" })}
              </div>
            </div>
            <Select
              value={displayLanguage}
              onValueChange={handleDisplayLanguageChange}
              disabled={savingLanguageRegion || settingsLoading}
              items={displayLanguageOptions}
            >
              <SelectTrigger className="w-full max-w-sm" data-testid="display-language-select">
                <SelectValue />
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectList>
                  {renderSelectItems(displayLanguageOptions)}
                </SelectList>
              </SelectContent>
            </Select>
            {/* Rollout notice: Chinese ships namespace-by-namespace, so warn that
                some pages may still be English while zh-cn is active. en never
                shows this. Removed once all namespaces are migrated. */}
            {locale === "zh-cn" ? (
              <div className="text-footnote text-foreground-muted mt-0.5" data-testid="zh-coverage-notice">
                {formatMessage({ id: "settings.language.zhCoverageNotice" })}
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.language.translationMode" })}</div>
              <div className="text-footnote text-foreground-muted mt-0.5">
                {formatMessage({ id: "settings.language.translationModeDesc" })}
              </div>
              {/* The menu action needs the server gate AND a configured provider;
                  without this line the mode control silently does nothing. */}
              {!settingsLoading && !settings.available ? (
                <div
                  className="mt-1 text-caption font-bold text-warning-strong"
                  data-testid="translation-unavailable-notice"
                >
                  {formatMessage({
                    id: !settings.serverTranslationEnabled
                      ? settings.canManageServerTranslation
                        ? "settings.language.translationServerOffAdmin"
                        : "settings.language.translationServerOff"
                      : "settings.language.translationProviderMissing",
                  })}
                </div>
              ) : null}
            </div>
            <SegmentedControl<PreferredTranslationMode>
              value={translationMode}
              aria-label={formatMessage({ id: "settings.language.translationModeAria" })}
              onValueChange={handleTranslationModeChange}
              disabled={savingLanguageRegion || settingsLoading}
            >
              <SegmentedControlItem value="auto" data-testid="translation-mode-auto">
                <SegmentedControlLabel>{formatMessage({ id: "settings.language.modeAuto" })}</SegmentedControlLabel>
              </SegmentedControlItem>
              <SegmentedControlItem value="manual" data-testid="translation-mode-manual">
                <SegmentedControlLabel>{formatMessage({ id: "settings.language.modeManual" })}</SegmentedControlLabel>
              </SegmentedControlItem>
              <SegmentedControlItem value="off" data-testid="translation-mode-off">
                <SegmentedControlLabel>{formatMessage({ id: "settings.language.modeOff" })}</SegmentedControlLabel>
              </SegmentedControlItem>
            </SegmentedControl>
          </div>

          {translationMode !== "off" ? (
            <div className="space-y-3">
              <div>
                <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.language.translationTarget" })}</div>
                <div className="text-footnote text-foreground-muted mt-0.5">
                  {formatMessage({ id: "settings.language.translationTargetDesc" }, { language: settings.effectiveLanguage?.toUpperCase() ?? "English" })}
                </div>
              </div>
              <Select
                value={translationTarget}
                onValueChange={handleTranslationTargetChange}
                disabled={savingLanguageRegion || settingsLoading}
                items={languageOptions}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={formatMessage({ id: "settings.language.preferredLanguagePlaceholder" })} />
                  <SelectIcon />
                </SelectTrigger>
                <SelectContent>
                  <SelectList>
                    {renderSelectItems(languageMenuOptions)}
                  </SelectList>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {translationMode !== "off" ? (
            <div className="space-y-3">
              <div>
                <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.language.defaultView" })}</div>
                <div className="text-footnote text-foreground-muted mt-0.5">
                  {formatMessage({ id: "settings.language.defaultViewDesc" })}
                </div>
              </div>
              <SegmentedControl<"translated" | "original" | "bilingual">
                value={translationDisplay}
                aria-label={formatMessage({ id: "settings.language.defaultViewAria" })}
                onValueChange={handleTranslationDisplayChange}
                disabled={savingLanguageRegion || settingsLoading}
              >
                <SegmentedControlItem value="translated" data-testid="translation-display-translated">
                  <SegmentedControlLabel>{formatMessage({ id: "settings.language.displayTranslated" })}</SegmentedControlLabel>
                </SegmentedControlItem>
                <SegmentedControlItem value="original" data-testid="translation-display-original">
                  <SegmentedControlLabel>{formatMessage({ id: "settings.language.displayOriginal" })}</SegmentedControlLabel>
                </SegmentedControlItem>
                <SegmentedControlItem value="bilingual" data-testid="translation-display-bilingual">
                  <SegmentedControlLabel>{formatMessage({ id: "settings.language.displayBilingual" })}</SegmentedControlLabel>
                </SegmentedControlItem>
              </SegmentedControl>
            </div>
          ) : null}

          {(settingsError || languageError || translationDisplayError) && (
            <Banner intent="warning" density="sm">
              {translationDisplayError || languageError || settingsError}
            </Banner>
          )}
          <Button
            variant="accent" size="sm"
            type="submit"
            disabled={!languageRegionDirty || savingLanguageRegion || settingsLoading}
            className="flex items-center gap-1.5"
          >
            {savingLanguageRegion ? formatMessage({ id: "settings.common.saving" }) : languageRegionSaved ? (
              <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
            ) : formatMessage({ id: "settings.common.save" })}
          </Button>
        </Card>
      </div>

      <div className="mb-6">
        <SectionHeader
          className="mb-3"
          icon={<Clock size={16} />}
          label={formatMessage({ id: "settings.dateTime.sectionLabel" })}
        />

        <Card render={<form onSubmit={handleSaveDateTime} />} className="block space-y-4 p-4">
          <div className="space-y-3">
            <div>
              <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.dateTime.timezone" })}</div>
              <div className="text-footnote text-foreground-muted mt-0.5">
                {formatMessage({ id: "settings.dateTime.timezoneDesc" })}
              </div>
            </div>
            <Select
              value={timezone}
              onValueChange={handleTimezoneChange}
              disabled={savingDateTime || settingsLoading}
              items={timezoneOptions}
            >
              <SelectTrigger className="w-full max-w-sm">
                <SelectValue placeholder={formatMessage({ id: "settings.dateTime.timezonePlaceholder" })} />
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectList>
                  {renderSelectItems(timezoneMenuOptions)}
                </SelectList>
              </SelectContent>
            </Select>
            <div>
              <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.dateTime.timeFormat" })}</div>
              <div className="text-footnote text-foreground-muted mt-0.5">
                {formatMessage({ id: "settings.dateTime.timeFormatDesc" })}
              </div>
            </div>
            <SegmentedControl<"12h" | "24h">
              value={timeFormat}
              aria-label={formatMessage({ id: "settings.dateTime.timeFormatAria" })}
              onValueChange={handleTimeFormatChange}
              disabled={savingDateTime || settingsLoading}
            >
              <SegmentedControlItem value="12h" data-testid="time-format-12h">
                <SegmentedControlLabel>{formatMessage({ id: "settings.dateTime.formatTwelveHour" })}</SegmentedControlLabel>
              </SegmentedControlItem>
              <SegmentedControlItem value="24h" data-testid="time-format-24h">
                <SegmentedControlLabel>{formatMessage({ id: "settings.dateTime.formatTwentyFourHour" })}</SegmentedControlLabel>
              </SegmentedControlItem>
            </SegmentedControl>
          </div>

          {(settingsError || timezoneError || timeFormatError) && (
            <Banner intent="warning" density="sm">
              {timezoneError || timeFormatError || settingsError}
            </Banner>
          )}
          <Button
            variant="accent" size="sm"
            type="submit"
            disabled={!dateTimeDirty || savingDateTime || settingsLoading}
            className="flex items-center gap-1.5"
          >
            {savingDateTime ? formatMessage({ id: "settings.common.saving" }) : dateTimeSaved ? (
              <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
            ) : formatMessage({ id: "settings.common.save" })}
          </Button>
        </Card>
      </div>
    </>
  );
}

// Which card the Notifications tab shows is a property of the RUNTIME, not of
// the user: the desktop delivers OS notifications natively, a browser needs Web
// Push, and some browsers can do neither. Deciding this once, synchronously, is
// what keeps the tab from ever sitting on "Checking…" (task #93).
const UNSUPPORTED_REASON_MESSAGE: Record<NotificationUnsupportedReason, MessageId> = {
  "no-window": "settings.notifications.unsupportedHint",
  "no-notification-api": "settings.notifications.unsupportedReason.noNotificationApi",
  "insecure-context": "settings.notifications.unsupportedReason.insecureContext",
  "no-service-worker": "settings.notifications.unsupportedReason.noServiceWorker",
  "no-push-manager": "settings.notifications.unsupportedReason.noPushManager",
};

function NotificationsSection() {
  const channel = useMemo(() => resolveNotificationChannel(), []);
  if (channel.kind === "desktop-native") return <DesktopNativeNotificationsCard />;
  return <WebPushNotificationsCard channel={channel} />;
}

function DesktopNativeNotificationsCard() {
  const { formatMessage } = useIntl();
  // The shell grants the Chromium notification permission outright, so there is
  // no readable "enabled/blocked" state here (see desktopNativeNotifications.ts);
  // the card reports that the OS owns the switch and offers the one real check.
  const available = isDesktopNativeNotificationsAvailable();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleTest = useCallback(() => {
    setError("");
    setMessage("");
    const posted = showDesktopTestNotification({
      title: formatMessage({ id: "settings.notifications.desktop.testTitle" }),
      body: formatMessage({ id: "settings.notifications.desktop.testBody" }),
    });
    if (posted) setMessage(formatMessage({ id: "settings.notifications.desktop.testSent" }));
    else setError(formatMessage({ id: "settings.notifications.desktop.errTestFailed" }));
  }, [formatMessage]);

  return (
    <div>
      <SectionHeader
        className="mb-3"
        icon={<Bell size={16} />}
        label={formatMessage({ id: "settings.notifications.desktop.sectionLabel" })}
      />

      <Card className="space-y-3 p-4" data-testid="desktop-notifications-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.notifications.desktop.title" })}</div>
            <div className="text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.notifications.desktop.description" })}
            </div>
          </div>
          <Badge appearance="soft" variant={available ? "default" : "muted"}>
            {formatMessage({ id: available ? "settings.notifications.desktop.statusSystemManaged" : "settings.notifications.desktop.statusUnavailable" })}
          </Badge>
        </div>

        <div className="text-footnote text-foreground-muted">
          {formatMessage({ id: available ? "settings.notifications.desktop.systemHint" : "settings.notifications.desktop.unavailableHint" })}
        </div>

        {error && (
          <Banner intent="warning" density="sm">{error}</Banner>
        )}
        {message && (
          <Banner intent="success" density="sm" role="status">{message}</Banner>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleTest}
            disabled={!available}
          >
            {formatMessage({ id: "settings.notifications.desktop.sendTest" })}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function WebPushNotificationsCard({ channel }: { channel: Exclude<NotificationChannel, { kind: "desktop-native" }> }) {
  const { formatMessage } = useIntl();
  const currentServer = useServerStore((s) => s.current);
  const currentServerId = currentServer?.id;
  const applyServerPatch = useServerStore((s) => s.applyServerPatch);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [muting, setMuting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [serverConfigured, setServerConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [serverPushMuted, setServerPushMuted] = useState(false);
  const [savedServerPushMuted, setSavedServerPushMuted] = useState(false);
  const serverPrefsVersionRef = useRef(currentServer?.notificationPrefsVersion ?? -1);

  const refreshState = useCallback(async () => {
    const serverId = currentServerId;
    setLoading(true);
    setPermission(getPushPermissionState());
    // Every probe must settle: if any of them threw, `loading` stayed true
    // forever ("Checking…") and the enable button stayed disabled (task #93).
    let configured = false;
    let currentSubscribed = false;
    let notificationSettings: { serverPushMuted: boolean; prefsVersion?: number } | null = null;
    try {
      [configured, currentSubscribed, notificationSettings] = await Promise.all([
        isPushServerConfigured(),
        isPushSubscribed(),
        serverId
          ? api.get(`/servers/${serverId}/notification-settings`).then((res) => res.data as { serverPushMuted: boolean; prefsVersion?: number }).catch(() => null)
          : Promise.resolve(null),
      ]);
    } catch (err) {
      console.error("[Push] Failed to refresh notification state:", err);
    }
    if (serverId !== useServerStore.getState().current?.id) return;
    setServerConfigured(configured);
    setSubscribed(currentSubscribed);
    if (notificationSettings && serverId) {
      const prefsVersion = typeof notificationSettings.prefsVersion === "number"
        && Number.isSafeInteger(notificationSettings.prefsVersion)
        && notificationSettings.prefsVersion >= 0
        ? notificationSettings.prefsVersion
        : undefined;
      if (prefsVersion !== undefined && prefsVersion < serverPrefsVersionRef.current) {
        setLoading(false);
        return;
      }
      if (prefsVersion !== undefined) serverPrefsVersionRef.current = prefsVersion;
      const nextServerPushMuted = !!notificationSettings.serverPushMuted;
      setServerPushMuted(nextServerPushMuted);
      setSavedServerPushMuted(nextServerPushMuted);
      applyServerPatch({
        id: serverId,
        serverPushMuted: nextServerPushMuted,
        ...(prefsVersion === undefined ? {} : { notificationPrefsVersion: prefsVersion }),
      });
    }
    setLoading(false);
  }, [applyServerPatch, currentServerId]);

  // Refetch push/notification state only when the active server id changes:
  // `refreshState` is keyed on `currentServerId`, and the prefs version is read
  // from the store so later prefs-version bumps do not trigger a refetch.
  useEffect(() => {
    serverPrefsVersionRef.current = useServerStore.getState().current?.notificationPrefsVersion ?? -1;
    void refreshState();
  }, [refreshState]);

  // oxlint-disable-next-line react-doctor/no-cascading-set-state -- Realtime server notification-pref updates must refresh the open settings form and clear stale save status together.
  useEffect(() => {
    const handleNotificationPrefsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ServerNotificationPrefsUpdatedDetail>).detail;
      if (!currentServerId || detail?.serverId !== currentServerId) return;
      if (detail.prefsVersion !== undefined && detail.prefsVersion < serverPrefsVersionRef.current) return;
      if (detail.prefsVersion !== undefined) serverPrefsVersionRef.current = detail.prefsVersion;
      setServerPushMuted(detail.serverPushMuted);
      setSavedServerPushMuted(detail.serverPushMuted);
      setMessage("");
      setError("");
    };
    window.addEventListener(SERVER_NOTIFICATION_PREFS_UPDATED_EVENT, handleNotificationPrefsUpdated);
    return () => {
      window.removeEventListener(SERVER_NOTIFICATION_PREFS_UPDATED_EVENT, handleNotificationPrefsUpdated);
    };
  }, [currentServerId]);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await enablePushNotifications();
    if (result === "unavailable") {
      setError(formatMessage({ id: "settings.notifications.errUnavailable" }));
    } else if (result === "denied") {
      setError(formatMessage({ id: "settings.notifications.errDenied" }));
    } else if (result === "error") {
      setError(formatMessage({ id: "settings.notifications.errEnableFailed" }));
    }
    await refreshState();
    setBusy(false);
  }, [formatMessage, refreshState]);

  const handleDisable = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    const ok = await disablePushNotifications();
    if (!ok) {
      setError(formatMessage({ id: "settings.notifications.errDisableFailed" }));
    }
    await refreshState();
    setBusy(false);
  }, [formatMessage, refreshState]);

  const handleSendTest = useCallback(async () => {
    setTesting(true);
    setError("");
    setMessage("");
    const result = await sendTestPushNotification();
    if (result === "ok") {
      setMessage(formatMessage({ id: "settings.notifications.testSent" }));
    } else if (result === "unavailable") {
      setError(formatMessage({ id: "settings.notifications.errUnavailable" }));
    } else if (result === "not_subscribed") {
      setError(formatMessage({ id: "settings.notifications.errNotSubscribed" }));
    } else if (result === "error") {
      setError(formatMessage({ id: "settings.notifications.errSendFailed" }));
    }
    await refreshState();
    setTesting(false);
  }, [formatMessage, refreshState]);

  const handleServerPushMutedChange = useCallback((checked: boolean) => {
    setServerPushMuted(checked);
    setMessage("");
    setError("");
  }, []);

  const handleSaveServerMute = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentServer) return;
    setMuting(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.patch(`/servers/${currentServer.id}/notification-settings`, {
        serverPushMuted,
      });
      const nextServerPushMuted = !!data.serverPushMuted;
      const prefsVersion = typeof data.prefsVersion === "number"
        && Number.isSafeInteger(data.prefsVersion)
        && data.prefsVersion >= 0
        ? data.prefsVersion
        : undefined;
      if (prefsVersion === undefined || prefsVersion >= serverPrefsVersionRef.current) {
        if (prefsVersion !== undefined) serverPrefsVersionRef.current = prefsVersion;
        setServerPushMuted(nextServerPushMuted);
        setSavedServerPushMuted(nextServerPushMuted);
        applyServerPatch({
          id: currentServer.id,
          serverPushMuted: nextServerPushMuted,
          ...(prefsVersion === undefined ? {} : { notificationPrefsVersion: prefsVersion }),
        });
        setMessage(nextServerPushMuted
          ? formatMessage({ id: "settings.notifications.muted" }, { serverName: currentServer.name })
          : formatMessage({ id: "settings.notifications.unmuted" }, { serverName: currentServer.name }));
      }
    } catch {
      setError(formatMessage({ id: "settings.notifications.errSaveMute" }));
    }
    setMuting(false);
  };

  const statusLabel = loading
    ? formatMessage({ id: "settings.notifications.statusChecking" })
    : permission === "unsupported"
      ? formatMessage({ id: "settings.notifications.statusUnsupported" })
      : !serverConfigured
        ? formatMessage({ id: "settings.notifications.statusUnavailable" })
        : subscribed
          ? formatMessage({ id: "settings.notifications.statusEnabled" })
          : permission === "granted"
            ? formatMessage({ id: "settings.notifications.statusReady" })
            : permission === "denied"
              ? formatMessage({ id: "settings.notifications.statusDenied" })
              : formatMessage({ id: "settings.notifications.statusDisabled" });
  // Fixed status meanings: on is lime, a blocked permission is a problem
  // (orange), everything else is neutral stone.
  const statusTone = loading
    ? "muted"
    : subscribed && serverConfigured && permission !== "unsupported"
      ? "success"
      : permission === "denied"
        ? "warning"
        : "muted";

  return (
    <div>
      <SectionHeader
        className="mb-3"
        icon={<Bell size={16} />}
        label={formatMessage({ id: "settings.notifications.sectionLabel" })}
      />

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.notifications.mainTitle" })}</div>
            <div className="text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.notifications.mainDescription" })}
            </div>
          </div>
          <Badge appearance="soft" variant={statusTone}>
            {statusLabel}
          </Badge>
        </div>

        {permission === "unsupported" && (
          <div className="text-footnote text-foreground-muted">
            {formatMessage({ id: channel.kind === "unsupported" ? UNSUPPORTED_REASON_MESSAGE[channel.reason] : "settings.notifications.unsupportedHint" })}
          </div>
        )}

        {permission !== "unsupported" && !serverConfigured && !loading && (
          <div className="text-footnote text-foreground-muted">
            {formatMessage({ id: "settings.notifications.notConfiguredHint" })}
          </div>
        )}

        {permission === "denied" && (
          <div className="text-footnote text-foreground-muted">
            {formatMessage({ id: "settings.notifications.deniedHint" })}
          </div>
        )}

        {error && (
          <Banner intent="warning" density="sm">{error}</Banner>
        )}

        {message && (
          <Banner intent="success" density="sm" role="status">{message}</Banner>
        )}

        <div className="flex gap-2">
          {subscribed ? (
            <>
              <Button
                variant="outline" size="sm" type="button"
                onClick={handleDisable}
                disabled={busy || testing}
              >
                {busy ? formatMessage({ id: "settings.notifications.disabling" }) : formatMessage({ id: "settings.notifications.disable" })}
              </Button>
              <Button
                variant="outline" size="sm" type="button"
                onClick={handleSendTest}
                disabled={busy || testing || permission === "unsupported" || !serverConfigured}
              >
                {testing ? formatMessage({ id: "settings.notifications.sending" }) : formatMessage({ id: "settings.notifications.sendTest" })}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnable}
              disabled={busy || testing || permission === "unsupported" || !serverConfigured}
            >
              {busy ? formatMessage({ id: "settings.notifications.enabling" }) : formatMessage({ id: "settings.notifications.enable" })}
            </Button>
          )}
        </div>

        {currentServer && (
          <div>
            <Separator className="mb-3" />
            <form onSubmit={handleSaveServerMute} className="space-y-3">
              <label className={`flex items-start gap-3 ${loading || busy || testing || muting ? "cursor-not-allowed" : ""}`}>
                <Checkbox
                  checked={serverPushMuted}
                  disabled={loading || busy || testing || muting}
                  onCheckedChange={handleServerPushMutedChange}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className={`block text-subhead font-semibold ${loading || busy || testing || muting ? "text-foreground-disabled" : "text-foreground"}`}>{formatMessage({ id: "settings.notifications.muteServerTitle" })}</span>
                  <span className="block text-footnote text-foreground-muted mt-0.5">
                    {formatMessage({ id: "settings.notifications.muteServerDescription" }, { serverName: currentServer.name })}
                  </span>
                </span>
              </label>
              <div className="flex justify-end">
                <Button
                  variant="accent" size="sm"
                  type="submit"
                  disabled={serverPushMuted === savedServerPushMuted || loading || busy || testing || muting}
                >
                  {muting ? formatMessage({ id: "settings.common.saving" }) : formatMessage({ id: "settings.common.save" })}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Invites Section ──

export interface PendingInvite {
  id: string;
  invitedEmail: string;
  createdAt: string;
}

export interface JoinLinkRecord {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
}

export interface OAuthClientRecord {
  setupUrl?: string | null;
  setupDescription?: string | null;
  id: string;
  serverId: string;
  clientId: string;
  appType: "server_local" | "third_party_global";
  publishStatus: "private" | "publish_requested" | "in_review" | "published" | "rejected" | "unpublish_requested";
  category: OAuthClientCategory;
  dataAccessSummary: string | null;
  publishRejectionReason: string | null;
  name: string;
  description: string | null;
  whenToUse: string | null;
  homepageUrl: string | null;
  returnUrl: string | null;
  agentManifestUrl: string | null;
  allowedScopes: string[] | null;
  logoUrl: string | null;
  humanMarketplaceVisible: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface MarketplaceOAuthClientRecord extends OAuthClientRecord {
  official: boolean;
  purpose: string;
  installedAt: string | null;
  marketplaceInstallBadge: MarketplaceInstallBadge;
  publisherName: string | null;
  publisherServerName: string | null;
  privateShared: boolean;
  appNotificationGroups: AppNotificationSelection["groups"];
  appNotificationEvents: AppNotificationSelection["events"];
  appNotificationReviewPending: boolean;
  appNotificationPendingRevisionId: string | null;
  appNotificationPendingGroups: AppNotificationSelection["groups"];
  appNotificationPendingEvents: AppNotificationSelection["events"];
  canReviewAppNotifications: boolean;
}

type MarketplaceInstallBadge =
  | { kind: "new" }
  | { kind: "bucket"; bucket: "10_plus" | "100_plus" | "1k_plus" }
  | { kind: "none" };

interface OAuthClientShareLinkRecord {
  id: string;
  clientId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationOverviewItem {
  id: string;
  type: "pending" | "active";
  clientId: string;
  clientKey: string;
  clientName: string;
  agentName: string;
  agentDisplayName: string | null;
  scopes: string[];
  revokedAt: string | null;
}

function ProfileSection() {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const updateServerProfile = useServerStore((s) => s.updateServerProfile);
  const uploadServerAvatar = useServerStore((s) => s.uploadServerAvatar);
  const { capabilities } = useServerPermissions();
  const canEdit = capabilities.editServerSettings;

  const [name, setName] = useState(server?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    setName(server?.name ?? "");
  }, [server?.id, server?.name]);

  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setName(e.target.value), []);

  if (!server) return null;

  const serverInitial = (server.name || "S").trim().charAt(0).toUpperCase() || "S";
  const dirty =
    name.trim().length > 0
    && name.trim() !== server.name;

  const handleUploadAvatar = async (file: File) => {
    if (isAvatarFileTooLarge(file)) {
      setAvatarError(formatMessage({ id: "avatar.tooLarge" }, { maxLabel: formatMessage({ id: "common.fileSize.maxLabel5mb" }) }));
      return;
    }
    setAvatarError("");
    setAvatarSaving(true);
    try {
      await uploadServerAvatar(file);
    } catch (err: any) {
      setAvatarError(isAvatarTooLargeError(err)
        ? formatMessage({ id: "avatar.tooLarge" }, { maxLabel: formatMessage({ id: "common.fileSize.maxLabel5mb" }) })
        : avatarUploadApiErrorMessage(err, formatMessage({ id: "settings.serverProfile.failedUploadAvatar" })));
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await updateServerProfile({
        name: name.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.serverProfile.failedUpdate" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Building2 size={16} />}
        label={formatMessage({ id: "settings.serverProfile.sectionLabel" })}
      />

      <SettingsProfileCard
        testId="server-profile-card"
        title={server.name}
        subtitle={`/${server.slug}`}
        avatar={
          canEdit ? (
            <Tooltip content={avatarSaving ? formatMessage({ id: "settings.common.uploadingAvatar" }) : formatMessage({ id: "settings.common.uploadImage" })}>
            <label
              className={`group/avatar-edit relative flex shrink-0 rounded-sticker has-[:focus-visible]:shadow-focus ${avatarSaving ? "cursor-not-allowed opacity-70" : ""}`}
            >
              <input
                type="file"
                accept={PROFILE_AVATAR_ACCEPT}
                className="peer/avatar-edit sr-only"
                aria-label={avatarSaving ? formatMessage({ id: "settings.common.uploadingAvatar" }) : formatMessage({ id: "settings.common.uploadImage" })}
                disabled={avatarSaving}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void handleUploadAvatar(file);
                }}
              />
              <AvatarSlot context="profile-tile" type="server" serverAvatarUrl={server.avatarUrl} serverInitial={serverInitial} />
              <AvatarEditVeil busy={avatarSaving} />
            </label>
            </Tooltip>
          ) : (
            <AvatarSlot context="profile-tile" type="server" serverAvatarUrl={server.avatarUrl} serverInitial={serverInitial} />
          )
        }
      >
        {avatarError ? (
          <p className="text-caption text-danger-strong" role="alert">{avatarError}</p>
        ) : null}
        <form onSubmit={handleSave} className="space-y-3">
          <FormField label={formatMessage({ id: "settings.serverProfile.nameLabel" })} size="compact">
            {canEdit ? (
              <Input
                data-testid="server-profile-name-input"
                type="text"
                value={name}
                onChange={handleNameChange}
                maxLength={100}
                className="w-full"
              />
            ) : (
              <div
                data-testid="server-profile-name-readonly"
                className="flex min-h-11 w-full items-center rounded-control border border-line-hairline bg-fill-muted px-3 text-body text-foreground-muted"
              >
                {server.name}
              </div>
            )}
          </FormField>

          <FormField label={formatMessage({ id: "settings.serverProfile.slugLabel" })} size="compact">
            <SlugInput
              type="text"
              value={server.slug}
              readOnly
              aria-readonly="true"
              tabIndex={-1}
              className="border-line-hairline bg-fill-muted shadow-none focus-within:shadow-none"
              inputClassName="cursor-default text-foreground-muted"
            />
          </FormField>

          {error && (
            <Banner intent="warning" density="sm">{error}</Banner>
          )}

          {canEdit && (
            <Button
              variant="accent" size="sm"
              data-testid="server-profile-save-button"
              data-save-state={saving ? "saving" : saved ? "saved" : dirty ? "dirty" : "pristine"}
              type="submit"
              disabled={!dirty || saving}
              className="flex items-center gap-1.5"
            >
              {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? (
                <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
              ) : formatMessage({ id: "settings.serverProfile.saveProfile" })}
            </Button>
          )}
        </form>
      </SettingsProfileCard>
    </div>
  );
}

interface PublicVisibilityReadback {
  publiclyVisible: boolean;
  publicGuestJoinEnabled: boolean;
  publicSearchEnabled: boolean;
  slug: string;
  exposedChannels: Array<{ id: string; name: string; description: string | null }>;
}

interface PublicVisibilityUiState {
  readback: PublicVisibilityReadback | null;
  loading: boolean;
  saving: boolean;
  error: string;
  confirmOpen: boolean;
}

type PublicVisibilityUiAction =
  | { type: "load" }
  | { type: "loaded"; readback: PublicVisibilityReadback }
  | { type: "failed"; error: string }
  | { type: "saving" }
  | { type: "saved"; publiclyVisible: boolean; publicGuestJoinEnabled: boolean }
  | { type: "guestJoinSaved"; publicGuestJoinEnabled: boolean }
  | { type: "searchSaved"; publicSearchEnabled: boolean }
  | { type: "confirm"; open: boolean };

function publicVisibilityUiReducer(state: PublicVisibilityUiState, action: PublicVisibilityUiAction): PublicVisibilityUiState {
  switch (action.type) {
    case "load": return { ...state, readback: null, loading: true, error: "", confirmOpen: false };
    case "loaded": return { ...state, loading: false, readback: action.readback };
    case "failed": return { ...state, loading: false, saving: false, error: action.error };
    case "saving": return { ...state, saving: true, error: "" };
    case "saved": return {
      ...state,
      saving: false,
      readback: state.readback ? {
        ...state.readback,
        publiclyVisible: action.publiclyVisible,
        publicGuestJoinEnabled: action.publicGuestJoinEnabled,
      } : null,
    };
    case "guestJoinSaved": return {
      ...state,
      saving: false,
      readback: state.readback ? { ...state.readback, publicGuestJoinEnabled: action.publicGuestJoinEnabled } : null,
    };
    case "searchSaved": return {
      ...state,
      saving: false,
      readback: state.readback ? { ...state.readback, publicSearchEnabled: action.publicSearchEnabled } : null,
    };
    case "confirm": return { ...state, confirmOpen: action.open };
  }
}

const NO_PUBLIC_CHANNELS: PublicVisibilityReadback["exposedChannels"] = [];

function PublicChannelList({ channels }: { channels: PublicVisibilityReadback["exposedChannels"] }) {
  const { formatMessage } = useIntl();
  // Keep the exposure inventory compact in both the settings page and the
  // confirmation drawer. A row has a fixed 3.625rem detail height; the 7.5rem
  // border-box therefore shows exactly two rows (plus the list borders), with
  // any third row reached inside this list instead of growing its parent.
  const scrollFrameClass = "max-h-[7.5rem] overflow-y-scroll";
  if (channels.length === 0) {
    return (
      <div className={`rounded-container border border-dashed border-line-hairline px-3 py-4 text-center text-footnote text-foreground-hint ${scrollFrameClass}`}>
        {formatMessage({ id: "settings.publicVisibility.emptyChannels" })}
      </div>
    );
  }
  return (
    <ul className={`rounded-container border border-line-hairline bg-layer-card ${scrollFrameClass}`} data-testid="public-visibility-channel-list">
      {channels.map((channel, index) => (
        <li key={channel.id} className="flex h-[3.625rem] flex-col">
          {index > 0 ? <Separator className="shrink-0" /> : null}
          <div className="flex min-h-0 flex-1 items-start gap-3 px-3 py-2.5">
          <IconTile size="sm" className="mt-0.5">
            <Hash strokeWidth={2} />
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-semibold text-foreground">{channel.name}</span>
            {channel.description ? <span className="mt-0.5 block truncate text-footnote text-foreground-muted">{channel.description}</span> : null}
          </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PublicVisibilitySection() {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const { role } = useServerPermissions();
  const publicServerEnabled = useServerFeatureFlag(PUBLIC_SERVER_FEATURE_FLAG_KEY).enabled;
  const serverGuestEnabled = useServerFeatureFlag(SERVER_GUEST_FEATURE_FLAG_KEY).enabled;
  const [ui, dispatch] = useReducer(publicVisibilityUiReducer, {
    readback: null,
    loading: false,
    saving: false,
    error: "",
    confirmOpen: false,
  });
  const { readback, loading, saving, error, confirmOpen } = ui;

  useEffect(() => {
    if (!server?.id || role !== "owner" || !publicServerEnabled) return;
    let active = true;
    dispatch({ type: "load" });
    api.get<PublicVisibilityReadback>(`/servers/${server.id}/public-visibility`)
      .then(({ data }) => {
        if (active) dispatch({ type: "loaded", readback: data });
      })
      .catch((err: unknown) => {
        if (active) {
          const response = getApiErrorResponse(err);
          dispatch({ type: "failed", error: response?.error || formatMessage({ id: "settings.publicVisibility.failedLoad" }) });
        }
      });
    return () => {
      active = false;
    };
  }, [formatMessage, publicServerEnabled, role, server?.id]);

  const serverId = server?.id;
  const updateVisibility = useCallback(async (publiclyVisible: boolean) => {
    if (!serverId) return;
    dispatch({ type: "saving" });
    try {
      const { data } = await api.patch<{ publiclyVisible: boolean; publicGuestJoinEnabled: boolean }>(`/servers/${serverId}/public-visibility`, { publiclyVisible });
      if (useServerStore.getState().current?.id !== serverId) return;
      dispatch({ type: "saved", publiclyVisible: data.publiclyVisible, publicGuestJoinEnabled: data.publicGuestJoinEnabled });
      // The server list carries publicPageLive (the globe on the server
      // avatar and on public channels). Members pick the change up on their
      // next list refresh; the owner who just flipped it should not wait.
      void useServerStore.getState().loadServers({ fresh: true });
    } catch (err: unknown) {
      if (useServerStore.getState().current?.id !== serverId) return;
      const response = getApiErrorResponse(err);
      dispatch({ type: "failed", error: response?.error || formatMessage({ id: "settings.publicVisibility.failedUpdate" }) });
      throw err;
    }
  }, [formatMessage, serverId]);

  const updateGuestJoin = useCallback(async (publicGuestJoinEnabled: boolean) => {
    if (!serverId) return;
    dispatch({ type: "saving" });
    try {
      const { data } = await api.patch<{ publicGuestJoinEnabled: boolean }>(
        `/servers/${serverId}/public-guest-join`,
        { publicGuestJoinEnabled },
      );
      if (useServerStore.getState().current?.id !== serverId) return;
      dispatch({ type: "guestJoinSaved", publicGuestJoinEnabled: data.publicGuestJoinEnabled });
    } catch (err: unknown) {
      if (useServerStore.getState().current?.id !== serverId) return;
      const response = getApiErrorResponse(err);
      dispatch({ type: "failed", error: response?.error || formatMessage({ id: "settings.publicVisibility.failedGuestJoinUpdate" }) });
      throw err;
    }
  }, [formatMessage, serverId]);

  const updateSearch = useCallback(async (publicSearchEnabled: boolean) => {
    if (!serverId) return;
    dispatch({ type: "saving" });
    try {
      const { data } = await api.patch<{ publicSearchEnabled: boolean }>(
        `/servers/${serverId}/public-search`,
        { publicSearchEnabled },
      );
      if (useServerStore.getState().current?.id !== serverId) return;
      dispatch({ type: "searchSaved", publicSearchEnabled: data.publicSearchEnabled });
    } catch (err: unknown) {
      if (useServerStore.getState().current?.id !== serverId) return;
      const response = getApiErrorResponse(err);
      dispatch({ type: "failed", error: response?.error || formatMessage({ id: "settings.publicVisibility.failedSearchUpdate" }) });
      throw err;
    }
  }, [formatMessage, serverId]);

  const handleSearchCheckedChange = useCallback((checked: boolean) => {
    void updateSearch(checked).catch(() => {});
  }, [updateSearch]);

  const handleVisibilityCheckedChange = useCallback((checked: boolean) => {
    if (checked) dispatch({ type: "confirm", open: true });
    else void updateVisibility(false).catch(() => {});
  }, [updateVisibility]);

  const handleGuestJoinCheckedChange = useCallback((checked: boolean) => {
    void updateGuestJoin(checked).catch(() => {});
  }, [updateGuestJoin]);

  const handleCopyUrlError = useCallback(() => dispatch({
    type: "failed",
    error: formatMessage({ id: "settings.publicVisibility.failedCopyUrl" }),
  }), [formatMessage]);

  const handleConfirmPublic = useCallback(() => updateVisibility(true), [updateVisibility]);
  const handleCloseConfirm = useCallback(() => dispatch({ type: "confirm", open: false }), []);

  if (!server || role !== "owner" || !publicServerEnabled) return null;

  const channels = readback?.exposedChannels ?? NO_PUBLIC_CHANNELS;
  const publicUrl = readback?.publiclyVisible
    ? `${shareableWebOrigin()}/s/${readback.slug}`
    : "";

  return (
    <div className="mb-6" data-testid="public-visibility-section">
      <SectionHeader
        className="mb-3"
        icon={<Globe size={16} />}
        label={formatMessage({ id: "settings.publicVisibility.sectionLabel" })}
      />
      {/* Two levels (cindyz, #wg-rbac task #127): "Make this server public"
          with its link and, under it, the Guest-join setting, which only
          applies to a public server; then, after a divider, the channel list,
          which is about the whole public server and sits at the first level. */}
      <Card className="space-y-4 p-4">
        <div className="space-y-4" data-testid="public-visibility-primary">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="public-visibility-label" className="text-subhead font-semibold text-foreground">
              {formatMessage({ id: "settings.publicVisibility.title" })}
            </h3>
            <p className="mt-1 text-footnote text-foreground-muted">
              {formatMessage({ id: "settings.publicVisibility.description" })}
            </p>
          </div>
          <Switch
            checked={readback?.publiclyVisible === true}
            disabled={loading || saving || !readback}
            onCheckedChange={handleVisibilityCheckedChange}
            aria-labelledby="public-visibility-label"
            data-testid="public-visibility-switch"
          />
        </div>

        {publicUrl ? (
          <div data-testid="public-visibility-url">
            <label
              htmlFor="public-visibility-url-input"
              className="mb-1.5 block text-footnote font-semibold text-foreground"
            >
              {formatMessage({ id: "settings.publicVisibility.publicUrl" })}
            </label>
            <div className="flex gap-2">
              <Input
                id="public-visibility-url-input"
                className="min-w-0 flex-1"
                type="url"
                value={publicUrl}
                readOnly
              />
              <CopyButton
                text={publicUrl}
                resetKey={publicUrl}
                onCopyError={handleCopyUrlError}
              >
                {({ copied, disabled, onClick, onMouseDown }) => (
                  <Button
                    size="lg"
                    
                    variant="outline"
                    className="shrink-0"
                    disabled={disabled}
                    onMouseDown={onMouseDown}
                    onClick={onClick}
                    data-testid="public-visibility-copy-url"
                  >
                    {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                    {formatMessage({
                      id: copied
                        ? "settings.publicVisibility.copiedUrl"
                        : "settings.publicVisibility.copyUrl",
                    })}
                  </Button>
                )}
              </CopyButton>
            </div>
          </div>
        ) : null}

        {serverGuestEnabled ? (
          // Second level: indented under the setting it depends on, with a
          // guide line instead of the divider that used to make it a sibling.
          <div className="ml-1 flex items-start justify-between gap-4 border-l border-line-hairline pl-4" data-testid="public-guest-join-setting">
            <div className="min-w-0">
              <h3 id="public-guest-join-label" className="text-subhead font-semibold text-foreground">
                {formatMessage({ id: "settings.publicVisibility.allowGuestJoin" })}
              </h3>
              <p className="mt-1 text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.publicVisibility.allowGuestJoinDescription" })}
              </p>
            </div>
            <Switch
              checked={readback?.publicGuestJoinEnabled === true}
              disabled={loading || saving || !readback || !readback.publiclyVisible}
              onCheckedChange={handleGuestJoinCheckedChange}
              aria-labelledby="public-guest-join-label"
              data-testid="public-guest-join-switch"
            />
          </div>
        ) : null}

        {/* Public server SEO: also second level. It never makes anything
            readable; it only decides whether public content may be indexed. */}
        <div className="ml-1 flex items-start justify-between gap-4 border-l border-line-hairline pl-4" data-testid="public-search-setting">
          <div className="min-w-0">
            <h3 id="public-search-label" className="text-subhead font-semibold text-foreground">
              {formatMessage({ id: "settings.publicVisibility.allowSearch" })}
            </h3>
            <p className="mt-1 text-footnote text-foreground-muted">
              {formatMessage({ id: "settings.publicVisibility.allowSearchDescription" })}
            </p>
          </div>
          <Switch
            checked={readback?.publiclyVisible === true && readback.publicSearchEnabled}
            disabled={loading || saving || !readback || !readback.publiclyVisible}
            onCheckedChange={handleSearchCheckedChange}
            aria-labelledby="public-search-label"
            data-testid="public-search-switch"
          />
        </div>
        </div>

        <div className="border-t border-line-hairline pt-4" data-testid="public-visibility-channels">
          <h3 className="mb-2 text-subhead font-semibold text-foreground">
            {formatMessage({ id: "settings.publicVisibility.channelListLabel" })}
          </h3>
          {loading ? (
            <div className="h-16 animate-pulse rounded-container bg-fill-muted" data-testid="public-visibility-loading" />
          ) : <PublicChannelList channels={channels} />}
        </div>

        {error ? <Banner intent="warning" density="sm">{error}</Banner> : null}
      </Card>

      {confirmOpen ? (
        <ConfirmDialog
          title={formatMessage({ id: "settings.publicVisibility.confirmTitle" })}
          message={(
            <div className="space-y-4">
              <p className="text-callout text-foreground">
                {formatMessage({ id: "settings.publicVisibility.confirmDescription" })}
              </p>
              <PublicChannelList channels={channels} />
              <p className="text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.publicVisibility.confirmAudienceChange" })}
              </p>
            </div>
          )}
          confirmLabel={formatMessage({ id: "settings.publicVisibility.confirmAction" })}
          loadingLabel={formatMessage({ id: "settings.publicVisibility.confirmSaving" })}
          confirmVariant="accent"
          confirmTestId="public-visibility-confirm-button"
          plainMessage
          maxWidthClass="max-w-lg"
          chromeLocale="active"
          onConfirm={handleConfirmPublic}
          onClose={handleCloseConfirm}
        />
      ) : null}
    </div>
  );
}

interface ServerLabsSavingTarget {
  serverId: string;
  serverEpoch: number;
  token: number;
  target: string;
}

function isActiveServerLabsContext(context: ServerLabsStoreContext) {
  const serverState = useServerStore.getState();
  return serverState.current?.id === context.serverId && serverState.serverEpoch === context.serverEpoch;
}

function LabsSection() {
  const { formatMessage } = useIntl();
  const current = useServerStore((s) => s.current);
  const serverEpoch = useServerStore((s) => s.serverEpoch);
  const { role } = useServerPermissions();
  const { readback, loading, unavailable, errorId } = useServerLabsSettingsSnapshot(current?.id, serverEpoch);
  const [savingTarget, setSavingTarget] = useState<ServerLabsSavingTarget | null>(null);
  const mutationRequestTokenRef = useRef(0);
  const activeServerId = current?.id ?? null;
  const activeReadback = readback?.serverId === activeServerId ? readback : null;
  const activeSavingTarget = savingTarget?.serverId === activeServerId && savingTarget.serverEpoch === serverEpoch ? savingTarget : null;

  const authority = useMemo(
    () => getServerLabSettingsAuthority(role, activeReadback?.permissions),
    [activeReadback?.permissions, role],
  );

  useEffect(() => {
    if (!current?.id) return;
    const requestContext = createServerLabsStoreContext(current.id, serverEpoch);
    loadServerLabsSettings(requestContext).catch(() => {});
  }, [current?.id, serverEpoch]);

  const applyReadbackMutation = useCallback(async (
    target: string,
    requestFactory: (serverId: string, snapshot: ServerLabSettingsReadback) => Promise<{ data: ServerLabSettingsReadback | CanonicalServerLabSettingsReadback | { data: ServerLabSettingsReadback | CanonicalServerLabSettingsReadback } }>,
  ) => {
    if (!activeServerId || !activeReadback || activeReadback.serverId !== activeServerId) return;
    const requestContext: ServerLabsStoreContext = {
      serverId: activeServerId,
      serverEpoch,
      token: mutationRequestTokenRef.current + 1,
    };
    mutationRequestTokenRef.current = requestContext.token;
    beginServerLabsMutation(requestContext);
    setSavingTarget({
      serverId: requestContext.serverId,
      serverEpoch: requestContext.serverEpoch,
      token: requestContext.token,
      target,
    });
    try {
      const response = await requestFactory(requestContext.serverId, activeReadback);
      if (!isActiveServerLabsContext(requestContext) || mutationRequestTokenRef.current !== requestContext.token) return;
      const normalized = normalizeServerLabSettingsReadback(response.data);
      if (normalized.serverId !== requestContext.serverId) {
        failServerLabsMutation(requestContext, "settings.labs.failedServerMismatch");
        return;
      }
      const published = publishServerLabsReadback(requestContext, normalized, "mutation");
      if (published) void refreshServerFeatureFlags(requestContext.serverId);
    } catch {
      if (!isActiveServerLabsContext(requestContext) || mutationRequestTokenRef.current !== requestContext.token) return;
      failServerLabsMutation(requestContext, "settings.labs.failedUpdate");
    } finally {
      if (isActiveServerLabsContext(requestContext) && mutationRequestTokenRef.current === requestContext.token) {
        setSavingTarget((existing) => (
          existing?.serverId === requestContext.serverId && existing.serverEpoch === requestContext.serverEpoch && existing.token === requestContext.token ? null : existing
        ));
      }
    }
  }, [activeReadback, activeServerId, serverEpoch]);

  const handleMasterChange = useCallback((enabled: boolean) => {
    if (!activeReadback || !authority.canSetMasterAccess) return;
    void applyReadbackMutation(
      "master",
      (serverId, snapshot) => api.patch(`/servers/${serverId}/labs/access`, createServerLabMasterMutation(snapshot, enabled)),
    );
  }, [activeReadback, applyReadbackMutation, authority.canSetMasterAccess]);

  const handleEnrollmentChange = useCallback((labKey: string, enabled: boolean) => {
    if (!activeReadback) return;
    const lab = activeReadback.labs.find((candidate) => candidate.key === labKey);
    if (!lab || !isServerLabEnrollmentEditable(lab, authority, activeReadback.masterEnabled)) return;
    void applyReadbackMutation(
      `lab:${labKey}`,
      (serverId, snapshot) => api.put(`/servers/${serverId}/labs/${encodeURIComponent(labKey)}`, createServerLabEnrollmentMutation(snapshot, enabled)),
    );
  }, [activeReadback, applyReadbackMutation, authority]);

  if (!current) return null;

  const error = errorId ? formatMessage({ id: errorId }) : "";

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<FlaskConical size={16} />}
        label={formatMessage({ id: "settings.labs.sectionLabel" })}
        count={activeReadback?.labs.length}
      />

      <Card className="p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : unavailable ? (
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-foreground-muted" />
            <div>
              <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.labs.unavailableTitle" })}</div>
              <div className="mt-0.5 text-footnote text-foreground-muted">{formatMessage({ id: "settings.labs.unavailableDescription" })}</div>
            </div>
          </div>
        ) : activeReadback ? (
          <div className="space-y-4">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.labs.masterTitle" })}</div>
                  {!authority.canSetMasterAccess && (
                    <div className="mt-0.5 text-footnote text-foreground-muted">
                      {formatMessage({ id: "settings.labs.masterOwnerOnly" })}
                    </div>
                  )}
                </div>
                <Switch
                  checked={activeReadback.masterEnabled}
                  disabled={!authority.canSetMasterAccess || activeSavingTarget != null}
                  onCheckedChange={handleMasterChange}
                  aria-label={formatMessage({ id: "settings.labs.masterTitle" })}
                  className="mt-0.5 shrink-0"
                />
              </div>
              <Separator className="mt-4" />
            </div>

            {activeReadback.labs.length === 0 ? (
              <div className="text-footnote text-foreground-hint">{formatMessage({ id: "settings.labs.emptyState" })}</div>
            ) : (
              <div data-testid="server-labs-list">
                {activeReadback.labs.map((lab, index) => (
                  <Fragment key={lab.key}>
                  {index > 0 ? <Separator /> : null}
                  <ServerLabRow
                    lab={lab}
                    authority={authority}
                    masterEnabled={activeReadback.masterEnabled}
                    mutationPending={activeSavingTarget != null}
                    saving={activeSavingTarget?.target === `lab:${lab.key}`}
                    onEnrollmentChange={handleEnrollmentChange}
                  />
                  </Fragment>
                ))}
              </div>
            )}

            {error && (
              <Banner intent="warning" density="sm">
                {error}
              </Banner>
            )}
          </div>
        ) : error ? (
          <Banner intent="warning" density="sm">
            {error}
          </Banner>
        ) : null}
      </Card>
    </div>
  );
}

type AdminRole = Extract<ServerRole, "owner" | "admin">;

export function renderPrincipalAvatar(principal: ServerAdminSettingsPrincipal, context: "list-row" | "compact-list") {
  return principal.kind === "human" ? (
    <AvatarSlot
      context={context}
      type="human"
      humanAvatarUrl={principal.avatarUrl}
      gravatarHash={principal.gravatarHash}
      email={principal.email}
      className={context === "list-row" ? "self-start" : ""}
    />
  ) : (
    <AvatarSlot
      context={context}
      type="agent"
      agentAvatarUrl={principal.avatarUrl}
      className={context === "list-row" ? "self-start" : ""}
    />
  );
}

function AdminsSection() {
  const { formatMessage } = useIntl();
  const members = useServerStore((s) => s.members);
  const loadMembers = useServerStore((s) => s.loadMembers);
  const updateMemberRole = useServerStore((s) => s.updateMemberRole);
  const allAgents = useAgentStore((s) => s.agents);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const { role, capabilities } = useServerPermissions();

  const agents = useMemo(() => allAgents.filter((agent) => !agent.deletedAt), [allAgents]);
  const [selectedPrincipalKey, setSelectedPrincipalKey] = useState("");
  const [selectedRole, setSelectedRole] = useState<AdminRole>("admin");
  const [adminPrincipalSearch, setAdminPrincipalSearch] = useState("");
  const [principalPickerOpen, setPrincipalPickerOpen] = useState(false);
  const [savingPrincipalKey, setSavingPrincipalKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canManageAdminRoles = capabilities.changeMemberRoles;
  const admins = useMemo(() => getAdminPrincipals(members, agents), [members, agents]);
  const candidates = useMemo(() => getAdminCandidatePrincipals(members, agents, role), [members, agents, role]);
  // oxlint-disable-next-line react-doctor/no-event-handler -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
  const selectedCandidate = candidates.find((principal) => getAdminPrincipalKey(principal) === selectedPrincipalKey) ?? null;
  const selectedRoleOptions = useMemo(
    () => (selectedCandidate ? getAdminPrincipalRoleOptions(role, selectedCandidate) : []),
    [role, selectedCandidate],
  );
  const adminRoleSelectOptions = useMemo<SelectOption[]>(() => [
    { value: "owner", label: formatMessage({ id: "settings.admins.owner" }), disabled: !selectedRoleOptions.includes("owner") },
    { value: "admin", label: formatMessage({ id: "settings.admins.admin" }), disabled: !selectedRoleOptions.includes("admin") },
  ], [formatMessage, selectedRoleOptions]);
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const filteredCandidates = useMemo(() => {
    if (!adminPrincipalSearch.trim()) return candidates;
    const needle = adminPrincipalSearch.trim().toLowerCase();
    return candidates.filter((principal) => {
      const label = getAdminPrincipalLabel(principal, formatMessage).toLowerCase();
      const identity = principal.kind === "human"
        ? [principal.email, principal.name].filter(Boolean).join(" ")
        : `@${principal.name}`;
      return `${label} ${identity}`.toLowerCase().includes(needle);
    });
  }, [adminPrincipalSearch, candidates, formatMessage]);

  useEffect(() => {
    if (!canManageAdminRoles) return;
    void loadMembers();
    void loadAgents();
  }, [canManageAdminRoles, loadAgents, loadMembers]);

  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-event-handler -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
    if (selectedPrincipalKey && !candidates.some((principal) => getAdminPrincipalKey(principal) === selectedPrincipalKey)) {
      // oxlint-disable-next-line react-doctor/no-chain-state-updates -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
      setSelectedPrincipalKey("");
    }
  }, [candidates, selectedPrincipalKey]);

  // Each opening starts from an empty search.
  const handlePrincipalPickerOpenChange = useCallback((open: boolean) => {
    if (open) setAdminPrincipalSearch("");
    setPrincipalPickerOpen(open);
  }, []);

  // List-dep default narrowing: when the candidate (or current admin's own
  // role) changes, the available admin role options shrink/grow; fall the
  // user's `selectedRole` back to the first option if their previous pick
  // isn't in the new set. NOT a mirror-prop pattern — `selectedRole` is a
  // user-editable choice that must be narrowed when the available set
  // shifts. Same shape as CreateAgentDialog's list-dep default in PR #2524.
  useEffect(() => {
    if (!selectedCandidate) {
      // oxlint-disable-next-line react-doctor/no-derived-state, react-doctor/no-chain-state-updates -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
      setSelectedRole("admin");
      return;
    }
    const options = getAdminPrincipalRoleOptions(role, selectedCandidate);
    // oxlint-disable-next-line react-doctor/no-event-handler -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
    if (!options.includes(selectedRole)) {
      // oxlint-disable-next-line react-doctor/no-derived-state
      setSelectedRole(options[0] ?? "admin");
    }
  }, [role, selectedCandidate, selectedRole]);

  const popoverOptions = useMemo(() => filteredCandidates.map((principal) => {
    const key = getAdminPrincipalKey(principal);
    return {
      key,
      checked: key === selectedPrincipalKey,
      onClick: () => {
        setSelectedPrincipalKey(key);
        setPrincipalPickerOpen(false);
        setAdminPrincipalSearch("");
      },
      label: principal.kind === "human"
        ? principal.email ? `${getAdminPrincipalLabel(principal, formatMessage)} · ${principal.email}` : getAdminPrincipalLabel(principal, formatMessage)
        : formatMessage(
          { id: "settings.admins.principalAgentSuffix" },
          { name: getAdminPrincipalLabel(principal, formatMessage) },
        ),
      reserveLeadingSlot: true,
      avatar: renderPrincipalAvatar(principal, "compact-list"),
    };
  }), [filteredCandidates, formatMessage, selectedPrincipalKey]);

  const updateAdminPrincipalRole = useCallback((
    principal: ServerAdminSettingsPrincipal,
    nextRole: Extract<ServerRole, "owner" | "admin" | "member">,
  ) => {
    if (principal.kind === "human") {
      return updateMemberRole(principal.userId, nextRole);
    }
    const agentRole: Extract<ServerRole, "admin" | "member"> = nextRole === "member" ? "member" : "admin";
    return updateAgent(principal.id, { serverRole: agentRole });
  }, [updateAgent, updateMemberRole]);

  const handlePromote = useCallback(async () => {
    if (!selectedCandidate) return;
    const key = getAdminPrincipalKey(selectedCandidate);
    setSavingPrincipalKey(key);
    setError("");
    try {
      await updateAdminPrincipalRole(selectedCandidate, selectedRole);
      setSelectedPrincipalKey("");
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.admins.failedUpdateRole" }));
    } finally {
      setSavingPrincipalKey(null);
    }
  }, [formatMessage, selectedCandidate, selectedRole, updateAdminPrincipalRole]);

  const handleDemote = useCallback(async (principal: ServerAdminSettingsPrincipal) => {
    const key = getAdminPrincipalKey(principal);
    setSavingPrincipalKey(key);
    setError("");
    try {
      await updateAdminPrincipalRole(principal, "member");
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.admins.failedRemoveRole" }));
    } finally {
      setSavingPrincipalKey(null);
    }
  }, [formatMessage, updateAdminPrincipalRole]);

  const handleClearPrincipal = useCallback(() => {
    setSelectedPrincipalKey("");
    setPrincipalPickerOpen(false);
  }, []);

  const handleSelectedRoleChange = useCallback((value: string | null) => {
    if (value == null) return;
    setSelectedRole(value as AdminRole);
  }, []);

  if (!canManageAdminRoles) return null;

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Shield size={16} />}
        label={formatMessage({ id: "settings.admins.sectionLabel" })}
        count={admins.length}
      />

      <Card className="space-y-4 p-4">
        <div>
          <div className="mb-1.5 text-footnote font-semibold text-foreground">{formatMessage({ id: "settings.admins.addLabel" })}</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {/* raft-ui Popover: the list is placed in a portal under the
                field, as wide as it, and kept on screen; the popover owns the
                toggle, outside presses and Escape. */}
            <div className="min-w-0 sm:flex-[1_1_0%]">
              <Popover open={principalPickerOpen} onOpenChange={handlePrincipalPickerOpenChange}>
                <PopoverTrigger
                  render={(
                    <button
                      type="button"
                      data-testid="admin-principal-picker"
                      disabled={candidates.length === 0 || savingPrincipalKey != null}
                      className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-control border-[1.5px] border-line-strong bg-layer-card pr-3 pl-3.5 text-left text-subhead font-semibold outline-none hover:press-overlay focus-visible:shadow-focus disabled:cursor-not-allowed disabled:border-line-hairline disabled:bg-fill-muted disabled:text-foreground-disabled"
                    />
                  )}
                >
                  <span className={`truncate ${selectedCandidate ? "text-foreground" : "font-medium text-foreground-hint"}`}>
                    {selectedCandidate
                      ? selectedCandidate.kind === "human" && selectedCandidate.email
                        ? `${getAdminPrincipalLabel(selectedCandidate, formatMessage)} · ${selectedCandidate.email}`
                        : getAdminPrincipalLabel(selectedCandidate, formatMessage)
                      : candidates.length > 0 ? formatMessage({ id: "settings.admins.membersSearchPlaceholder" }) : formatMessage({ id: "settings.admins.noMembers" })}
                  </span>
                  <ChevronRight size={16} className={`shrink-0 text-foreground-hint transition-transform ${principalPickerOpen ? "rotate-90" : ""}`} />
                </PopoverTrigger>
                <SelectionPopover
                  title={formatMessage({ id: "settings.admins.membersPickerTitle" })}
                  width="trigger"
                  searchable
                  search={adminPrincipalSearch}
                  onSearchChange={setAdminPrincipalSearch}
                  searchPlaceholder={formatMessage({ id: "settings.admins.membersSearchPlaceholder" })}
                  emptyLabel={formatMessage({ id: "settings.admins.noMatchingMembers" })}
                  options={popoverOptions}
                  showClear={!!selectedCandidate}
                  onClear={handleClearPrincipal}
                />
              </Popover>
            </div>
            <div className="sm:w-[120px] sm:shrink-0">
              <Select
                value={selectedRole}
                onValueChange={handleSelectedRoleChange}
                items={adminRoleSelectOptions}
                disabled={!selectedCandidate || selectedRoleOptions.length === 0 || savingPrincipalKey != null}
              >
                <SelectTrigger className="w-full min-w-[120px]">
                  <SelectValue placeholder={formatMessage({ id: "settings.admins.rolePlaceholder" })} />
                  <SelectIcon />
                </SelectTrigger>
                <SelectContent>
                  <SelectList>
                    {renderSelectItems(adminRoleSelectOptions)}
                  </SelectList>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="accent" size="lg"
              type="button"
              onClick={handlePromote}
              disabled={!selectedCandidate || selectedRoleOptions.length === 0 || savingPrincipalKey != null}
              className="sm:shrink-0"
            >
              {selectedCandidate && savingPrincipalKey === getAdminPrincipalKey(selectedCandidate) ? formatMessage({ id: "settings.common.saving" }) : formatMessage({ id: "settings.admins.updateRole" })}
            </Button>
          </div>
        </div>

        <div>
          <Separator className="mb-4" />
          {admins.length > 0 ? (
            // DS ListRow › `rf-list--inset`: one card, hairlines between rows.
            <ListRowGroup>
              {admins.map((admin) => (
                <AdminPrincipalRow
                  key={getAdminPrincipalKey(admin)}
                  admin={admin}
                  role={role}
                  ownerCount={ownerCount}
                  savingPrincipalKey={savingPrincipalKey}
                  onDemote={handleDemote}
                />
              ))}
            </ListRowGroup>
          ) : (
            <div className="text-footnote text-foreground-hint">
              {formatMessage({ id: "settings.admins.emptyState" })}
            </div>
          )}
        </div>

        {error && (
          <Banner intent="warning" density="sm">
            {error}
          </Banner>
        )}
      </Card>
    </div>
  );
}

function InvitesSection() {
  const { formatMessage } = useIntl();
  const current = useServerStore((s) => s.current);
  const serverId = current?.id;
  const { capabilities } = useServerPermissions();

  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvite | null>(null);

  const canInvite = capabilities.inviteMembers;

  const loadInvites = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/servers/${serverId}/invites`);
      setInvites(data);
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  // Reload when the active server id (via `loadInvites`) or permission changes.
  useEffect(() => {
    if (serverId && canInvite) {
      void loadInvites();
    }
  }, [canInvite, loadInvites, serverId]);

  const handleRevoke = useCallback(async (inviteId: string) => {
    if (!serverId) return;
    try {
      await api.delete(`/servers/${serverId}/invites/${inviteId}`);
      await loadInvites();
    } catch {
      // Ignore
    }
  }, [loadInvites, serverId]);

  const handleConfirmRevoke = useCallback(
    () => (revokeTarget ? handleRevoke(revokeTarget.id) : undefined),
    [handleRevoke, revokeTarget],
  );
  const handleCloseRevoke = useCallback(() => setRevokeTarget(null), []);

  if (!canInvite) return null;

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Mail size={16} />}
        label={formatMessage({ id: "settings.invites.sectionLabel" })}
        count={invites.length > 0 ? invites.length : null}
      />

      <Card className="p-4">
        {invites.length > 0 ? (
          <div className="divide-y divide-line-hairline">
            {invites.map((invite) => (
              <PendingInviteRow key={invite.id} invite={invite} onRequestRevoke={setRevokeTarget} />
            ))}
          </div>
        ) : !loading ? (
          <div className="text-footnote text-foreground-hint">
            {formatMessage({ id: "settings.invites.emptyState" })}
          </div>
        ) : null}
      </Card>

      {revokeTarget && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "settings.invites.confirmTitle" })}
          message={formatMessage({ id: "settings.invites.confirmMessage" }, { email: revokeTarget.invitedEmail })}
          confirmLabel={formatMessage({ id: "settings.invites.confirmLabel" })}
          loadingLabel={formatMessage({ id: "settings.invites.revoking" })}
          onConfirm={handleConfirmRevoke}
          onClose={handleCloseRevoke}
        />
      )}
    </div>
  );
}

// Shareable web origin, not window.location.origin: the desktop shell's origin
// is `app://raft`, which produces an unopenable invite link. Web is unchanged.
export function buildJoinLinkUrl(token: string) {
  return `${shareableWebOrigin()}/join/${token}`;
}

function JoinLinksSection() {
  const { formatMessage } = useIntl();
  const current = useServerStore((s) => s.current);
  const serverId = current?.id;
  const { capabilities } = useServerPermissions();
  const { formatShortDateTime } = useTimeFormatter();

  const [links, setLinks] = useState<JoinLinkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<JoinLinkRecord | null>(null);

  const canManageLinks = capabilities.inviteMembers;

  const loadLinks = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/servers/${serverId}/join-links`);
      setLinks(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  // Reload when the active server id (via `loadLinks`) or permission changes.
  useEffect(() => {
    if (serverId && canManageLinks) {
      void loadLinks();
    }
  }, [canManageLinks, loadLinks, serverId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setCreating(true);
    setCreateError("");
    try {
      const { data } = await api.post(`/servers/${current.id}/join-links`, {
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setLinks((prev) => [data.link, ...prev]);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || formatMessage({ id: "settings.joinLinks.failedCreate" }));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = useCallback(async (linkId: string, token: string) => {
    await navigator.clipboard.writeText(buildJoinLinkUrl(token));
    setCopiedLinkId(linkId);
    window.setTimeout(() => setCopiedLinkId((current) => current === linkId ? null : current), 1500);
  }, []);

  const handleRevoke = useCallback(async (linkId: string) => {
    if (!serverId) return;
    try {
      await api.delete(`/servers/${serverId}/join-links/${linkId}`);
      setLinks((prev) => prev.filter((link) => link.id !== linkId));
    } catch {
      // Ignore
    }
  }, [serverId]);

  const handleConfirmRevoke = useCallback(
    () => (revokeTarget ? handleRevoke(revokeTarget.id) : undefined),
    [handleRevoke, revokeTarget],
  );
  const handleCloseRevoke = useCallback(() => setRevokeTarget(null), []);
  const handleMaxUsesChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setMaxUses(e.target.value), []);
  const handleExpiresAtChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setExpiresAt(e.target.value), []);

  if (!canManageLinks) return null;

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Link2 size={16} />}
        label={formatMessage({ id: "settings.joinLinks.sectionLabel" })}
        count={links.length > 0 ? links.length : null}
      />

      <Card className="p-4">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label={formatMessage({ id: "settings.joinLinks.maxUses" })} size="compact" htmlFor="join-link-max-uses">
              <Input
                id="join-link-max-uses"
                type="number"
                min="1"
                value={maxUses}
                onChange={handleMaxUsesChange}
                placeholder={formatMessage({ id: "settings.joinLinks.unlimited" })}
                className="w-full"
              />
            </FormField>

            <FormField label={formatMessage({ id: "settings.joinLinks.expiresAt" })} size="compact" htmlFor="join-link-expires-at">
              <Input
                id="join-link-expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={handleExpiresAtChange}
                className="w-full"
              />
            </FormField>
          </div>

          {createError && (
            <Banner intent="warning" density="sm">
              {createError}
            </Banner>
          )}

          <Button
            variant="outline" size="sm"
            type="submit"
            disabled={creating}
          >
            <Plus size={14} />
            {creating ? formatMessage({ id: "settings.joinLinks.creating" }) : formatMessage({ id: "settings.joinLinks.createLink" })}
          </Button>
        </form>

        <div className="mt-4">
          <Separator className="mb-4" />
          {links.length > 0 ? (
            <div className="divide-y divide-line-hairline">
              {links.map((link) => (
                <JoinLinkRow
                  key={link.id}
                  link={link}
                  copied={copiedLinkId === link.id}
                  formatShortDateTime={formatShortDateTime}
                  onCopy={handleCopy}
                  onRequestRevoke={setRevokeTarget}
                />
              ))}
            </div>
          ) : !loading ? (
            <div className="text-footnote text-foreground-hint">
              {formatMessage({ id: "settings.joinLinks.emptyState" })}
            </div>
          ) : null}
        </div>
      </Card>

      {revokeTarget && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "settings.joinLinks.confirmTitle" })}
          message={formatMessage({ id: "settings.joinLinks.confirmMessage" })}
          confirmLabel={formatMessage({ id: "settings.joinLinks.confirmLabel" })}
          loadingLabel={formatMessage({ id: "settings.joinLinks.revoking" })}
          onConfirm={handleConfirmRevoke}
          onClose={handleCloseRevoke}
        />
      )}
    </div>
  );
}

function OnboardingAgentSection() {
  const { formatMessage } = useIntl();
  const navigate = useNavigate();
  const current = useServerStore((s) => s.current);
  const loadServerSettings = useServerStore((s) => s.loadSettings);
  const allAgents = useAgentStore((s) => s.agents);
  const agents = useMemo(() => allAgents.filter((agent) => !agent.deletedAt), [allAgents]);
  const { capabilities, isAdminOrOwner } = useServerPermissions();

  const [onboardingAgentId, setOnboardingAgentId] = useState("");
  const [agentAllChannelGreetingEnabled, setAgentAllChannelGreetingEnabled] = useState(true);
  const [savedOnboardingAgentId, setSavedOnboardingAgentId] = useState("");
  const [savedAgentAllChannelGreetingEnabled, setSavedAgentAllChannelGreetingEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [setupProjection, setSetupProjection] = useState<{
    surface: "none" | "computer_runtime" | "create_agent" | "complete" | "retry";
    phase: "not_started" | "in_progress" | "deferred" | "complete" | null;
  } | null>(null);
  const [reopeningSetup, setReopeningSetup] = useState(false);

  const serverId = current?.id;
  const serverSlug = current?.slug;
  const canManageLinks = capabilities.editServerSettings;
  const onboardingAgentOptions = useMemo<SelectOption[]>(() => [
    { value: "", label: formatMessage({ id: "settings.onboarding.disabledOption" }) },
    ...agents.map((agent) => ({
      value: agent.id,
      label: `@${agent.name}${agent.displayName ? ` (${agent.displayName})` : ""}`,
    })),
  ], [agents, formatMessage]);
  const agentGreetingOptions = useMemo<SelectOption[]>(() => [
    { value: "yes", label: formatMessage({ id: "settings.onboarding.yes" }) },
    { value: "no", label: formatMessage({ id: "settings.onboarding.no" }) },
  ], [formatMessage]);

  // Read at failure time so a locale switch does not refetch the settings.
  const formatLoadError = useEffectEvent(() => formatMessage({ id: "settings.onboarding.failedLoad" }));

  // Async-loader: load onboarding-settings on server change (keyed on the
  // server id, not the whole `current` store object, so unrelated server-store
  // churn does not refetch). Same FP family as PR #2530 useChannelMembers /
  // InviteAcceptPage / AgentSkills loaders.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!serverId || !canManageLinks) return;
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setLoading(true);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setError("");
    void Promise.all([
      loadServerSettings(),
      api.get(`/servers/${serverId}/setup-projection`).catch(() => null),
    ])
      .then(([settings, projectionResponse]) => {
        if (!settings) throw new Error("Server settings unavailable");
        const data = settings.onboardSettings;
        const nextOnboardingAgentId = data.onboardingAgentId || "";
        const nextAgentAllChannelGreetingEnabled = data.agentAllChannelGreetingEnabled !== false;
        setOnboardingAgentId(nextOnboardingAgentId);
        setAgentAllChannelGreetingEnabled(nextAgentAllChannelGreetingEnabled);
        setSavedOnboardingAgentId(nextOnboardingAgentId);
        setSavedAgentAllChannelGreetingEnabled(nextAgentAllChannelGreetingEnabled);
        setSetupProjection(projectionResponse?.data ?? null);
        setSaved(false);
      })
      .catch(() => {
        setError(formatLoadError());
      })
      .finally(() => {
        setLoading(false);
      });
  }, [canManageLinks, loadServerSettings, serverId]);

  const dirty =
    onboardingAgentId !== savedOnboardingAgentId
    || agentAllChannelGreetingEnabled !== savedAgentAllChannelGreetingEnabled;

  const handleSave = useCallback(async () => {
    if (!serverId || !canManageLinks) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api.patch(`/servers/${serverId}/onboarding-settings`, {
        onboardingAgentId: onboardingAgentId || null,
        agentAllChannelGreetingEnabled,
      });
      await loadServerSettings({ force: true });
      setSavedOnboardingAgentId(onboardingAgentId);
      setSavedAgentAllChannelGreetingEnabled(agentAllChannelGreetingEnabled);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.onboarding.failedSave" }));
    } finally {
      setSaving(false);
    }
  }, [agentAllChannelGreetingEnabled, canManageLinks, formatMessage, loadServerSettings, onboardingAgentId, serverId]);

  const handleFinishSetup = useCallback(async () => {
    if (!serverId || !isAdminOrOwner || reopeningSetup) return;
    setReopeningSetup(true);
    setError("");
    try {
      const { data } = await api.post(`/servers/${serverId}/setup-transition`, { action: "start" });
      setSetupProjection(data);
      // Tell the gate. Without this the server reopened setup and the only visible effect
      // was a navigation: the modal that was supposed to appear never heard about it.
      bumpServerSetupRevision();
      navigate(`/s/${serverSlug}`);
    } catch (error: unknown) {
      const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data?.error;
      setError(typeof responseError === "string" ? responseError : formatMessage({ id: "settings.onboarding.reopenSetupFailed" }));
    } finally {
      setReopeningSetup(false);
    }
  }, [formatMessage, isAdminOrOwner, navigate, reopeningSetup, serverId, serverSlug]);

  const handleOnboardingAgentChange = useCallback((value: string | null) => {
    if (value == null) return;
    setOnboardingAgentId(value);
    setSaved(false);
  }, []);

  const handleGreetingChange = useCallback((value: string | null) => {
    if (value == null) return;
    setAgentAllChannelGreetingEnabled(value === "yes");
    setSaved(false);
  }, []);

  if (!canManageLinks) return null;

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Bot size={16} />}
        label={formatMessage({ id: "settings.onboarding.sectionLabel" })}
      />

      <Card className="p-4">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 pr-0 sm:pr-4">
              <div className="text-subhead font-semibold text-foreground">
                {formatMessage({ id: "settings.onboarding.humanAgentTitle" })}
              </div>
              <div className="mt-0.5 text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.onboarding.humanAgentDescription" })}
              </div>
            </div>
            <div className="w-full sm:w-80 sm:shrink-0">
              <Select
                value={onboardingAgentId}
                onValueChange={handleOnboardingAgentChange}
                disabled={!canManageLinks || saving || loading}
                items={onboardingAgentOptions}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={formatMessage({ id: "settings.onboarding.agentPlaceholder" })} />
                  <SelectIcon />
                </SelectTrigger>
                <SelectContent>
                  <SelectList>
                    {renderSelectItems(onboardingAgentOptions)}
                  </SelectList>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 pr-0 sm:pr-4">
              <div className="text-subhead font-semibold text-foreground">
                {formatMessage({ id: "settings.onboarding.greetingTitle" })}
              </div>
              <div className="mt-0.5 text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.onboarding.greetingDescription" })}
              </div>
            </div>
            <div className="w-full sm:w-28 sm:shrink-0">
              <Select
                value={agentAllChannelGreetingEnabled ? "yes" : "no"}
                onValueChange={handleGreetingChange}
                disabled={!canManageLinks || saving || loading}
                items={agentGreetingOptions}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={formatMessage({ id: "settings.onboarding.greetingPlaceholder" })} />
                  <SelectIcon />
                </SelectTrigger>
                <SelectContent>
                  <SelectList>
                    {renderSelectItems(agentGreetingOptions)}
                  </SelectList>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {error && (
          <Banner intent="warning" density="sm" className="mt-2">
            {error}
          </Banner>
        )}

        <div className="mt-2 flex items-center justify-between">
          {!canManageLinks && (
            <div className="text-footnote text-foreground-hint">{formatMessage({ id: "settings.onboarding.adminOnly" })}</div>
          )}
          <Button
            variant="accent" size="sm"
            type="button"
            onClick={handleSave}
            disabled={!canManageLinks || !dirty || saving || loading}
          >
            {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? formatMessage({ id: "settings.common.saved" }) : formatMessage({ id: "settings.common.save" })}
          </Button>
        </div>

        {/* Who may see the setup flow is the SERVER's answer, in one place: a non-owner's
            projection comes back `surface: "none"`. Re-deriving it here from the client's own
            role would be a second opinion that can drift — hide it in one surface, leak it in
            another (@Jianwei's point). The projection alone decides. */}
        {setupProjection && setupProjection.phase !== "complete" && setupProjection.surface !== "none" ? (
          <div className="mt-4">
            <Separator className="mb-3" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.onboarding.serverSetupTitle" })}</div>
                <div className="mt-0.5 text-footnote text-foreground-muted">{formatMessage({ id: "settings.onboarding.serverSetupDescription" })}</div>
              </div>
              <Button
                variant="outline" size="sm"
                type="button"
                onClick={handleFinishSetup}
                disabled={reopeningSetup}
                className="ml-4 shrink-0"
                data-testid="finish-server-setup"
              >
                {formatMessage({ id: reopeningSetup ? "settings.onboarding.openingSetup" : "settings.onboarding.finishSetup" })}
                {!reopeningSetup && <ChevronRight size={14} />}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function MemberPermissionsSection() {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const updateServerProfile = useServerStore((s) => s.updateServerProfile);
  const { capabilities } = useServerPermissions();
  const canEdit = capabilities.editServerSettings;

  const [hideHumansFromMembers, setHideHumansFromMembers] = useState(server?.hideHumansFromMembers ?? false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Server-scoped form re-sync — same shape as L609/L616 / PR #2539 family.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setHideHumansFromMembers(server?.hideHumansFromMembers ?? false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setSaved(false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setError("");
  }, [server?.id, server?.hideHumansFromMembers]);

  const handleHideHumansChange = useCallback((checked: boolean) => setHideHumansFromMembers(checked), []);

  if (!server) return null;

  const dirty = hideHumansFromMembers !== server.hideHumansFromMembers;

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updateServerProfile({ hideHumansFromMembers });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.memberPermissions.failedUpdate" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Users size={16} />}
        label={formatMessage({ id: "settings.memberPermissions.sectionLabel" })}
      />

      <Card render={<form onSubmit={handleSave} />} className="block space-y-3 p-4">
        <label className={`flex items-start gap-3 ${!canEdit ? "cursor-not-allowed" : ""}`}>
          <Checkbox
            checked={hideHumansFromMembers}
            disabled={!canEdit || saving}
            onCheckedChange={handleHideHumansChange}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className={`block text-subhead font-semibold ${!canEdit ? "text-foreground-disabled" : "text-foreground"}`}>{formatMessage({ id: "settings.memberPermissions.hideHumansTitle" })}</span>
            <span className="block text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.memberPermissions.hideHumansDescription" })}
            </span>
          </span>
        </label>

        {error && (
          <Banner intent="warning" density="sm">{error}</Banner>
        )}

        {canEdit && (
          <Button
            variant="accent" size="sm"
            type="submit"
            disabled={!dirty || saving}
            className="flex items-center gap-1.5"
          >
            {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? (
              <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
            ) : formatMessage({ id: "settings.common.save" })}
          </Button>
        )}
      </Card>
    </div>
  );
}

function SystemChannelsSection() {
  const { formatMessage } = useIntl();
  const { capabilities } = useServerPermissions();
  const channels = useChannelStore((s) => s.channels);
  const channelsLoading = useChannelStore((s) => s.loading);
  const restoreAllChannel = useChannelStore((s) => s.restoreAllChannel);
  const hideAllChannel = useChannelStore((s) => s.hideAllChannel);
  const allChannel = channels.find((channel) => channel.name === "all");
  const currentAllChannelHidden = !allChannel;
  const showSystemChannelSettings = capabilities.changeChannelVisibility && !channelsLoading;
  const [allChannelHidden, setAllChannelHidden] = useState(currentAllChannelHidden);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Settings-scoped re-sync for the virtual system #all state.
  // oxlint-disable-next-line react-doctor/no-derived-state-effect, react-doctor/no-cascading-set-state
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setAllChannelHidden(currentAllChannelHidden);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setSaved(false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setError("");
  }, [currentAllChannelHidden]);

  const handleAllChannelHiddenChange = useCallback((checked: boolean) => {
    setAllChannelHidden(checked);
    setSaved(false);
  }, []);

  if (!showSystemChannelSettings) return null;

  const dirty = allChannelHidden !== currentAllChannelHidden;

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      if (allChannelHidden) {
        // Previously went through the generic channel-visibility PATCH. The
        // server now refuses #all on that field; hiding has its own endpoint,
        // and it needs no channel id.
        await hideAllChannel();
      } else {
        await restoreAllChannel();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.systemChannels.failedUpdate" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Eye size={16} />}
        label={formatMessage({ id: "settings.systemChannels.sectionLabel" })}
      />

      <Card render={<form onSubmit={handleSave} />} className="block space-y-3 p-4">
        <label className={`flex items-start gap-3 ${saving ? "cursor-not-allowed" : ""}`}>
          <Checkbox
            checked={allChannelHidden}
            disabled={saving}
            onCheckedChange={handleAllChannelHiddenChange}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className={`block text-subhead font-semibold ${saving ? "text-foreground-disabled" : "text-foreground"}`}>{formatMessage({ id: "settings.systemChannels.hideAllTitle" })}</span>
            <span className="block text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.systemChannels.hideAllDescription" })}
            </span>
          </span>
        </label>

        {error && (
          <Banner intent="warning" density="sm">{error}</Banner>
        )}

        <Button

          variant="accent" size="sm"
          type="submit"
          disabled={!dirty || saving}
          className="flex items-center gap-1.5"
        >
          {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? (
            <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
          ) : formatMessage({ id: "settings.common.save" })}
        </Button>
      </Card>
    </div>
  );
}

function ServerTranslationSection() {
  const { formatMessage } = useIntl();
  const currentServer = useServerStore((s) => s.current);
  const settings = useTranslationStore((s) => s.settings);
  const settingsLoading = useTranslationStore((s) => s.settingsLoading);
  const settingsError = useTranslationStore((s) => s.settingsError);
  const loadSettings = useTranslationStore((s) => s.loadSettings);
  const updateServerTranslationEnabled = useTranslationStore((s) => s.updateServerTranslationEnabled);

  const [enabled, setEnabled] = useState(settings.serverTranslationEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSettings(currentServer?.id);
  }, [currentServer?.id, loadSettings]);

  // Settings-scoped re-sync (implicit server scope via settings store).
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setEnabled(settings.serverTranslationEnabled);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setSaved(false);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setError("");
  }, [settings.serverTranslationEnabled]);

  const handleEnabledChange = useCallback((checked: boolean) => setEnabled(checked), []);

  if (!currentServer) return null;

  const dirty = enabled !== settings.serverTranslationEnabled;
  const showProviderWarning = enabled && !settings.providerAvailable;

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await updateServerTranslationEnabled(enabled);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.serverTranslation.failedUpdate" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<Languages size={16} />}
        label={formatMessage({ id: "settings.serverTranslation.sectionLabel" })}
      />

      <Card render={<form onSubmit={handleSave} />} className="block space-y-3 p-4">
        <label className={`flex items-start gap-3 ${settingsLoading || !settings.canManageServerTranslation ? "cursor-not-allowed" : ""}`}>
          <Checkbox
            checked={enabled}
            disabled={saving || settingsLoading || !settings.canManageServerTranslation}
            onCheckedChange={handleEnabledChange}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className={`block text-subhead font-semibold ${settingsLoading || !settings.canManageServerTranslation ? "text-foreground-disabled" : "text-foreground"}`}>{formatMessage({ id: "settings.serverTranslation.enableTitle" })}</span>
            <span className="block text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.serverTranslation.enableDescription" })}
            </span>
          </span>
        </label>

        {showProviderWarning && (
          <Banner intent="warning" density="sm">
            {formatMessage({ id: "settings.serverTranslation.providerWarning" })}
          </Banner>
        )}

        {(settingsError || error) && (
          <Banner intent="warning" density="sm">{error || settingsError}</Banner>
        )}

        {settings.canManageServerTranslation && (
          <Button
            variant="accent" size="sm"
            type="submit"
            disabled={!dirty || saving || settingsLoading}
            className="flex items-center gap-1.5"
          >
            {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? (
              <><Check size={14} /> {formatMessage({ id: "settings.common.saved" })}</>
            ) : formatMessage({ id: "settings.common.save" })}
          </Button>
        )}
      </Card>
    </div>
  );
}

// ── Plan & Billing Section ──

function PlanBillingLoadingSection() {
  const { formatMessage } = useIntl();
  return (
    <div className="mb-6" aria-busy="true">
      <SectionHeader
        className="mb-3"
        icon={<CreditCard size={16} />}
        label={formatMessage({ id: "billing.planBilling" })}
      />
      <Card className="mb-6">
        <div className="border-b border-line-hairline px-4 py-4">
          <Skeleton variant="line" className="mb-2 h-5 w-32" />
          <Skeleton variant="line" className="h-4 w-64 max-w-full" />
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {[0, 1].map((column) => (
            <div key={column}>
              <Skeleton variant="line" className="mb-3 h-4 w-24" />
              <div className="space-y-3">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-start gap-3">
                    <Skeleton variant="block" className="mt-0.5 h-4 w-4" />
                    <Skeleton variant="line" className={row === 2 ? "w-3/5" : row === 1 ? "w-4/5" : "w-full"} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator />
        <div className="px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["billing.seat", "billing.messageHistory", "billing.fileUploads"] as const).map((label) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-footnote font-semibold text-foreground-muted">{formatMessage({ id: label })}</span>
                <Skeleton variant="line" className="w-20" />
              </div>
            ))}
          </div>
        </div>

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Skeleton variant="block" className="h-8 w-28" />
          <Skeleton variant="block" className="h-8 w-44" />
        </div>
      </Card>

      <SectionHeader
        className="mb-3"
        icon={<Plus size={16} />}
        label={formatMessage({ id: "billing.managePlan" })}
      />
      <Card className="mb-6 grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <Skeleton variant="line" className="mb-3 h-4 w-56 max-w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton variant="block" className="h-8 w-24" />
            <Skeleton variant="line" className="w-48 max-w-full" />
          </div>
          <Skeleton variant="block" className="mt-4 h-8 w-32" />
        </div>

        <Card className="p-4">
          <Skeleton variant="line" className="mb-4 h-3 w-32" />
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3">
                <Skeleton variant="line" className="w-28" />
                <Skeleton variant="line" className="w-16" />
              </div>
            ))}
          </div>
        </Card>
      </Card>
    </div>
  );
}

export function DowngradeWarningCard({ server, usage }: { server: { planDowngradedAt: string | null }; usage: { agents: number; machines: number; channels?: number } | null }) {
  const { formatMessage } = useIntl();
  if (!server.planDowngradedAt) return null;


  const downgradedAt = new Date(server.planDowngradedAt);
  const graceEnd = new Date(downgradedAt);
  graceEnd.setDate(graceEnd.getDate() + DOWNGRADE_GRACE_PERIOD_DAYS);
  const now = new Date();
  const graceExpired = now >= graceEnd;
  const daysLeft = graceExpired
    ? 0
    : Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const limits = getEffectiveLimits("free");
  const agentCount = usage?.agents ?? 0;
  const machineCount = usage?.machines ?? 0;
  const channelCount = usage?.channels ?? 0;
  const excessAgents = getFinitePlanLimitExcess(agentCount, limits.maxAgents);
  const excessMachines = getFinitePlanLimitExcess(machineCount, limits.maxMachines);
  const excessChannels = getFinitePlanLimitExcess(channelCount, limits.maxChannels);

  return (
    // A problem with a deadline: the orange warning banner (problems are
    // orange; red is only for what cannot be undone).
    <Banner
      intent="warning"
      withIcon
      className="mb-4"
      title={graceExpired ? formatMessage({ id: "billing.gracePeriodExpired" }) : formatMessage({ id: "billing.planDowngraded" })}
    >
      {graceExpired ? (
        <p>
          {formatMessage({ id: "billing.theGracePeriodHasEndedExcessAgentsHaveBeenSt" })}
        </p>
      ) : (
        <>
                <p className="mb-2">
                  {formatMessage(
                    {
                      id: excessAgents === 0 && excessMachines === 0 && excessChannels === 0
                        ? "billing.graceAllWithinLimits"
                        : "billing.graceExcessWillStop",
                    },
                    { days: daysLeft, b: (chunks) => <span key="b" className="font-bold text-foreground">{chunks}</span> },
                  )}
                </p>
          {(excessAgents > 0 || excessMachines > 0 || excessChannels > 0) && (
            <div className="space-y-1">
              {excessAgents > 0 && (
                <div>
                  {formatMessage(
                      { id: "billing.agentsOverLimit" },
                      { count: excessAgents, b: (chunks) => <span key="b" className="font-bold text-foreground">{chunks}</span> },
                    )} <span className="font-mono text-mono-meta">({agentCount}/{limits.maxAgents})</span>
                </div>
              )}
              {excessMachines > 0 && (
                <div>
                  {formatMessage(
                      { id: "billing.computersOverLimit" },
                      { count: excessMachines, b: (chunks) => <span key="b" className="font-bold text-foreground">{chunks}</span> },
                    )} <span className="font-mono text-mono-meta">({machineCount}/{limits.maxMachines})</span>
                </div>
              )}
              {excessChannels > 0 && (
                <div>
                  {formatMessage(
                      { id: "billing.channelsOverLimit" },
                      { count: excessChannels, b: (chunks) => <span key="b" className="font-bold text-foreground">{chunks}</span> },
                    )} <span className="font-mono text-mono-meta">({channelCount}/{limits.maxChannels})</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Banner>
  );
}

export interface BillingSeatUpdatePreview {
  status: "preview";
  currentPackQuantity: number;
  requestedPackQuantity: number;
  currency: string;
  prorationAmount: number;
  recurringAmount: number;
  discountAmount: number;
  promotion: {
    code: string;
    name: string | null;
    percentOff: number | null;
    amountOff: number | null;
    currency: string | null;
  } | null;
  previewToken: string;
  expiresAt: string;
}

// Stryker disable all: Settings billing UI wiring is covered by billingSeatInput behavior tests, source-copy contracts, and visual preview screenshots.
// The billing draft lives above PlanSection's loading gate: `loadBilling()`
// flips the section back to its skeleton mid-action, and the notice, error and
// draft it leaves behind must survive that remount of PlanSectionContent.
export function usePlanBillingDraft() {
  const [billingAction, setBillingAction] = useState<"checkout" | "portal" | "preview" | "update" | "cancel" | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [desiredSeatOverride, setDesiredSeatOverride] = useState<number | null>(null);
  const [desiredSeatInput, setDesiredSeatInput] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(DEFAULT_BILLING_INTERVAL);
  const [showCancelSubscriptionConfirm, setShowCancelSubscriptionConfirm] = useState(false);
  const [confirmBillingAction, setConfirmBillingAction] = useState<"checkout" | "update" | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [seatUpdatePreview, setSeatUpdatePreview] = useState<BillingSeatUpdatePreview | null>(null);
  return {
    billingAction, setBillingAction,
    billingError, setBillingError,
    billingNotice, setBillingNotice,
    desiredSeatOverride, setDesiredSeatOverride,
    desiredSeatInput, setDesiredSeatInput,
    billingInterval, setBillingInterval,
    showCancelSubscriptionConfirm, setShowCancelSubscriptionConfirm,
    confirmBillingAction, setConfirmBillingAction,
    promotionCode, setPromotionCode,
    seatUpdatePreview, setSeatUpdatePreview,
  };
}

export function PlanSection() {
  const server = useServerStore((s) => s.current);
  const usage = useServerStore((s) => s.usage);
  const billing = useServerStore((s) => s.billing);
  const loadingUsage = useServerStore((s) => s.loadingUsage);
  const loadingBilling = useServerStore((s) => s.loadingBilling);
  const loadUsage = useServerStore((s) => s.loadUsage);
  const loadBilling = useServerStore((s) => s.loadBilling);
  const draft = usePlanBillingDraft();

  useEffect(() => {
    loadUsage();
    loadBilling();
  }, [loadBilling, loadUsage]);

  if (!server || loadingUsage || loadingBilling) {
    return <PlanBillingLoadingSection />;
  }

  return <PlanSectionContent server={server} usage={usage} billing={billing} loadBilling={loadBilling} draft={draft} />;
}

// Stryker restore all

// ── Danger Zone Section ──
// Owner sees Delete Server (destructive).
// Admin/member see Leave Server (non-destructive, warning level).

function DangerActionCard({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  testId,
  actionTestId,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon: ReactNode;
  onAction: () => void;
  testId: string;
  actionTestId?: string;
}) {
  return (
    <Card data-testid={testId} className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-subhead font-semibold text-foreground">{title}</div>
          <p className="mt-0.5 text-footnote text-foreground-muted">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          
          variant="danger"
          onClick={onAction}
          className="shrink-0 self-start sm:ml-4 sm:self-auto"
          data-testid={actionTestId}
        >
          {actionIcon}
          {actionLabel}
        </Button>
      </div>
    </Card>
  );
}

function DangerZoneSection() {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const leaveServer = useServerStore((s) => s.leaveServer);
  const { isOwner, role } = useServerPermissions();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const handleCloseDelete = useCallback(() => setShowDeleteConfirm(false), []);

  const handleLeave = useCallback(async () => {
    requestServerSelection();
    await leaveServer();
  }, [leaveServer]);

  const handleOpenLeave = useCallback(() => setShowLeaveConfirm(true), []);
  const handleCloseLeave = useCallback(() => setShowLeaveConfirm(false), []);
  const handleOpenDelete = useCallback(() => setShowDeleteConfirm(true), []);

  if (!server) return null;
  const canLeave = role === "admin" || role === "member" || role === "guest";

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<AlertTriangle size={16} />}
        label={formatMessage({ id: "settings.dangerZone.sectionLabel" })}
      />

      {canLeave && (
        <Card className="mb-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.dangerZone.leaveServerTitle" })}</div>
              <p className="text-footnote text-foreground-muted mt-0.5">
                {formatMessage({ id: "settings.dangerZone.leaveServerDescription" })}
              </p>
            </div>
            <Button
              variant="warning" size="sm" type="button"
              data-testid="server-danger-leave-button"
              onClick={handleOpenLeave}
              className="ml-4 shrink-0"
            >
              {formatMessage({ id: "settings.dangerZone.leaveServer" })}
            </Button>
          </div>
        </Card>
      )}

      {isOwner && (
        <DangerActionCard
          testId="server-danger-delete-card"
          actionTestId="server-danger-delete-button"
          title={formatMessage({ id: "settings.dangerZone.deleteServerTitle" })}
          description={formatMessage({ id: "settings.dangerZone.deleteServerDescription" })}
          actionLabel={formatMessage({ id: "settings.dangerZone.deleteServer" })}
          actionIcon={<Trash2 size={14} />}
          onAction={handleOpenDelete}
        />
      )}

      {showLeaveConfirm && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "settings.dangerZone.leaveServerTitle" })}
          message={formatMessage({ id: "settings.dangerZone.leaveConfirmMessage" }, { serverName: server.name })}
          confirmLabel={formatMessage({ id: "settings.dangerZone.leaveServer" })}
          loadingLabel={formatMessage({ id: "settings.dangerZone.leaving" })}
          confirmVariant="warning"
          confirmTestId="server-leave-confirm-button"
          onConfirm={handleLeave}
          onClose={handleCloseLeave}
        />
      )}

      {showDeleteConfirm && <DeleteServerConfirmDialog onClose={handleCloseDelete} />}
    </div>
  );
}

export type ConnectedAppStatus = "private" | "publish_requested" | "in_review" | "published" | "rejected" | "unpublish_requested";
export type ConnectedAppsViewMode = "grid" | "list";

const CONNECTED_APPS_VIEW_MODE_STORAGE_KEY = "raft:connected-apps:view-mode";
const CONNECTED_APP_EDITOR_SECTION_IDS = ["profile", "login", "setup", "permissions", "notifications", "distribution", "danger"] as const;
export type ConnectedAppEditorSectionId = typeof CONNECTED_APP_EDITOR_SECTION_IDS[number];

export function canEditSourceOwnedConnectedApp(status: ConnectedAppStatus) {
  return status === "private" || status === "publish_requested" || status === "in_review" || status === "published" || status === "rejected";
}

function canDeleteSourceOwnedConnectedApp(status: ConnectedAppStatus) {
  return status === "private" || status === "publish_requested" || status === "in_review" || status === "rejected";
}

function canRequestOfflineSourceOwnedConnectedApp(status: ConnectedAppStatus) {
  return status === "published";
}

export function sourceOwnedConnectedAppStatusHint(status: ConnectedAppStatus): MessageId | null {
  if (status === "publish_requested" || status === "in_review") {
    return "settings.connectedApps.editor.statusHint.reviewPending";
  }
  if (status === "unpublish_requested") {
    return "settings.connectedApps.editor.statusHint.offlinePending";
  }
  return null;
}

// Returns a catalog id, not display text: keeps the helper pure and lets the
// MessageId type prove every arm resolves to a real entry. Callers formatMessage.
export function connectedAppOverviewDistributionLabel(status: ConnectedAppStatus): MessageId {
  if (status === "publish_requested" || status === "in_review") return "settings.connectedApps.editor.distribution.reviewPending";
  if (status === "unpublish_requested") return "settings.connectedApps.editor.distribution.offlineRequested";
  if (status === "published") return "settings.connectedApps.editor.distribution.published";
  if (status === "rejected") return "settings.connectedApps.editor.distribution.rejected";
  return "settings.connectedApps.editor.distribution.private";
}

export function connectedAppDistributionStatus(status: ConnectedAppStatus | null): MessageId {
  if (!status) return "settings.connectedApps.editor.distribution.availableAfterSave";
  if (status === "publish_requested" || status === "in_review") return "settings.connectedApps.editor.distribution.reviewPending";
  if (status === "unpublish_requested") return "settings.connectedApps.editor.distribution.offlinePending";
  if (status === "published") return "settings.connectedApps.editor.distribution.published";
  if (status === "rejected") return "settings.connectedApps.editor.distribution.rejected";
  return "settings.connectedApps.editor.distribution.private";
}

// Exported for settingsSubBatchF.i18n.behavior.test.tsx — presentational, so the
// zh tooth renders the real component with no API/data harness.
export function ConnectedAppDistributionBadge({ status }: { status: ConnectedAppStatus | null }) {
  // useIntl() must stay above the early return — hooks cannot be conditional.
  const { formatMessage } = useIntl();
  if (!status) return null;
  const label = formatMessage({ id: connectedAppOverviewDistributionLabel(status) });
  if (status === "published") return <Badge appearance="soft" variant="success">{label}</Badge>;
  if (status === "publish_requested" || status === "in_review" || status === "unpublish_requested" || status === "rejected") {
    return <Badge appearance="soft" variant="warning">{label}</Badge>;
  }
  return <Badge appearance="soft" variant="muted">{label}</Badge>;
}

function getInitialConnectedAppsViewMode(): ConnectedAppsViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    return window.localStorage.getItem(CONNECTED_APPS_VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function ConnectedAppsViewToggle({
  value,
  onValueChange,
}: {
  value: ConnectedAppsViewMode;
  onValueChange: (value: ConnectedAppsViewMode) => void;
}) {
  const { formatMessage } = useIntl();
  const gridLabel = formatMessage({ id: "settings.connectedApps.gridView" });
  const listLabel = formatMessage({ id: "settings.connectedApps.listView" });
  const groupValue = useMemo(() => [value], [value]);
  const handleGroupValueChange = useCallback((values: string[]) => {
    const next = values[0];
    if (next === "grid" || next === "list") onValueChange(next);
  }, [onValueChange]);
  return (
    <ToggleGroup
      value={groupValue}
      onValueChange={handleGroupValueChange}
      aria-label={formatMessage({ id: "settings.connectedApps.viewMode" })}
      className="box-border shrink-0"
      data-testid="connected-apps-view-toggle"
    >
      <Tooltip content={gridLabel}>
      <ToggleGroupItem value="grid" aria-label={gridLabel} className="h-8 w-8" data-slot="toggle-group-item">
        <LayoutGrid size={16} />
      </ToggleGroupItem>
      </Tooltip>
      <Tooltip content={listLabel}>
      <ToggleGroupItem value="list" aria-label={listLabel} className="h-8 w-8" data-slot="toggle-group-item">
        <List size={16} />
      </ToggleGroupItem>
      </Tooltip>
    </ToggleGroup>
  );
}

function connectedAppsCollectionClassName(viewMode: ConnectedAppsViewMode) {
  return viewMode === "grid" ? "grid gap-3 md:grid-cols-2" : "space-y-2";
}

function AppNotificationsLabel() {
  const { formatMessage } = useIntl();
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span>{formatMessage({ id: "settings.connectedApps.section.webhook" })}</span>
      <Badge.Experimental />
    </span>
  );
}

/**
 * One part of the app editor: raft-ui's FormSection (small heading, its
 * status as a quiet tag, a line on what it is for) with a stable anchor the
 * editor's section list scrolls to.
 */
function ConnectedAppEditorSection({
  sectionId,
  title,
  description,
  status,
  children,
}: {
  sectionId: ConnectedAppEditorSectionId;
  title: ReactNode;
  description: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <FormSection
      id={`connected-app-editor-${sectionId}`}
      data-testid={`connected-app-editor-section-${sectionId}`}
      title={title}
      status={status}
      description={description}
    >
      {children}
    </FormSection>
  );
}

/**
 * An action inside an editor section (share link, publish request, client
 * secret, delete): what it does on the left, its button on the right, and
 * whatever it reveals (the share URL) underneath. Plain rows in the section,
 * not cards inside a card.
 */
function ConnectedAppEditorActionRow({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-3 [&+&]:mt-1" data-testid={testId}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-subhead font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-footnote text-foreground-muted">{description}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
      </div>
      {children}
    </div>
  );
}

type ConnectedAppCategory = OAuthClientCategory;

type ConnectedAppListing = {
  setupUrl?: string | null;
  setupDescription?: string | null;
  id: string;
  clientId: string;
  name: string;
  category: ConnectedAppCategory;
  developer: string;
  description: string;
  homepageUrl: string | null;
  homepageDomain: string;
  callbackDomain: string;
  logoUrl: string | null;
  defaultLogoSeed: string;
  installed: boolean;
  official: boolean;
  marketplaceInstallBadge: MarketplaceInstallBadge;
  allowedScopes: string[] | null;
  appNotificationGroups: AppNotificationSelection["groups"];
  appNotificationEvents: AppNotificationSelection["events"];
  appNotificationReviewPending: boolean;
  appNotificationPendingRevisionId: string | null;
  appNotificationPendingGroups: AppNotificationSelection["groups"];
  appNotificationPendingEvents: AppNotificationSelection["events"];
  canReviewAppNotifications: boolean;
};

export type InstalledConnectedApp = {
  setupUrl?: string | null;
  setupDescription?: string | null;
  id: string;
  clientId: string;
  name: string;
  developer: string;
  description: string | null;
  homepageUrl: string | null;
  homepageDomain: string | null;
  callbackDomain: string | null;
  logoUrl: string | null;
  defaultLogoSeed: string;
  origin: "marketplace" | "private";
  privateShared: boolean;
  editable: boolean;
  official: boolean;
  allowedScopes: string[] | null;
  grantedScopes: string[];
  sourceClientId?: string;
  category: ConnectedAppCategory;
  publishStatus: ConnectedAppStatus | null;
};

// Exported for settingsSubBatchD.i18n.behavior.test.tsx — pure presentational,
// so the zh teeth render the real component with no API/data harness.
export function ConnectedAppOriginBadges({ app, className = "" }: { app: InstalledConnectedApp; className?: string }) {
  // useIntl() must stay above the early return — hooks cannot be conditional.
  const { formatMessage } = useIntl();
  if (!app.privateShared && app.origin !== "private") return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      {app.privateShared ? <Badge appearance="soft">{formatMessage({ id: "settings.connectedApps.sharedBadge" })}</Badge> : null}
      {app.origin === "private" ? <Badge appearance="soft" variant="information">{formatMessage({ id: "settings.connectedApps.thisServerBadge" })}</Badge> : null}
    </div>
  );
}

export type ServerRegisteredApp = OAuthClientRecord & {
  status: ConnectedAppStatus;
  logoUrl: string | null;
  defaultLogoSeed: string;
};

const CONNECTED_APP_CATEGORY_OPTIONS: { value: ConnectedAppCategory | "all" }[] = [
  { value: "all" },
  ...OAUTH_CLIENT_CATEGORIES.map((value) => ({ value })),
];
const CONNECTED_APP_PUBLISH_CATEGORY_OPTIONS = OAUTH_CLIENT_CATEGORIES.map((value) => ({ value }));

// Category enum values are data; the display labels live in the catalog.
export const CONNECTED_APP_CATEGORY_LABEL_ID: Record<string, MessageId> = {
  all: "settings.connectedApps.categoryAll",
  "AI & Automation": "settings.connectedApps.categoryAiAutomation",
  Communication: "settings.connectedApps.categoryCommunication",
  "Productivity & Collaboration": "settings.connectedApps.categoryProductivity",
  "Developer Tools": "settings.connectedApps.categoryDeveloperTools",
  "Data & Analytics": "settings.connectedApps.categoryDataAnalytics",
  "Business Ops": "settings.connectedApps.categoryBusinessOps",
  Infrastructure: "settings.connectedApps.categoryInfrastructure",
  "Content & Creative": "settings.connectedApps.categoryContentCreative",
  Other: "settings.connectedApps.categoryOther",
};

export function matchesConnectedAppFilter(
  app: { name: string; category: ConnectedAppCategory; description?: string | null; developer?: string | null; clientId?: string | null },
  normalizedSearch: string,
  category: ConnectedAppCategory | "all",
) {
  if (category !== "all" && app.category !== category) return false;
  if (!normalizedSearch) return true;
  return [app.name, app.description, app.developer, app.clientId]
    .some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function getDomainFromUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname;
  } catch {
    return trimmed;
  }
}

function initialsForApp(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2
    ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
    : (parts[0] ?? "A").slice(0, 2);
  return letters.toUpperCase() || "A";
}

export function ConnectedAppSummary({ description }: { description?: string | null }) {
  const text = description?.trim();
  if (!text) return null;
  return (
    <Tooltip content={text}>
    <div className="mt-1 line-clamp-2 break-words text-callout text-foreground-muted">
      {text}
    </div>
    </Tooltip>
  );
}

const MARKETPLACE_INSTALL_BUCKET_LABEL: Record<Extract<MarketplaceInstallBadge, { kind: "bucket" }>["bucket"], string> = {
  "10_plus": "10+",
  "100_plus": "100+",
  "1k_plus": "1k+",
};

export function ConnectedAppMarketplaceInstallBadge({ badge }: { badge: MarketplaceInstallBadge }) {
  const { formatMessage } = useIntl();
  if (badge.kind === "none") return null;
  if (badge.kind === "new") {
    return <Badge appearance="soft" variant="information">{formatMessage({ id: "settings.connectedApps.marketplaceNew" })}</Badge>;
  }
  return (
    <Badge appearance="outline">
      {formatMessage(
        { id: "settings.connectedApps.marketplaceInstallCount" },
        { count: MARKETPLACE_INSTALL_BUCKET_LABEL[badge.bucket] },
      )}
    </Badge>
  );
}

export function ConnectedAppLogo({ name, logoUrl, seed, size = "md" }: { name: string; logoUrl?: string | null; seed: string; size?: "sm" | "md" | "lg" }) {
  return (
    <AvatarSlot
      context={size === "lg" ? "account-tile" : size === "md" ? "mention-card" : "list-row"}
      type="app"
      appAvatarUrl={logoUrl}
      appInitials={initialsForApp(name || seed)}
    />
  );
}

export function ConnectedAppUrlLink({ url, label, className = "" }: { url?: string | null; label?: string | null; className?: string }) {
  const href = url?.trim();
  if (!href) return null;
  const visibleLabel = label?.trim() || href;
  return (
    <Tooltip content={href}>
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sticker font-mono text-mono-meta text-foreground-muted underline decoration-[1.5px] underline-offset-[3px] outline-none hover:text-foreground focus-visible:shadow-focus ${className}`.trim()}
    >
      <ExternalLink size={12} className="shrink-0" />
      <span className="min-w-0 truncate">{visibleLabel}</span>
    </a>
    </Tooltip>
  );
}

function OAuthScopeNegativeCapabilityBlock({ className = "" }: { className?: string }) {
  const { formatMessage } = useIntl();
  return (
    <div className={`rounded-container bg-warning-soft px-3 py-2.5 text-footnote font-semibold text-foreground ${className}`.trim()}>
      {formatMessage({ id: AGENT_INBOUND_NEGATIVE_CAPABILITY_ID })}
    </div>
  );
}

// Exported for settingsSubBatchG.i18n.behavior.test.tsx — presentational (takes a
// scope array), so the zh tooth renders the real component with no API harness.
export function OAuthScopeList({
  scopes,
  compact = true,
  defaultToDeclared = true,
}: {
  scopes: readonly string[] | null | undefined;
  compact?: boolean;
  defaultToDeclared?: boolean;
}) {
  const { formatMessage } = useIntl();
  const visibleScopes = defaultToDeclared ? normalizeDeclaredOAuthScopes(scopes) : normalizeDeclaredOAuthScopes(scopes).filter((scope) => scopes?.includes(scope));
  const grouped: Record<OAuthScopeTier, RaftOAuthScopeId[]> = {
    identity: visibleScopes.filter((scope) => OAUTH_SCOPE_PRESENTATION[scope].tier === "identity"),
    agent_directory: visibleScopes.filter((scope) => OAUTH_SCOPE_PRESENTATION[scope].tier === "agent_directory"),
    agent_messaging: visibleScopes.filter((scope) => OAUTH_SCOPE_PRESENTATION[scope].tier === "agent_messaging"),
  };

  return (
    <div className="space-y-3" data-testid="oauth-scope-list">
      {visibleScopes.length === 0 && (
        <Card className="px-3 py-2 text-footnote text-foreground-muted">
          {formatMessage({ id: "settings.connectedApps.noGrantScopes" })}
        </Card>
      )}
      {compact ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleScopes.map((scope) => {
            const detail = OAUTH_SCOPE_PRESENTATION[scope];
            return (
              <Tooltip key={scope} content={formatMessage({ id: detail.copyId })}>
              <span
                className={`inline-flex items-center rounded-chip px-2 py-0.5 font-mono text-mono-meta text-foreground ${detail.requiresResource ? "bg-info-soft" : "bg-fill-muted"}`}
              >
                {scope}
              </span>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <>
          {(["identity", "agent_directory", "agent_messaging"] as OAuthScopeTier[]).map((tier) => {
            const tierScopes = grouped[tier];
            if (tierScopes.length === 0) return null;
            return (
              <div key={tier} className="space-y-2">
                <SectionEyebrow as="div">{formatMessage({ id: scopeGroupLabelId(tier) })}</SectionEyebrow>
                <div className="space-y-2">
                  {tierScopes.map((scope) => {
                    const detail = OAUTH_SCOPE_PRESENTATION[scope];
                    return (
                      <div key={scope} className="rounded-control border border-line-hairline bg-layer-card px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="break-all font-mono text-mono-meta text-foreground">{scope}</code>
                          {detail.requiresResource && <Badge appearance="outline">{formatMessage({ id: "settings.connectedApps.scopeRequiresResource" })}</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
      {!compact && hasAgentInboundOAuthScope(visibleScopes) && <OAuthScopeNegativeCapabilityBlock />}
    </div>
  );
}

function OAuthScopeSummaryPanel({
  title,
  description,
  scopes,
  compact = true,
  defaultToDeclared = true,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  scopes: readonly string[] | null | undefined;
  compact?: boolean;
  defaultToDeclared?: boolean;
  defaultOpen?: boolean;
}) {
  const { formatMessage } = useIntl();
  return (
    <div className="space-y-2">
      <SectionEyebrow as="div">{title}</SectionEyebrow>
      {description && <div className="mt-2 text-footnote text-foreground-muted">{description}</div>}
      <Card render={<details open={defaultOpen} />} className="block px-3 py-2">
        <summary className="text-footnote font-semibold text-foreground">{formatMessage({ id: "settings.connectedApps.detail.declaredAccess" })}</summary>
        <div className="mt-2">
          <OAuthScopeList scopes={scopes} compact={compact} defaultToDeclared={defaultToDeclared} />
        </div>
      </Card>
    </div>
  );
}

function ConnectedAppDetailSection({
  title,
  description,
  children,
  tone = "white",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "white" | "cream";
}) {
  return (
    <section className={`rounded-container border border-line-hairline p-4 ${tone === "cream" ? "bg-fill-muted" : "bg-layer-card"}`}>
      <SectionEyebrow as="div">{title}</SectionEyebrow>
      {description && <div className="mt-1 text-footnote text-foreground-muted">{description}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ConnectedAppDetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="shrink-0 text-footnote text-foreground-muted">{label}</span>
      <div className="min-w-0 text-left text-callout font-semibold text-foreground sm:text-right">{children}</div>
    </div>
  );
}

// Exported for settingsSubBatchD.i18n.behavior.test.tsx — see above.
export function DeclaredScopesPicker({
  value,
  onChange,
}: {
  value: readonly RaftOAuthScopeId[];
  onChange: (next: RaftOAuthScopeId[]) => void;
}) {
  const { formatMessage } = useIntl();
  const selected = new Set<RaftOAuthScopeId>([...IDENTITY_OAUTH_SCOPES, ...value]);
  const updateScope = useCallback((scope: RaftOAuthScopeId, checked: boolean) => {
    if (IDENTITY_OAUTH_SCOPES.includes(scope)) return;
    const next = new Set<RaftOAuthScopeId>([...IDENTITY_OAUTH_SCOPES, ...value]);
    if (checked) next.add(scope);
    else next.delete(scope);
    onChange([
      ...IDENTITY_OAUTH_SCOPES,
      ...OPTIONAL_IDENTITY_OAUTH_SCOPES.filter((item) => next.has(item)),
      ...AGENT_DIRECTORY_OAUTH_SCOPES.filter((item) => next.has(item)),
      ...AGENT_INBOUND_OAUTH_SCOPES.filter((item) => next.has(item)),
    ]);
  }, [onChange, value]);

  return (
    <Card className="p-3" data-testid="connected-app-declared-scopes">
      {value.includes("agent:read") ? <p className="mt-2 text-footnote text-foreground-muted" data-testid="legacy-agent-login-scope">{formatMessage({ id: "settings.connectedApps.appPermissions.legacyLoginScope" })}</p> : null}
      <div className="mt-3 space-y-2">
        <div className="rounded-control bg-fill-muted p-3">
          <div className="text-footnote font-semibold text-foreground">
            {formatMessage({ id: "settings.connectedApps.identitySection" })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDENTITY_OAUTH_SCOPES.map((scope) => {
              const detail = OAUTH_SCOPE_PRESENTATION[scope];
              return (
                <Tooltip key={scope} content={formatMessage({ id: detail.copyId })}>
                <span className="inline-flex min-h-8 items-center rounded-control border border-line-hairline bg-layer-card px-2.5 py-1 font-mono text-mono-meta text-foreground">
                  {scope}
                </span>
                </Tooltip>
              );
            })}
            {OPTIONAL_IDENTITY_OAUTH_SCOPES.map((scope) => (
              <DeclaredScopeToggle
                key={scope}
                scope={scope}
                checked={selected.has(scope)}
                className="inline-flex min-h-8 items-center gap-2 rounded-control border border-line-hairline bg-layer-card px-2.5 py-1 font-mono text-mono-meta text-foreground"
                onScopeChange={updateScope}
              />
            ))}
          </div>
        </div>

        <div className="rounded-control bg-fill-muted p-3">
          <div className="text-footnote font-semibold text-foreground">
            {formatMessage({ id: "settings.connectedApps.agentMessagingSection" })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {AGENT_INBOUND_OAUTH_SCOPES.map((scope) => (
              <DeclaredScopeToggle
                key={scope}
                scope={scope}
                checked={selected.has(scope)}
                className="inline-flex min-h-8 items-center gap-2 rounded-control border border-line-hairline bg-layer-card px-2.5 py-1 font-mono text-mono-meta text-foreground"
                onScopeChange={updateScope}
              />
            ))}
          </div>
          {hasAgentInboundOAuthScope(value) && (
            <div className="mt-2 text-footnote text-foreground-muted">
              {formatMessage({ id: "settings.connectedApps.scopeRequiresResourceDetail" })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function renderMarketplaceText(field: "app_name" | "developer_name" | "description", value: string | null | undefined) {
  return renderThirdPartyInertText({ field, value });
}

function mapClientToMarketplaceApp(
  client: MarketplaceOAuthClientRecord,
  formatMessage: IntlShape["formatMessage"],
): ConnectedAppListing {
  const notConfigured = formatMessage({ id: "settings.connectedApps.notConfigured" });
  const thirdPartyDeveloper = formatMessage({ id: "settings.connectedApps.thirdPartyDeveloper" });
  return {
    id: client.id,
    clientId: client.clientId,
    name: renderMarketplaceText("app_name", client.name),
    category: client.category,
    developer: renderMarketplaceText("developer_name", client.publisherServerName ?? client.publisherName ?? thirdPartyDeveloper),
    description: renderMarketplaceText("description", client.description),
    homepageUrl: client.homepageUrl,
    homepageDomain: getDomainFromUrl(client.homepageUrl) ?? notConfigured,
    callbackDomain: getDomainFromUrl(client.returnUrl) ?? notConfigured,
    logoUrl: client.logoUrl,
    defaultLogoSeed: client.clientId,
    installed: !!client.installedAt,
    setupUrl: client.setupUrl, setupDescription: client.setupDescription,
    official: client.official,
    marketplaceInstallBadge: client.marketplaceInstallBadge ?? { kind: "none" },
    allowedScopes: client.allowedScopes,
    appNotificationGroups: client.appNotificationGroups ?? [],
    appNotificationEvents: client.appNotificationEvents ?? [],
    appNotificationReviewPending: client.appNotificationReviewPending ?? false,
    appNotificationPendingRevisionId: client.appNotificationPendingRevisionId ?? null,
    appNotificationPendingGroups: client.appNotificationPendingGroups ?? [],
    appNotificationPendingEvents: client.appNotificationPendingEvents ?? [],
    canReviewAppNotifications: client.canReviewAppNotifications ?? false,
  };
}

function mapClientToRegisteredApp(client: OAuthClientRecord): ServerRegisteredApp {
  return {
    ...client,
    status: client.publishStatus,
    logoUrl: client.logoUrl,
    defaultLogoSeed: client.clientId,
  };
}

function emptyAppNotificationState(): AppNotificationsDeveloperState {
  return {
    request_revision: 0,
    current_revision_id: null,
    current_groups: [],
    current_events: [],
    pending_revision: null,
    webhook: null,
  };
}

export function IntegrationsSection() {
  const { formatDate, formatMessage } = useIntl();
  const current = useServerStore((s) => s.current);
  const { capabilities } = useServerPermissions();
  const canManage = capabilities.manageIntegrations;
  const connectedAppsLabel = formatMessage({ id: "settings.connectedApps.label" });

  const [activeTab, setActiveTab] = useState<ConnectedAppsTab>("marketplace");
  const [connectedAppsSearch, setConnectedAppsSearch] = useState("");
  const [connectedAppsCategory, setConnectedAppsCategory] = useState<ConnectedAppCategory | "all">("all");
  const [connectedAppsViewMode, setConnectedAppsViewMode] = useState<ConnectedAppsViewMode>(getInitialConnectedAppsViewMode);
  const [selectedListing, setSelectedListing] = useState<ConnectedAppListing | null>(null);
  const [reviewingPermissionClientId, setReviewingPermissionClientId] = useState<string | null>(null);
  const [selectedInstalledApp, setSelectedInstalledApp] = useState<InstalledConnectedApp | null>(null);
  const [marketplaceClients, setMarketplaceClients] = useState<MarketplaceOAuthClientRecord[]>([]);
  const [clients, setClients] = useState<OAuthClientRecord[]>([]);
  const [integrationOverview, setIntegrationOverview] = useState<IntegrationOverviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdSecretClientId, setCreatedSecretClientId] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showRegisterDrawer, setShowRegisterDrawer] = useState(false);
  const [editingClient, setEditingClient] = useState<OAuthClientRecord | null>(null);
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  const [regeneratingClientId, setRegeneratingClientId] = useState<string | null>(null);
  const [regenerateSecretTarget, setRegenerateSecretTarget] = useState<OAuthClientRecord | null>(null);
  const [deleteClientTarget, setDeleteClientTarget] = useState<ServerRegisteredApp | null>(null);
  const [offlineRequestTarget, setOfflineRequestTarget] = useState<ServerRegisteredApp | null>(null);
  const [marketplaceUninstallTarget, setMarketplaceUninstallTarget] = useState<InstalledConnectedApp | ConnectedAppListing | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientDescription, setClientDescription] = useState("");
  const [clientWhenToUse, setClientWhenToUse] = useState("");
  const [clientHomepageUrl, setClientHomepageUrl] = useState("");
  const [clientReturnUrl, setClientReturnUrl] = useState("");
  const [clientAgentManifestUrl, setClientAgentManifestUrl] = useState("");
  const [clientSetupRequired, setClientSetupRequired] = useState(false);
  const [clientSetupUrl, setClientSetupUrl] = useState("");
  const [clientSetupDescription, setClientSetupDescription] = useState("");
  const [clientAllowedScopes, setClientAllowedScopes] = useState<RaftOAuthScopeId[]>([...DEFAULT_DECLARED_OAUTH_SCOPES]);
  const [appNotificationSelection, setAppNotificationSelection] = useState<AppNotificationSelection>({ groups: [], events: [] });
  const [appNotificationState, setAppNotificationState] = useState<AppNotificationsDeveloperState | null>(null);
  const [appNotificationLoading, setAppNotificationLoading] = useState(false);
  const [appNotificationConfigurationOpen, setAppNotificationConfigurationOpen] = useState(false);
  const [clientCategory, setClientCategory] = useState<ConnectedAppCategory>("Other");
  const [shareLink, setShareLink] = useState<OAuthClientShareLinkRecord | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const secretCopyResetRef = useRef<number | null>(null);
  const shareCopyResetRef = useRef<number | null>(null);

  const serverId = current?.id;
  const load = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    setError("");
    try {
      const [clientsRes, marketplaceRes, overviewRes] = await Promise.all([
        api.get("/integrations/clients"),
        api.get("/integrations/marketplace"),
        api.get("/integrations/overview"),
      ]);
      setClients(clientsRes.data);
      const nextMarketplaceClients = marketplaceRes.data as MarketplaceOAuthClientRecord[];
      setMarketplaceClients(nextMarketplaceClients);
      const requestedMarketplaceId = new URLSearchParams(window.location.search).get("marketplace_app")?.trim();
      if (requestedMarketplaceId) {
        const requestedListing = nextMarketplaceClients
          .filter((app) => !app.privateShared)
          .map((client) => mapClientToMarketplaceApp(client, formatMessage))
          .find((app) => app.id === requestedMarketplaceId || app.clientId === requestedMarketplaceId);
        if (requestedListing) setSelectedListing(requestedListing);
      }
      // Keep an open detail modal in sync with the reloaded rows — e.g. a
      // permission-update approve must drop the pending badge instead of
      // showing a stale snapshot of the pre-review listing.
      setSelectedListing((currentListing) => {
        if (!currentListing) return currentListing;
        const fresh = nextMarketplaceClients
          .map((client) => mapClientToMarketplaceApp(client, formatMessage))
          .find((app) => app.id === currentListing.id || app.clientId === currentListing.clientId);
        return fresh ?? null;
      });
      setIntegrationOverview(overviewRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedLoad" }));
    } finally {
      setLoading(false);
    }
  }, [formatMessage, serverId]);

  // Load once per server; a locale switch (new `formatMessage`) must not refetch.
  const loadForServer = useEffectEvent(load);
  useEffect(() => {
    void loadForServer();
  }, [serverId]);

  useEffect(() => {
    return () => {
      if (secretCopyResetRef.current) {
        window.clearTimeout(secretCopyResetRef.current);
      }
      if (shareCopyResetRef.current) {
        window.clearTimeout(shareCopyResetRef.current);
      }
    };
  }, []);

  const resetForm = useCallback(() => {
    setClientName("");
    setClientId("");
    setClientDescription("");
    setClientWhenToUse("");
    setClientHomepageUrl("");
    setClientReturnUrl("");
    setClientAgentManifestUrl("");
    setClientSetupRequired(false); setClientSetupUrl(""); setClientSetupDescription("");
    setClientAllowedScopes([...DEFAULT_DECLARED_OAUTH_SCOPES]);
    setAppNotificationSelection({ groups: [], events: [] });
    setAppNotificationState(null);
    setAppNotificationLoading(false);
    setAppNotificationConfigurationOpen(false);
    setClientCategory("Other");
  }, []);

  const resetShareState = useCallback(() => {
    setShareLink(null);
    setShareUrl("");
    setShareCopied(false);
  }, []);

  const openRegisterDrawer = useCallback(() => {
    setEditingClient(null);
    resetForm();
    setCreatedSecret(null);
    setCreatedSecretClientId(null);
    setSecretCopied(false);
    setError("");
    resetShareState();
    setShowRegisterDrawer(true);
  }, [resetForm, resetShareState]);

  const loadShareLink = useCallback(async (clientId: string) => {
    setShareLoading(true);
    resetShareState();
    try {
      const { data } = await api.get(`/integrations/clients/${clientId}/share-link`);
      setShareLink(data);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedLoadShare" }));
      }
    } finally {
      setShareLoading(false);
    }
  }, [formatMessage, resetShareState]);

  const loadAppNotificationState = useCallback(async (clientId: string) => {
    setAppNotificationLoading(true);
    try {
      const { data } = await api.get(`/integrations/clients/${clientId}/app-notifications`);
      if (
        !data
        || typeof data !== "object"
        || Array.isArray(data)
        || !Array.isArray(data.current_groups)
        || !Array.isArray(data.current_events)
      ) {
        throw new Error("Invalid App Notifications settings response");
      }
      setAppNotificationState(data);
      setAppNotificationConfigurationOpen(!!data.webhook?.enabled);
      const requested = data.pending_revision ?? {
        groups: data.current_groups,
        events: data.current_events,
      };
      setAppNotificationSelection({ groups: requested.groups, events: requested.events });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedLoadAppNotifications" }));
    } finally {
      setAppNotificationLoading(false);
    }
  }, [formatMessage]);

  const beginEditClient = useCallback((client: OAuthClientRecord) => {
    setEditingClient(client);
    setClientName(client.name);
    setClientId(client.clientId);
    setClientDescription(client.description ?? "");
    setClientWhenToUse(client.whenToUse ?? "");
    setClientHomepageUrl(client.homepageUrl ?? "");
    setClientReturnUrl(client.returnUrl ?? "");
    setClientAgentManifestUrl(client.agentManifestUrl ?? "");
    setClientSetupRequired(Boolean(client.setupUrl)); setClientSetupUrl(client.setupUrl ?? ""); setClientSetupDescription(client.setupDescription ?? "");
    setClientAllowedScopes(normalizeDeclaredOAuthScopes(client.allowedScopes));
    setAppNotificationSelection({ groups: [], events: [] });
    setAppNotificationState(null);
    setAppNotificationConfigurationOpen(false);
    setClientCategory(client.category);
    if (createdSecretClientId !== client.id) {
      setCreatedSecret(null);
      setCreatedSecretClientId(null);
    }
    setSecretCopied(false);
    setError("");
    void loadShareLink(client.id);
    void loadAppNotificationState(client.id);
    setShowRegisterDrawer(true);
  }, [createdSecretClientId, loadAppNotificationState, loadShareLink]);

  const closeRegisterDrawer = useCallback(() => {
    setShowRegisterDrawer(false);
    setEditingClient(null);
    setError("");
    resetShareState();
    resetForm();
  }, [resetForm, resetShareState]);

  const applyUpdatedClient = useCallback((client: OAuthClientRecord) => {
    setClients((items) => items.map((item) => item.id === client.id ? client : item));
    setEditingClient((currentClient) => currentClient?.id === client.id ? client : currentClient);
  }, []);

  const saveAppNotificationPermissions = useCallback(async (clientRowId: string) => {
    await api.put(`/integrations/clients/${clientRowId}/app-notifications/permissions`, {
      groups: appNotificationSelection.groups,
      events: appNotificationSelection.events,
    });
  }, [appNotificationSelection]);

  const appNotificationRequestChanged = useCallback(() => {
    if (!appNotificationState) return appNotificationSelection.groups.length > 0 || appNotificationSelection.events.length > 0;
    const requested = appNotificationState.pending_revision ?? {
      groups: appNotificationState.current_groups,
      events: appNotificationState.current_events,
    };
    return requested.groups.join("\0") !== appNotificationSelection.groups.join("\0")
      || requested.events.join("\0") !== appNotificationSelection.events.join("\0");
  }, [appNotificationSelection, appNotificationState]);

  const handleSaveClient = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!serverId) return;
    if (isAppWhenToUseTooLong(clientWhenToUse)) {
      setError(formatMessage({ id: "settings.connectedApps.whenToUseTooLong" }, { limit: APP_WHEN_TO_USE_MAX_CODE_POINTS }));
      return;
    }
    if (clientSetupRequired) {
      try { if (!normalizeAppSetupUrl(clientSetupUrl)) throw new Error("missing setup URL"); }
      catch { setError(formatMessage({ id: "appSetup.invalidUrl" })); return; }
    }
    setSubmitting(true);
    setSavingClientId(editingClient?.id ?? null);
    setError("");
    if (!editingClient) setCreatedSecret(null);
    try {
      if (editingClient) {
        const { data } = await api.patch(`/integrations/clients/${editingClient.id}`, {
          name: clientName,
          description: clientDescription || null,
          whenToUse: clientWhenToUse || null,
          homepageUrl: clientHomepageUrl || null,
          returnUrl: clientReturnUrl || null,
          agentManifestUrl: clientAgentManifestUrl || null,
          setupUrl: clientSetupRequired ? clientSetupUrl : null,
          setupDescription: clientSetupRequired ? clientSetupDescription : null,
          allowedScopes: clientAllowedScopes,
          category: clientCategory,
        });
        applyUpdatedClient(data);
        if (appNotificationState && appNotificationRequestChanged()) {
          await saveAppNotificationPermissions(editingClient.id);
        }
        closeRegisterDrawer();
      } else {
        const { data } = await api.post("/integrations/clients", {
          name: clientName,
          clientId: clientId || undefined,
          description: clientDescription || undefined,
          whenToUse: clientWhenToUse || undefined,
          homepageUrl: clientHomepageUrl || undefined,
          returnUrl: clientReturnUrl || undefined,
          agentManifestUrl: clientAgentManifestUrl || undefined,
          setupUrl: clientSetupRequired ? clientSetupUrl : undefined,
          setupDescription: clientSetupRequired ? clientSetupDescription : undefined,
          allowedScopes: clientAllowedScopes,
          category: clientCategory,
        });
        setCreatedSecret(data.clientSecret);
        setCreatedSecretClientId(data.client.id);
        setSecretCopied(false);
        setEditingClient(data.client);
        setClientId(data.client.clientId);
        setClients((items) => [...items, data.client]);
        setAppNotificationState(emptyAppNotificationState());
        if (appNotificationRequestChanged()) {
          await saveAppNotificationPermissions(data.client.id);
        }
        resetForm();
        setShowRegisterDrawer(false);
        setActiveTab("myapps");
        await load();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || (editingClient ? formatMessage({ id: "settings.connectedApps.failedUpdateApp" }) : formatMessage({ id: "settings.connectedApps.failedRegisterApp" })));
    } finally {
      setSubmitting(false);
      setSavingClientId(null);
    }
  }, [
    appNotificationRequestChanged,
    appNotificationState,
    applyUpdatedClient,
    clientAgentManifestUrl,
    clientSetupRequired, clientSetupUrl, clientSetupDescription,
    clientAllowedScopes,
    clientCategory,
    clientDescription,
    clientHomepageUrl,
    clientId,
    clientName,
    clientReturnUrl,
    clientWhenToUse,
    closeRegisterDrawer,
    editingClient,
    formatMessage,
    load,
    resetForm,
    saveAppNotificationPermissions,
    serverId,
  ]);

  const handleCopyCreatedSecret = useCallback(async () => {
    if (!createdSecret) return;
    setError("");
    try {
      await navigator.clipboard.writeText(createdSecret);
      setSecretCopied(true);
      if (secretCopyResetRef.current) {
        window.clearTimeout(secretCopyResetRef.current);
      }
      secretCopyResetRef.current = window.setTimeout(() => {
        setSecretCopied(false);
        secretCopyResetRef.current = null;
      }, 1500);
    } catch (err: any) {
      setError(err?.message || formatMessage({ id: "settings.connectedApps.failedCopySecret" }));
    }
  }, [createdSecret, formatMessage]);

  const handleRegenerateClientSecret = useCallback(async (client: OAuthClientRecord) => {
    setRegeneratingClientId(client.id);
    setError("");
    try {
      const { data } = await api.post(`/integrations/clients/${client.id}/regenerate-secret`);
      applyUpdatedClient(data.client);
      setCreatedSecret(data.clientSecret);
      setCreatedSecretClientId(data.client.id);
      setSecretCopied(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || formatMessage({ id: "settings.connectedApps.regenerateSecretFailed" }));
      throw err;
    } finally {
      setRegeneratingClientId(null);
    }
  }, [applyUpdatedClient, formatMessage]);

  const handleCreateShareLink = useCallback(async () => {
    if (!editingClient) return;
    setShareLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/integrations/clients/${editingClient.id}/share-link`);
      applyUpdatedClient(data.client);
      setShareLink(data.link);
      setShareUrl(buildIntegrationInviteUrl(shareableWebOrigin(), data.token));
      setShareCopied(false);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedCreateShare" }));
    } finally {
      setShareLoading(false);
    }
  }, [applyUpdatedClient, editingClient, formatMessage]);

  const handleRevokeShareLink = useCallback(async () => {
    if (!editingClient) return;
    setShareLoading(true);
    setError("");
    try {
      await api.delete(`/integrations/clients/${editingClient.id}/share-link`);
      resetShareState();
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedRevokeShare" }));
    } finally {
      setShareLoading(false);
    }
  }, [editingClient, formatMessage, resetShareState]);

  const handleCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    setError("");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      if (shareCopyResetRef.current) {
        window.clearTimeout(shareCopyResetRef.current);
      }
      shareCopyResetRef.current = window.setTimeout(() => {
        setShareCopied(false);
        shareCopyResetRef.current = null;
      }, 1500);
    } catch (err: any) {
      setError(err?.message || formatMessage({ id: "settings.connectedApps.failedCopyShare" }));
    }
  }, [formatMessage, shareUrl]);

  const handleLogoFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!editingClient || !file) return;
    setLogoUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const { data } = await api.post(`/integrations/clients/${editingClient.id}/logo`, formData);
      applyUpdatedClient(data);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedUploadLogo" }));
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  };

  const handleClearLogo = useCallback(async () => {
    if (!editingClient) return;
    setLogoUploading(true);
    setError("");
    try {
      const { data } = await api.delete(`/integrations/clients/${editingClient.id}/logo`);
      applyUpdatedClient(data);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedResetLogo" }));
    } finally {
      setLogoUploading(false);
    }
  }, [applyUpdatedClient, editingClient, formatMessage]);

  const editingClientId = editingClient?.id;
  const handleDeleteClient = useCallback(async (client: ServerRegisteredApp) => {
    await api.delete(`/integrations/clients/${client.id}`);
    setClients((items) => items.filter((item) => item.id !== client.id));
    if (editingClientId === client.id) {
      closeRegisterDrawer();
    }
  }, [closeRegisterDrawer, editingClientId]);

  const handleRequestPublish = useCallback(async (client: ServerRegisteredApp) => {
    if (isAppWhenToUseTooLong(clientWhenToUse)) {
      setError(formatMessage({ id: "settings.connectedApps.whenToUseTooLong" }, { limit: APP_WHEN_TO_USE_MAX_CODE_POINTS }));
      return;
    }
    setSavingClientId(client.id);
    setError("");
    try {
      await api.patch(`/integrations/clients/${client.id}`, {
        name: clientName,
        description: clientDescription || null,
        whenToUse: clientWhenToUse || null,
        homepageUrl: clientHomepageUrl || null,
        returnUrl: clientReturnUrl || null,
        agentManifestUrl: clientAgentManifestUrl || null,
        allowedScopes: clientAllowedScopes,
        category: clientCategory,
      });
      const { data } = await api.post(`/integrations/clients/${client.id}/request-publish`);
      applyUpdatedClient(data);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedRequestPublish" }));
    } finally {
      setSavingClientId(null);
    }
  }, [
    applyUpdatedClient,
    clientAgentManifestUrl,
    clientAllowedScopes,
    clientCategory,
    clientDescription,
    clientHomepageUrl,
    clientName,
    clientReturnUrl,
    clientWhenToUse,
    formatMessage,
  ]);

  const handleRequestOffline = useCallback(async (client: ServerRegisteredApp) => {
    setSavingClientId(client.id);
    setError("");
    try {
      const { data } = await api.post(`/integrations/clients/${client.id}/request-unpublish`);
      applyUpdatedClient(data);
      setOfflineRequestTarget(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || formatMessage({ id: "settings.connectedApps.marketplaceReviewFailed" }));
    } finally {
      setSavingClientId(null);
    }
  }, [applyUpdatedClient, formatMessage]);

  const handleInstallMarketplaceApp = useCallback(async (listing: ConnectedAppListing) => {
    setSavingClientId(listing.id);
    setError("");
    try {
      await api.post(`/integrations/marketplace/${listing.id}/install`);
      setSelectedListing(listing.setupUrl ? { ...listing, installed: true } : null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedInstall" }));
    } finally {
      setSavingClientId(null);
    }
  }, [formatMessage, load]);

  const handleUninstallMarketplaceApp = useCallback(async (app: InstalledConnectedApp | ConnectedAppListing) => {
    setSavingClientId(app.id);
    setError("");
    try {
      await api.delete(`/integrations/marketplace/${app.id}/install`);
      setSelectedListing(null);
      setMarketplaceUninstallTarget(null);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.connectedApps.failedUninstall" }));
    } finally {
      setSavingClientId(null);
    }
  }, [formatMessage, load]);

  const handleApproveSelectedAppPermissionUpdate = useCallback(async () => {
    const listing = selectedListing;
    if (!listing) return;
    setReviewingPermissionClientId(listing.id);
    setError("");
    try {
      await api.post(`/integrations/clients/${listing.id}/app-notifications/permissions/review`, {
        // Bind the approval to the exact revision the reviewer displayed so a
        // publisher replacing the request mid-review cannot smuggle unseen
        // groups into the grant (server returns 409 and we surface the error).
        expected_revision_id: listing.appNotificationPendingRevisionId ?? undefined,
      });
      await load();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || formatMessage({ id: "settings.connectedApps.appNotifications.reviewFailed" }));
    } finally {
      setReviewingPermissionClientId(null);
    }
  }, [formatMessage, load, selectedListing]);
  const handleApproveAppPermissionUpdateClick = useCallback(() => {
    void handleApproveSelectedAppPermissionUpdate();
  }, [handleApproveSelectedAppPermissionUpdate]);

  const registeredApps = clients.map(mapClientToRegisteredApp);
  const grantedScopesByClientId = integrationOverview
    .filter((item) => item.type === "active" && !item.revokedAt)
    .reduce((map, item) => {
      const current = map.get(item.clientId) ?? new Set<string>();
      item.scopes.forEach((scope) => current.add(scope));
      map.set(item.clientId, current);
      return map;
    }, new Map<string, Set<string>>());
  const grantedScopesForClient = (id: string) => Array.from(grantedScopesByClientId.get(id) ?? []);
  const editableSourceOwnedClientIds = new Set(registeredApps
    .filter((app) => app.appType === "server_local" || (app.appType === "third_party_global" && canEditSourceOwnedConnectedApp(app.status)))
    .map((app) => app.id));
  const installedApps: InstalledConnectedApp[] = [
    ...marketplaceClients.filter((app) => app.installedAt && !editableSourceOwnedClientIds.has(app.id)).map((app) => ({
      id: app.id,
      clientId: app.clientId,
      name: renderMarketplaceText("app_name", app.name),
      developer: renderMarketplaceText("developer_name", app.publisherServerName ?? app.publisherName ?? formatMessage({ id: "settings.connectedApps.thirdPartyDeveloper" })),
      description: renderMarketplaceText("description", app.description),
      homepageUrl: app.homepageUrl,
      setupUrl: app.setupUrl, setupDescription: app.setupDescription,
      homepageDomain: getDomainFromUrl(app.homepageUrl),
      callbackDomain: getDomainFromUrl(app.returnUrl),
      logoUrl: app.logoUrl,
      defaultLogoSeed: app.clientId,
      origin: "marketplace" as const,
      privateShared: app.privateShared,
      editable: false,
      official: app.official,
      category: app.category,
      publishStatus: app.publishStatus ?? null,
      allowedScopes: app.allowedScopes,
      grantedScopes: grantedScopesForClient(app.id),
    })),
    ...registeredApps.filter((app) => editableSourceOwnedClientIds.has(app.id)).map((app) => ({
      id: app.id,
      clientId: app.clientId,
      name: app.name,
      developer: formatMessage({ id: "settings.connectedApps.thisServer" }),
      description: app.description,
      homepageUrl: app.homepageUrl,
      setupUrl: app.setupUrl, setupDescription: app.setupDescription,
      homepageDomain: getDomainFromUrl(app.homepageUrl),
      callbackDomain: getDomainFromUrl(app.returnUrl),
      logoUrl: app.logoUrl,
      defaultLogoSeed: app.defaultLogoSeed,
      origin: "private" as const,
      privateShared: false,
      editable: true,
      official: false,
      category: app.category,
      publishStatus: app.status,
      allowedScopes: app.allowedScopes,
      grantedScopes: grantedScopesForClient(app.id),
      sourceClientId: app.id,
    })),
  ];
  const publicMarketplaceClients = marketplaceClients.filter((app) => !app.privateShared);
  const normalizedSearch = connectedAppsSearch.trim().toLowerCase();
  const marketplaceApps = publicMarketplaceClients
    .map((client) => mapClientToMarketplaceApp(client, formatMessage))
    .filter((app) => matchesConnectedAppFilter(app, normalizedSearch, connectedAppsCategory));

  const filteredInstalledApps = installedApps
    .filter((app) => matchesConnectedAppFilter(app, normalizedSearch, connectedAppsCategory));
  const filteredRegisteredApps = registeredApps
    .filter((app) => matchesConnectedAppFilter(app, normalizedSearch, connectedAppsCategory));
  const marketplaceCount = publicMarketplaceClients.length;
  const installedCount = installedApps.length;
  const registeredCount = registeredApps.length;
  const connectedAppsTabOptions = useMemo(() => [
    { value: "marketplace" as const, label: formatMessage({ id: "settings.connectedApps.tabMarketplace" }), count: marketplaceCount, testId: "connected-apps-tab-marketplace" },
    { value: "installed" as const, label: formatMessage({ id: "settings.connectedApps.installed" }), count: installedCount, testId: "connected-apps-tab-installed" },
    { value: "myapps" as const, label: formatMessage({ id: "settings.connectedApps.tabMyApps" }), count: registeredCount, testId: "connected-apps-tab-my-apps" },
  ], [formatMessage, installedCount, marketplaceCount, registeredCount]);
  const connectedAppsCategoryItems = useMemo(() => CONNECTED_APP_CATEGORY_OPTIONS.map((option) => ({
    value: option.value,
    label: formatMessage({ id: CONNECTED_APP_CATEGORY_LABEL_ID[option.value] }),
  })), [formatMessage]);
  const publishCategoryItems = useMemo(() => CONNECTED_APP_PUBLISH_CATEGORY_OPTIONS.map((option) => ({
    value: option.value,
    label: formatMessage({ id: CONNECTED_APP_CATEGORY_LABEL_ID[option.value] }),
  })), [formatMessage]);
  const connectedAppsErrorSurface = getConnectedAppsErrorSurface(
    error,
    selectedListing,
    showRegisterDrawer,
    deleteClientTarget,
    offlineRequestTarget,
    marketplaceUninstallTarget,
  );
  const updateConnectedAppsViewMode = useCallback((viewMode: ConnectedAppsViewMode) => {
    setConnectedAppsViewMode(viewMode);
    try {
      window.localStorage.setItem(CONNECTED_APPS_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // The preference is optional; the view switch must keep working when storage is unavailable.
    }
  }, []);

  const renderClientSecretReveal = () => {
    if (!createdSecret) return null;
    return (
      <div className="space-y-2 rounded-container bg-success-soft p-3">
        <SectionEyebrow as="div">{formatMessage({ id: "settings.connectedApps.clientSecret" })}</SectionEyebrow>
        <div className="text-callout text-foreground">{formatMessage({ id: "settings.connectedApps.secretOnce" })}</div>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 break-all rounded-control border border-line-hairline bg-layer-card px-2.5 py-1.5 font-mono text-mono-meta text-foreground">{createdSecret}</div>
          <Tooltip content={secretCopied ? formatMessage({ id: "settings.connectedApps.copiedSecret" }) : formatMessage({ id: "settings.connectedApps.copySecret" })}>
          <Button
            variant="outline" size="icon-sm"
            type="button"
            onClick={handleCopyCreatedSecret}
            className="shrink-0"
            data-testid="connected-app-secret-copy-button"
            data-slot="button"
            aria-live="polite"
            aria-label={secretCopied ? formatMessage({ id: "settings.connectedApps.copiedSecret" }) : formatMessage({ id: "settings.connectedApps.copySecret" })}
          >
            {secretCopied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
          </Tooltip>
        </div>
      </div>
    );
  };

  const profileStatus = formatMessage({ id: clientName.trim() && clientDescription.trim() && clientHomepageUrl.trim()
    ? "settings.connectedApps.editor.status.complete"
    : "settings.connectedApps.editor.status.needsDetails" });
  const loginStatus = formatMessage({ id: clientReturnUrl.trim()
    ? (editingClient
      ? "settings.connectedApps.editor.status.oauthReady"
      : "settings.connectedApps.editor.status.readyToSave")
    : "settings.connectedApps.editor.status.loginOptional" });
  const appPermissionsStatus = formatMessage({ id: "settings.connectedApps.appPermissions.selectionCount" }, { count: appNotificationSelection.groups.length });
  const notificationsStatus = appNotificationLoading
    ? formatMessage({ id: "common.loadingLabel" })
    : formatMessage({ id: !editingClient
      ? "settings.connectedApps.editor.status.saveAppFirst"
      : appNotificationState?.webhook?.enabled
        ? "settings.connectedApps.editor.status.enabled"
        : appNotificationConfigurationOpen
          ? "settings.connectedApps.editor.status.setup"
          : "settings.connectedApps.editor.status.off" });
  const distributionStatus = formatMessage({ id: connectedAppDistributionStatus(editingClient?.publishStatus ?? null) });
  // The editor's section list, in the order the sections are drawn (a new
  // app's form stops before Distribution and the Danger zone).
  const appEditorSections = useMemo(() => [
    { id: "connected-app-editor-profile", label: formatMessage({ id: "settings.connectedApps.section.profile" }) },
    { id: "connected-app-editor-login", label: formatMessage({ id: "settings.connectedApps.section.loginWithRaft" }) },
    { id: "connected-app-editor-setup", label: formatMessage({ id: "appSetup.title" }) },
    { id: "connected-app-editor-permissions", label: formatMessage({ id: "settings.connectedApps.section.appPermissions" }) },
    { id: "connected-app-editor-notifications", label: formatMessage({ id: "settings.connectedApps.section.webhook" }) },
    ...(editingClient
      ? [
        { id: "connected-app-editor-distribution", label: formatMessage({ id: "settings.connectedApps.section.distribution" }) },
        { id: "connected-app-editor-danger", label: formatMessage({ id: "settings.connectedApps.section.dangerZone" }) },
      ]
      : []),
  ], [editingClient, formatMessage]);
  const handleConnectedAppsSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setConnectedAppsSearch(event.target.value), []);
  const handleConnectedAppsCategoryChange = useCallback((value: string | null) => {
    if (value == null) return;
    setConnectedAppsCategory(value as ConnectedAppCategory | "all");
  }, []);
  const handleOpenInstalledApp = useCallback((app: InstalledConnectedApp) => {
    setError("");
    setSelectedInstalledApp(app);
  }, []);
  const handleEditInstalledApp = useCallback((app: InstalledConnectedApp) => {
    const match = clients.find((client) => client.id === (app.sourceClientId ?? app.id));
    if (match) beginEditClient(match);
  }, [beginEditClient, clients]);
  const handleRequestMarketplaceUninstall = useCallback((app: InstalledConnectedApp | ConnectedAppListing) => {
    setError("");
    setMarketplaceUninstallTarget(app);
  }, []);
  const handleCloseInstalledApp = useCallback(() => setSelectedInstalledApp(null), []);
  const handleCloseListing = useCallback(() => setSelectedListing(null), []);
  const handleRequestUninstallSelectedListing = useCallback(() => {
    if (selectedListing) handleRequestMarketplaceUninstall(selectedListing);
  }, [handleRequestMarketplaceUninstall, selectedListing]);
  const handleInstallSelectedListing = useCallback(() => {
    if (selectedListing) void handleInstallMarketplaceApp(selectedListing);
  }, [handleInstallMarketplaceApp, selectedListing]);
  const handlePickLogo = useCallback(() => logoInputRef.current?.click(), []);
  const handleClientNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientName(event.target.value), []);
  const handleClientHomepageUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientHomepageUrl(event.target.value), []);
  const handleClientCategoryChange = useCallback((value: string | null) => {
    if (value == null) return;
    setClientCategory(value as ConnectedAppCategory);
  }, []);
  const handleClientDescriptionChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => setClientDescription(event.target.value), []);
  const handleClientWhenToUseChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientWhenToUse(event.target.value), []);
  const handleClientIdChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientId(event.target.value), []);
  const handleClientReturnUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientReturnUrl(event.target.value), []);
  const handleClientSetupUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientSetupUrl(event.target.value), []);
  const handleClientSetupDescriptionChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientSetupDescription(event.target.value), []);
  const handleClientAgentManifestUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => setClientAgentManifestUrl(event.target.value), []);
  const handleAppNotificationStateChange = useCallback((next: AppNotificationsDeveloperState) => {
    setAppNotificationState(next);
    const requested = next.pending_revision ?? { groups: next.current_groups, events: next.current_events };
    setAppNotificationSelection({ groups: requested.groups, events: requested.events });
  }, []);
  const handleRequestPublishEditingClient = useCallback(() => {
    if (editingClient) void handleRequestPublish(mapClientToRegisteredApp(editingClient));
  }, [editingClient, handleRequestPublish]);
  const handleRequestRegenerateSecret = useCallback(() => setRegenerateSecretTarget(editingClient), [editingClient]);
  const handleRequestOfflineEditingClient = useCallback(() => {
    if (editingClient) setOfflineRequestTarget(mapClientToRegisteredApp(editingClient));
  }, [editingClient]);
  const handleRequestDeleteEditingClient = useCallback(() => {
    if (editingClient) setDeleteClientTarget(mapClientToRegisteredApp(editingClient));
  }, [editingClient]);
  const handleCloseDeleteClient = useCallback(() => setDeleteClientTarget(null), []);
  const handleConfirmDeleteClient = useCallback(
    () => (deleteClientTarget ? handleDeleteClient(deleteClientTarget) : undefined),
    [deleteClientTarget, handleDeleteClient],
  );
  const handleCloseRegenerateSecret = useCallback(() => setRegenerateSecretTarget(null), []);
  const handleConfirmRegenerateSecret = useCallback(
    () => (regenerateSecretTarget ? handleRegenerateClientSecret(regenerateSecretTarget) : undefined),
    [handleRegenerateClientSecret, regenerateSecretTarget],
  );
  const handleCloseOfflineRequest = useCallback(() => setOfflineRequestTarget(null), []);
  const handleConfirmOfflineRequest = useCallback(
    () => (offlineRequestTarget ? handleRequestOffline(offlineRequestTarget) : undefined),
    [handleRequestOffline, offlineRequestTarget],
  );
  const handleCloseMarketplaceUninstall = useCallback(() => setMarketplaceUninstallTarget(null), []);
  const handleConfirmMarketplaceUninstall = useCallback(
    () => (marketplaceUninstallTarget ? handleUninstallMarketplaceApp(marketplaceUninstallTarget) : undefined),
    [handleUninstallMarketplaceApp, marketplaceUninstallTarget],
  );

  if (!current) return null;

  return (
    <div className="mb-6 space-y-4" data-testid="connected-apps-v3-section">
      <SectionHeader
        icon={<Link2 size={16} />}
        label={connectedAppsLabel}
        action={canManage ? (
          <Button
            variant="accent" size="sm" type="button" onClick={openRegisterDrawer}>
            <Plus size={14} />
            {formatMessage({ id: "settings.connectedApps.registerApp" })}
          </Button>
        ) : undefined}
      />

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.connectedApps.title" })}</div>
            <div className="mt-1 max-w-2xl text-footnote text-foreground-muted">
              {formatMessage({
                id: canManage
                  ? "settings.connectedApps.sectionDescriptionManage"
                  : "settings.connectedApps.sectionDescriptionView",
              })}
            </div>
            {!canManage && (
              <div className="mt-1 text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.connectedApps.adminOnlyNote" })}
              </div>
            )}
          </div>
          {loading && <div className="text-footnote text-foreground-hint">{formatMessage({ id: "settings.common.loading" })}</div>}
        </div>
        <ConnectedAppsTabSegmentedControl
          value={activeTab}
          options={connectedAppsTabOptions}
          className="mt-4"
          onValueChange={setActiveTab}
        />
      </Card>

      <div className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_220px_auto]" data-testid="connected-apps-filters">
        <div className="relative h-11 min-h-11">
          <Input
            type="search"
            value={connectedAppsSearch}
            onChange={handleConnectedAppsSearchChange}
            placeholder={formatMessage({ id: "settings.connectedApps.searchApps" })}
            aria-label={formatMessage({ id: "settings.connectedApps.searchAppsAriaLabel" })}
            className="box-border h-11 min-h-11 w-full"
            data-testid="connected-apps-search"
          />
        </div>
        <div className="h-11 min-h-11 min-w-0 sm:col-span-1 md:w-[220px]">
          <Select
            value={connectedAppsCategory}
            onValueChange={handleConnectedAppsCategoryChange}
            items={connectedAppsCategoryItems}
          >
            <SelectTrigger className="box-border h-11 min-h-11 w-full" data-testid="connected-apps-category-filter" aria-label={formatMessage({ id: "settings.connectedApps.filterByCategoryAriaLabel" })}>
              <SelectValue placeholder={formatMessage({ id: "settings.connectedApps.categoryLabel" })} />
              <SelectIcon />
            </SelectTrigger>
            <SelectContent>
              <SelectList>{renderSelectItems(connectedAppsCategoryItems)}</SelectList>
            </SelectContent>
          </Select>
        </div>
        <div className="flex h-11 min-h-11 items-center justify-end sm:col-start-2 sm:row-start-1 md:col-start-3">
          <ConnectedAppsViewToggle value={connectedAppsViewMode} onValueChange={updateConnectedAppsViewMode} />
        </div>
      </div>

      <ConnectedAppsErrorBanner surface={connectedAppsErrorSurface} target={CONNECTED_APPS_ERROR_PAGE} error={error} />

      {canManage && !showRegisterDrawer && renderClientSecretReveal()}

      {activeTab === "marketplace" && (
        <div className="space-y-3" data-testid="connected-apps-marketplace-tab">
          <div
            className={connectedAppsCollectionClassName(connectedAppsViewMode)}
            data-testid="connected-apps-marketplace-collection"
            data-view={connectedAppsViewMode}
          >
            {marketplaceApps.map((app) => (
              <Card
                key={app.id}
                render={<button type="button" onClick={() => setSelectedListing(app)} />}
                className={`w-full p-3 text-left outline-none hover:press-overlay focus-visible:shadow-focus ${
 connectedAppsViewMode === "grid" ? "h-full" : "flex-row items-center gap-3"
 }`}
              >
                <div className="flex items-start gap-3">
                  <ConnectedAppLogo name={app.name} logoUrl={app.logoUrl} seed={app.defaultLogoSeed} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-body font-semibold text-foreground">{app.name}</div>
                      <ConnectedAppMarketplaceInstallBadge badge={app.marketplaceInstallBadge} />
                    </div>
                    <div className="mt-0.5 text-footnote text-foreground-muted">{formatMessage({ id: "settings.connectedApps.byLine" }, { category: formatMessage({ id: CONNECTED_APP_CATEGORY_LABEL_ID[app.category] ?? "settings.connectedApps.categoryOther" }), developer: app.developer })}</div>
                    {connectedAppsViewMode === "list" && (
                      <ConnectedAppSummary description={app.description} />
                    )}
                  </div>
                </div>
                <div className={`${connectedAppsViewMode === "grid" ? "mt-auto pt-3" : "ml-auto"} flex items-center justify-end gap-2`}>
                  {app.installed ? (
                    <Badge appearance="soft" variant="success">{formatMessage({ id: "settings.connectedApps.installed" })}</Badge>
                  ) : canManage ? (
                    <span className="inline-flex h-7 items-center rounded-control border-[1.5px] border-line-strong px-2.5 text-footnote font-bold text-foreground">{formatMessage({ id: "settings.connectedApps.install" })}</span>
                  ) : (
                    <Badge appearance="soft" variant="muted">{formatMessage({ id: "settings.connectedApps.available" })}</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {marketplaceApps.length === 0 && (
            <div className="px-4 py-8 text-center text-callout text-foreground-hint">
              {formatMessage({ id: "settings.connectedApps.noMarketplaceMatch" })}
            </div>
          )}
          <div className="text-center text-footnote text-foreground-muted">
            {formatMessage({ id: "settings.connectedApps.reviewNote" })}
          </div>
        </div>
      )}

      {activeTab === "installed" && (
        <div className="space-y-2" data-testid="connected-apps-installed-tab">
          <div
            className={connectedAppsCollectionClassName(connectedAppsViewMode)}
            data-testid="connected-apps-installed-collection"
            data-view={connectedAppsViewMode}
          >
          {filteredInstalledApps.map((app) => (
            <InstalledConnectedAppItem
              key={`${app.origin}-${app.id}`}
              app={app}
              viewMode={connectedAppsViewMode}
              canManage={canManage}
              uninstalling={savingClientId === app.id}
              onOpen={handleOpenInstalledApp}
              onEdit={handleEditInstalledApp}
              onRequestUninstall={handleRequestMarketplaceUninstall}
            />
          ))}
          </div>
          {filteredInstalledApps.length === 0 && (
            <div className="px-4 py-8 text-center text-callout text-foreground-hint">
              {formatMessage({ id: "settings.connectedApps.noInstalledAppsMatch" })}
            </div>
          )}
        </div>
      )}

      {activeTab === "myapps" && (
        <div className="space-y-3" data-testid="connected-apps-my-apps-tab">
          <div className="text-footnote text-foreground-muted">
            {canManage
              ? formatMessage({ id: "settings.connectedApps.myAppsIntro" })
              : formatMessage({ id: "settings.connectedApps.myAppsReadOnlyIntro" })}
          </div>
          {filteredRegisteredApps.length === 0 ? (
            <div className="px-4 py-8 text-center text-callout text-foreground-hint">
              {registeredApps.length === 0
                ? formatMessage({ id: "settings.connectedApps.noRegisteredApps" })
                : formatMessage({ id: "settings.connectedApps.noRegisteredAppsMatch" })}
            </div>
          ) : (
            <div
              className={connectedAppsCollectionClassName(connectedAppsViewMode)}
              data-testid="connected-apps-my-apps-collection"
              data-view={connectedAppsViewMode}
            >
              {filteredRegisteredApps.map((app) => (
                <RegisteredConnectedAppItem
                  key={app.id}
                  app={app}
                  viewMode={connectedAppsViewMode}
                  canManage={canManage}
                  onEdit={beginEditClient}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectedInstalledApp && (
        <Modal onClose={handleCloseInstalledApp}>
          <DialogSurface className="w-full max-w-2xl gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <ConnectedAppLogo name={selectedInstalledApp.name} logoUrl={selectedInstalledApp.logoUrl} seed={selectedInstalledApp.defaultLogoSeed} size="lg" />
                <div className="min-w-0">
                  <SectionEyebrow as="div">{formatMessage({ id: "settings.connectedApps.installedAppEyebrow" })}</SectionEyebrow>
                  <div className="mt-1 break-words text-headline text-foreground">{selectedInstalledApp.name}</div>
                  <div className="mt-0.5 text-footnote text-foreground-muted">{selectedInstalledApp.developer}</div>
                </div>
              </div>
              <CloseButton
                type="button" onClick={handleCloseInstalledApp}  aria-label={formatMessage({ id: "settings.connectedApps.closeInstalledAppDetail" })}>
                <X size={14} />
              </CloseButton>
            </div>
            {error ? <Banner intent="warning" density="sm">{error}</Banner> : null}
            {selectedInstalledApp.setupUrl && serverId ? <AppSetupPanel clientId={selectedInstalledApp.id} serverId={serverId} /> : null}
            <OAuthScopeSummaryPanel
              title={formatMessage({ id: "settings.connectedApps.loginAccessTitle" })}
              description={formatMessage({ id: "settings.connectedApps.loginAccessDescription" })}
              scopes={selectedInstalledApp.grantedScopes}
              defaultToDeclared={false}
            />
            <InstalledAppNotifications
              clientId={selectedInstalledApp.id}
              canManage={canManage}
              onError={setError}
            />
            <div>
              <Separator className="mb-4" />
              <div className="flex justify-end">
                <Button
                  type="button" variant="outline" onClick={handleCloseInstalledApp} size="lg">{formatMessage({ id: "settings.common.close" })}</Button>
              </div>
            </div>
          </DialogSurface>
        </Modal>
      )}

      {selectedListing && (
        <Modal onClose={handleCloseListing}>
          <DialogSurface className="w-full max-w-2xl gap-4 p-5" aria-labelledby="connected-app-detail-title">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <ConnectedAppLogo name={selectedListing.name} logoUrl={selectedListing.logoUrl} seed={selectedListing.defaultLogoSeed} size="lg" />
                <div>
                  <SectionEyebrow as="div">{formatMessage({ id: "settings.connectedApps.appDetail" })}</SectionEyebrow>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 id="connected-app-detail-title" className="text-headline text-foreground">{selectedListing.name}</h2>
                    <ConnectedAppMarketplaceInstallBadge badge={selectedListing.marketplaceInstallBadge} />
                  </div>
                  <div className="mt-0.5 text-footnote text-foreground-muted">{formatMessage({ id: "settings.connectedApps.byLine" }, { category: formatMessage({ id: CONNECTED_APP_CATEGORY_LABEL_ID[selectedListing.category] ?? "settings.connectedApps.categoryOther" }), developer: selectedListing.developer })}</div>
                </div>
              </div>
              <CloseButton
                type="button" onClick={handleCloseListing}  aria-label={formatMessage({ id: "settings.connectedApps.closeAppDetail" })}>
                <X size={14} />
              </CloseButton>
            </div>
            <ConnectedAppsErrorBanner surface={connectedAppsErrorSurface} target={CONNECTED_APPS_ERROR_LISTING} error={error} />
            <ConnectedAppDetailSection title={formatMessage({ id: "settings.connectedApps.section.profile" })}>
              <p className="mb-2 text-callout text-foreground-muted">{selectedListing.description}</p>
              <div className="text-callout">
                <ConnectedAppDetailRow label={formatMessage({ id: "settings.connectedApps.publisher" })}>
                  {selectedListing.developer}
                </ConnectedAppDetailRow>
                <Separator />
                <ConnectedAppDetailRow label={formatMessage({ id: "settings.connectedApps.homepageUrlLabel" })}>
                  {selectedListing.homepageUrl ? (
                    <ConnectedAppUrlLink url={selectedListing.homepageUrl} />
                  ) : (
                    <span className="break-all font-mono text-mono-meta text-foreground">{selectedListing.homepageDomain}</span>
                  )}
                </ConnectedAppDetailRow>
                <Separator />
                <ConnectedAppDetailRow label={formatMessage({ id: "settings.connectedApps.redirectCallback" })}>
                  <span className="break-all font-mono text-mono-meta text-foreground">{selectedListing.callbackDomain}</span>
                </ConnectedAppDetailRow>
              </div>
            </ConnectedAppDetailSection>
            <ConnectedAppDetailSection
              title={formatMessage({ id: "settings.connectedApps.section.loginWithRaft" })}
              description={formatMessage({ id: "settings.connectedApps.detail.loginDescription" })}
              tone="cream"
            >
              <OAuthScopeSummaryPanel
                title={formatMessage({ id: "settings.connectedApps.detail.requestableDeclared" })}
                scopes={selectedListing.allowedScopes}
              />
            </ConnectedAppDetailSection>
            {selectedListing.setupUrl ? selectedListing.installed && serverId
              ? <AppSetupPanel clientId={selectedListing.id} serverId={serverId} />
              : <AppSetupRequirement url={selectedListing.setupUrl} description={selectedListing.setupDescription} /> : null}
            <ConnectedAppDetailSection title={formatMessage({ id: "settings.connectedApps.section.appPermissions" })} tone="cream">
              <AppNotificationRequestSummary
                groups={selectedListing.appNotificationGroups}
                events={selectedListing.appNotificationEvents}
                pendingGroups={selectedListing.appNotificationPendingGroups}
                pendingEvents={selectedListing.appNotificationPendingEvents}
                pendingRevisionId={selectedListing.appNotificationPendingRevisionId}
                reviewPending={selectedListing.appNotificationReviewPending}
                canReview={selectedListing.canReviewAppNotifications}
                reviewing={reviewingPermissionClientId === selectedListing.id}
                onApprove={handleApproveAppPermissionUpdateClick}
              />
            </ConnectedAppDetailSection>
            <ConnectedAppDetailSection title={formatMessage({ id: "settings.connectedApps.section.distribution" })} tone="cream">
              <div className="text-footnote text-foreground-muted">
                {formatMessage({ id: "settings.connectedApps.listingReviewNote" })}
              </div>
            </ConnectedAppDetailSection>
            {canManage && selectedListing.installed && (
              <ConnectedAppDetailSection title={formatMessage({ id: "settings.connectedApps.section.dangerZone" })}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-footnote text-foreground-muted">
                    {formatMessage({ id: "settings.connectedApps.detail.removeInstalledDescription" })}
                  </div>
                  <Button
                    type="button"
                    disabled={savingClientId === selectedListing.id}
                    onClick={handleRequestUninstallSelectedListing}
                    variant="danger"
                    size="sm"
                  >
                    {savingClientId === selectedListing.id ? formatMessage({ id: "settings.connectedApps.uninstalling" }) : formatMessage({ id: "settings.connectedApps.uninstallFromServer" })}
                  </Button>
                </div>
              </ConnectedAppDetailSection>
            )}
            <div>
              <Separator className="mb-4" />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button" variant={canManage && !selectedListing.installed ? "ghost" : "outline"} onClick={handleCloseListing} size="lg">
                  {canManage ? formatMessage({ id: "settings.common.cancel" }) : formatMessage({ id: "settings.common.close" })}
                </Button>
                {canManage && !selectedListing.installed && (
                  <Button
                    type="button"
                    disabled={savingClientId === selectedListing.id}
                    onClick={handleInstallSelectedListing}
                    variant="accent"
                    size="lg"
                  >
                    {savingClientId === selectedListing.id ? formatMessage({ id: "settings.connectedApps.installing" }) : formatMessage({ id: "settings.connectedApps.installToServer" })}
                  </Button>
                )}
              </div>
            </div>
          </DialogSurface>
        </Modal>
      )}

      {canManage && showRegisterDrawer && (
        <FormDialog
          testId="connected-app-editor"
          bodyTestId="connected-app-editor-content"
          navTestId="connected-app-editor-nav"
          navLabel={formatMessage({ id: "settings.connectedApps.appEditorSectionsAriaLabel" })}
          sections={appEditorSections}
          title={editingClient ? formatMessage({ id: "settings.connectedApps.editTitle" }, { name: editingClient.name }) : formatMessage({ id: "settings.connectedApps.registerApp" })}
          leading={(
            <ConnectedAppLogo
              name={clientName || editingClient?.name || "App"}
              logoUrl={editingClient?.logoUrl}
              seed={clientId || editingClient?.clientId || "new-app"}
              size="sm"
            />
          )}
          closeLabel={formatMessage({ id: "settings.connectedApps.closeAppForm" })}
          onClose={closeRegisterDrawer}
          onSubmit={handleSaveClient}
          notice={error || createdSecret ? (
            <>
              <ConnectedAppsErrorBanner surface={connectedAppsErrorSurface} target={CONNECTED_APPS_ERROR_FORM} error={error} />
              {renderClientSecretReveal()}
            </>
          ) : null}
          footer={(
            <>
              <Button type="button" variant="ghost" size="lg" onClick={closeRegisterDrawer}>
                {formatMessage({ id: "settings.common.cancel" })}
              </Button>
              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={isAppWhenToUseTooLong(clientWhenToUse) || submitting || appNotificationLoading || savingClientId === editingClient?.id}
              >
                {submitting ? formatMessage({ id: "settings.common.saving" }) : editingClient ? formatMessage({ id: "settings.common.save" }) : formatMessage({ id: "settings.connectedApps.registerApp" })}
              </Button>
            </>
          )}
        >
            <ConnectedAppEditorSection
              sectionId="profile"
              title={formatMessage({ id: "settings.connectedApps.section.profile" })}
              description={formatMessage({ id: "settings.connectedApps.editor.profileDescription" })}
              status={profileStatus}
            >
            <FormField
              label={formatMessage({ id: "settings.connectedApps.logoLabel" })}
              hint={editingClient ? formatMessage({ id: "settings.connectedApps.logoHintEdit" }) : formatMessage({ id: "settings.connectedApps.logoHintNew" })}
            >
              <div className="flex items-center gap-4">
                <ConnectedAppLogo
                  name={clientName || editingClient?.name || "App"}
                  logoUrl={editingClient?.logoUrl}
                  seed={clientId || editingClient?.clientId || "new-app"}
                  size="lg"
                />
                {editingClient && (
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleLogoFileChange}
                    />
                    <Button type="button" onClick={handlePickLogo} disabled={logoUploading} size="sm">
                      <Upload size={16} />
                      {logoUploading ? formatMessage({ id: "settings.connectedApps.uploading" }) : editingClient.logoUrl ? formatMessage({ id: "settings.connectedApps.change" }) : formatMessage({ id: "settings.connectedApps.upload" })}
                    </Button>
                    {editingClient.logoUrl && (
                      <Button type="button" variant="ghost" onClick={handleClearLogo} disabled={logoUploading} size="sm">
                        {formatMessage({ id: "settings.connectedApps.reset" })}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </FormField>
            <FormField label={formatMessage({ id: "settings.connectedApps.appNameLabel" })}>
              <Input
                type="text"
                value={clientName}
                onChange={handleClientNameChange}
                className="w-full"
                placeholder={formatMessage({ id: "settings.connectedApps.appNamePlaceholder" })}
                required
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={formatMessage({ id: "settings.connectedApps.homepageUrlFieldLabel" })}>
                <Input
                  type="url"
                  value={clientHomepageUrl}
                  onChange={handleClientHomepageUrlChange}
                  className="w-full"
                  render={<input placeholder="https://example.com" />}
                />
              </FormField>
              <FormField label={formatMessage({ id: "settings.connectedApps.categoryLabel" })}>
                <Select
                  value={clientCategory}
                  onValueChange={handleClientCategoryChange}
                  items={publishCategoryItems}
                >
                  <SelectTrigger className="w-full" aria-label={formatMessage({ id: "settings.connectedApps.appCategoryAriaLabel" })}>
                    <SelectValue placeholder={formatMessage({ id: "settings.connectedApps.categoryLabel" })} />
                    <SelectIcon />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectList>{renderSelectItems(publishCategoryItems)}</SelectList>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <FormField label={formatMessage({ id: "settings.connectedApps.descriptionLabel" })}>
              <Textarea
                value={clientDescription}
                onChange={handleClientDescriptionChange}
                rows={3}
                placeholder={formatMessage({ id: "settings.connectedApps.descriptionPlaceholder" })}
                className="resize-none"
              />
            </FormField>
            <FormField label={formatMessage({ id: "settings.connectedApps.clientIdLabel" })} hint={formatMessage({ id: "settings.connectedApps.clientIdHint" })} optional>
              <Input
                type="text"
                value={clientId}
                onChange={handleClientIdChange}
                className="w-full font-mono"
                placeholder={formatMessage({ id: "settings.connectedApps.clientIdPlaceholder" })}
                disabled={!!editingClient}
              />
            </FormField>
            <AppWhenToUseField value={clientWhenToUse} onChange={handleClientWhenToUseChange} />
            </ConnectedAppEditorSection>

            <ConnectedAppEditorSection
              sectionId="login"
              title={formatMessage({ id: "settings.connectedApps.section.loginWithRaft" })}
              description={formatMessage({ id: "settings.connectedApps.editor.loginDescription" })}
              status={loginStatus}
            >
            <FormField label={formatMessage({ id: "settings.connectedApps.returnUrlLabel" })}>
              <Input
                type="url"
                value={clientReturnUrl}
                onChange={handleClientReturnUrlChange}
                className="w-full"
                render={<input placeholder="https://example.com/login/callback" />}
              />
            </FormField>
            <FormField label={formatMessage({ id: "settings.connectedApps.agentManifestLabel" })} optional>
              <Input
                type="url"
                value={clientAgentManifestUrl}
                onChange={handleClientAgentManifestUrlChange}
                className="w-full"
                render={<input placeholder="https://example.com/.well-known/raft-agent-manifest.json" />}
              />
            </FormField>
            <DeclaredScopesPicker value={clientAllowedScopes} onChange={setClientAllowedScopes} />
            </ConnectedAppEditorSection>
            <ConnectedAppEditorSection sectionId="setup" title={formatMessage({ id: "appSetup.title" })} description={formatMessage({ id: "appSetup.editorHint" })} status={formatMessage({ id: clientSetupRequired ? "appSetup.requiredAfterInstall" : "appSetup.notRequired" })}>
              <AppSetupFields required={clientSetupRequired} url={clientSetupUrl} description={clientSetupDescription} onRequiredChange={setClientSetupRequired} onUrlChange={handleClientSetupUrlChange} onDescriptionChange={handleClientSetupDescriptionChange} />
            </ConnectedAppEditorSection>
            <ConnectedAppEditorSection
              sectionId="permissions"
              title={formatMessage({ id: "settings.connectedApps.section.appPermissions" })}
              description={formatMessage({ id: "settings.connectedApps.appPermissions.description" })}
              status={appPermissionsStatus}
            >
              <DeveloperAppPermissions clientId={editingClient?.id ?? null} value={appNotificationSelection} onChange={setAppNotificationSelection} state={appNotificationState} loading={appNotificationLoading} />
            </ConnectedAppEditorSection>
            <ConnectedAppEditorSection
              sectionId="notifications"
              title={<AppNotificationsLabel />}
              description={formatMessage({ id: "settings.connectedApps.editor.notificationsDescription" })}
              status={notificationsStatus}
            >
            <DeveloperAppNotifications
              embedded
              clientId={editingClient?.id ?? null}
              value={appNotificationSelection}
              onChange={setAppNotificationSelection}
              state={appNotificationState}
              loading={appNotificationLoading}
              onConfigurationOpenChange={setAppNotificationConfigurationOpen}
              onStateChange={handleAppNotificationStateChange}
              onError={setError}
            />
            </ConnectedAppEditorSection>
            {/* Sharing, publishing and the app's lifecycle act on a saved app;
                a new app's form stops at what can be filled in now (the
                Webhook section says that it waits for the save). */}
            {editingClient && (
            <ConnectedAppEditorSection
              sectionId="distribution"
              title={formatMessage({ id: "settings.connectedApps.section.distribution" })}
              description={formatMessage({ id: "settings.connectedApps.editor.distributionDescription" })}
              status={distributionStatus}
            >
            {sourceOwnedConnectedAppStatusHint(editingClient.publishStatus) ? (
              <Banner live={false} intent="warning" density="sm">
                {formatMessage({ id: sourceOwnedConnectedAppStatusHint(editingClient.publishStatus)! })}
              </Banner>
            ) : null}
            {(editingClient.publishStatus === "private" || editingClient.publishStatus === "rejected") && (
              <ConnectedAppEditorActionRow
                testId="connected-app-private-share-card"
                title={formatMessage({ id: "settings.connectedApps.privateShareTitle" })}
                description={(
                  <>
                    {formatMessage({ id: "settings.connectedApps.privateShareDesc" })}
                    {shareLink && (
                      <span className="mt-1 block">
                        {formatMessage({ id: "settings.connectedApps.activeLinkExpires" }, { when: shareLink.expiresAt ? formatDate(shareLink.expiresAt) : formatMessage({ id: "settings.connectedApps.never" }) })}
                      </span>
                    )}
                  </>
                )}
                action={(
                  <>
                    <Button type="button" size="sm" onClick={handleCreateShareLink} disabled={shareLoading}>
                      {shareLoading ? formatMessage({ id: "settings.connectedApps.working" }) : shareLink ? formatMessage({ id: "settings.connectedApps.regenerate" }) : formatMessage({ id: "settings.connectedApps.createLink" })}
                    </Button>
                    {shareLink && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleRevokeShareLink} disabled={shareLoading}>
                        {formatMessage({ id: "settings.connectedApps.revoke" })}
                      </Button>
                    )}
                  </>
                )}
              >
                {shareUrl && (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="min-w-0 flex-1 font-mono"
                      aria-label={formatMessage({ id: "settings.connectedApps.privateShareUrlAria" })}
                    />
                    <Button type="button" size="lg" onClick={handleCopyShareUrl}>
                      {shareCopied ? <Check size={18} /> : <Copy size={18} />}
                      {shareCopied ? formatMessage({ id: "settings.connectedApps.copied" }) : formatMessage({ id: "settings.connectedApps.copy" })}
                    </Button>
                  </div>
                )}
              </ConnectedAppEditorActionRow>
            )}
            {(editingClient.publishStatus === "private" || editingClient.publishStatus === "rejected") && (
              <ConnectedAppEditorActionRow
                title={formatMessage({ id: "settings.connectedApps.publishRequestTitle" })}
                description={formatMessage({ id: "settings.connectedApps.distributionMetadataNote" })}
                action={(
                  <Button
                    type="button"
                    onClick={handleRequestPublishEditingClient}
                    disabled={isAppWhenToUseTooLong(clientWhenToUse) || savingClientId === editingClient.id}
                    size="sm"
                  >
                    {savingClientId === editingClient.id ? formatMessage({ id: "settings.connectedApps.requesting" }) : formatMessage({ id: "settings.connectedApps.requestPublish" })}
                  </Button>
                )}
              />
            )}
            {editingClient.publishStatus === "published" ? (
              <Banner live={false} intent="success" density="sm">
                {formatMessage({ id: "settings.connectedApps.publishedMarketplaceNote" })}
              </Banner>
            ) : null}
            </ConnectedAppEditorSection>
            )}

            {editingClient && (
            <ConnectedAppEditorSection
              sectionId="danger"
              title={formatMessage({ id: "settings.connectedApps.section.dangerZone" })}
              description={formatMessage({ id: "settings.connectedApps.editor.dangerDescription" })}
              status={formatMessage({ id: "settings.connectedApps.editor.dangerStatusRestricted" })}
            >
              <ConnectedAppEditorActionRow
                title={formatMessage({ id: "settings.connectedApps.editor.clientSecretTitle" })}
                description={formatMessage({ id: "settings.connectedApps.editor.clientSecretDescription" })}
                action={(
                  <Button
                    type="button"
                    size="sm"
                    variant="warning"
                    onClick={handleRequestRegenerateSecret}
                    disabled={submitting || regeneratingClientId === editingClient.id}
                    data-testid="connected-app-regenerate-secret-button"
                  >
                    {formatMessage({ id: regeneratingClientId === editingClient.id
                      ? "settings.connectedApps.editor.regeneratingClientSecret"
                      : "settings.connectedApps.editor.regenerateClientSecret" })}
                  </Button>
                )}
              />
              {canRequestOfflineSourceOwnedConnectedApp(editingClient.publishStatus) ? (
                <ConnectedAppEditorActionRow
                  title={formatMessage({ id: "settings.connectedApps.editor.marketplaceLifecycleTitle" })}
                  description={formatMessage({ id: "settings.connectedApps.editor.marketplaceLifecycleDescription" })}
                  action={(
                    <Button type="button" size="sm" onClick={handleRequestOfflineEditingClient}>
                      {formatMessage({ id: "settings.connectedApps.editor.requestOffline" })}
                    </Button>
                  )}
                />
              ) : null}
              {canDeleteSourceOwnedConnectedApp(editingClient.publishStatus) ? (
                <ConnectedAppEditorActionRow
                  testId="connected-app-delete-card"
                  title={formatMessage({ id: "settings.connectedApps.deleteApp" })}
                  description={formatMessage({ id: "settings.connectedApps.deleteAppDescription" })}
                  action={(
                    <Button type="button" size="sm" variant="danger" onClick={handleRequestDeleteEditingClient}>
                      <Trash2 size={16} />
                      {formatMessage({ id: "settings.connectedApps.delete" })}
                    </Button>
                  )}
                />
              ) : null}
            </ConnectedAppEditorSection>
            )}
        </FormDialog>
      )}

      {canManage && deleteClientTarget && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "settings.connectedApps.deleteAppTitle" }, { name: deleteClientTarget.name })}
          message={(
            <>
              {formatMessage({ id: "settings.connectedApps.deleteAppMessagePrefix" })}
              <code className="rounded-sticker bg-fill-muted px-1 font-mono text-mono-code text-foreground">{deleteClientTarget.clientId}</code>
              {formatMessage({ id: "settings.connectedApps.deleteAppMessageSuffix" })}
            </>
          )}
          confirmLabel={formatMessage({ id: "settings.connectedApps.deleteApp" })}
          loadingLabel={formatMessage({ id: "settings.connectedApps.deleting" })}
          confirmIcon={<Trash2 size={14} />}
          confirmTestId="connected-app-delete-confirm-button"
          layer={showRegisterDrawer ? 1 : undefined}
          onClose={handleCloseDeleteClient}
          onConfirm={handleConfirmDeleteClient}
        />
      )}

      {canManage && regenerateSecretTarget && (
        <ConfirmDialog
          title={formatMessage(
            { id: "settings.connectedApps.editor.regenerateSecretConfirmTitle" },
            { name: regenerateSecretTarget.name },
          )}
          message={formatMessage(
            { id: "settings.connectedApps.editor.regenerateSecretConfirmMessage" },
            {
              clientId: regenerateSecretTarget.clientId,
              code: (chunks) => <code key="client-id" className="rounded-sticker bg-fill-muted px-1 font-mono text-mono-code text-foreground">{chunks}</code>,
            },
          )}
          confirmLabel={formatMessage({ id: "settings.connectedApps.editor.regenerateSecretConfirmLabel" })}
          loadingLabel={formatMessage({ id: "settings.connectedApps.editor.regeneratingClientSecret" })}
          confirmIcon={<AlertTriangle size={14} />}
          confirmVariant="warning"
          confirmTestId="connected-app-regenerate-secret-confirm-button"
          layer={1}
          onClose={handleCloseRegenerateSecret}
          onConfirm={handleConfirmRegenerateSecret}
        />
      )}

      {canManage && offlineRequestTarget && (
        <ConfirmDialog
          title={formatMessage(
            { id: "settings.connectedApps.editor.requestOfflineConfirmTitle" },
            { name: offlineRequestTarget.name },
          )}
          message={formatMessage(
            { id: "settings.connectedApps.editor.requestOfflineConfirmMessage" },
            {
              clientId: offlineRequestTarget.clientId,
              code: (chunks) => <code key="client-id" className="rounded-sticker bg-fill-muted px-1 font-mono text-mono-code text-foreground">{chunks}</code>,
            },
          )}
          confirmLabel={formatMessage({ id: "settings.connectedApps.editor.requestOffline" })}
          loadingLabel={formatMessage({ id: "settings.connectedApps.editor.requestOfflineConfirmLoading" })}
          confirmIcon={<Upload size={14} className="rotate-180" />}
          confirmVariant="warning"
          layer={showRegisterDrawer ? 1 : undefined}
          onClose={handleCloseOfflineRequest}
          onConfirm={handleConfirmOfflineRequest}
        />
      )}

      {canManage && marketplaceUninstallTarget && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "settings.connectedApps.uninstallAppTitle" }, { name: marketplaceUninstallTarget.name })}
          message={(
            <>
              {formatMessage({ id: "settings.connectedApps.uninstallMessagePrefix" })}
              <code className="rounded-sticker bg-fill-muted px-1 font-mono text-mono-code text-foreground">{marketplaceUninstallTarget.clientId}</code>
              {formatMessage({ id: "settings.connectedApps.uninstallMessageSuffix" })}
              {marketplaceUninstallTarget.official && (
                <> {formatMessage({ id: "settings.connectedApps.uninstallOfficialOptOut" })}</>
              )}
            </>
          )}
          confirmLabel={formatMessage({ id: "settings.connectedApps.uninstallApp" })}
          loadingLabel={formatMessage({ id: "settings.connectedApps.uninstallingConfirm" })}
          confirmIcon={<Trash2 size={14} />}
          confirmTestId="connected-app-uninstall-confirm-button"
          layer={selectedListing?.id === marketplaceUninstallTarget.id ? 1 : undefined}
          onClose={handleCloseMarketplaceUninstall}
          onConfirm={handleConfirmMarketplaceUninstall}
        />
      )}
    </div>
  );
}

function PreJoinAgreementSection() {
  const { formatMessage } = useIntl();
  const currentServer = useServerStore((s) => s.current);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyMarkdown, setBodyMarkdown] = useState("");
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [savedTitle, setSavedTitle] = useState("");
  const [savedBodyMarkdown, setSavedBodyMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const serverId = currentServer?.id;

  // Read at failure time so a locale switch does not refetch the agreement.
  const formatLoadError = useEffectEvent(() => formatMessage({ id: "settings.preJoinAgreement.failedLoad" }));

  // Async-loader: load the agreement only when the active server id changes,
  // not on unrelated churn of the `currentServer` store object. Same FP family
  // as L1696.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setLoading(true);
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setError("");
    void api
      .get(`/servers/${serverId}/agreement`)
      .then(({ data }) => {
        if (cancelled) return;
        const nextEnabled = !!data.enabled;
        const nextTitle = data.agreement?.title ?? "";
        const nextBodyMarkdown = data.agreement?.bodyMarkdown ?? "";
        setEnabled(nextEnabled);
        setTitle(nextTitle);
        setBodyMarkdown(nextBodyMarkdown);
        setSavedEnabled(nextEnabled);
        setSavedTitle(nextTitle);
        setSavedBodyMarkdown(nextBodyMarkdown);
        setSaved(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const responseError = (err as { response?: { data?: { error?: unknown } } }).response?.data?.error;
        setError(
          typeof responseError === "string" && responseError.trim()
            ? responseError
            : formatLoadError(),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const handleEnabledChange = useCallback((checked: boolean) => {
    setEnabled(checked);
    setSaved(false);
  }, []);

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    setSaved(false);
  }, []);

  const handleBodyMarkdownChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setBodyMarkdown(event.target.value);
    setSaved(false);
  }, []);

  const bodyMarkdownTooLong = bodyMarkdown.length > PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH;

  const handleSave = useCallback(async () => {
    if (!serverId || bodyMarkdownTooLong) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const { data } = await api.put(`/servers/${serverId}/agreement`, {
        enabled,
        title,
        bodyMarkdown,
      });
      const nextEnabled = !!data.enabled;
      const nextTitle = data.agreement?.title ?? title;
      const nextBodyMarkdown = data.agreement?.bodyMarkdown ?? bodyMarkdown;
      setEnabled(nextEnabled);
      setTitle(nextTitle);
      setBodyMarkdown(nextBodyMarkdown);
      setSavedEnabled(nextEnabled);
      setSavedTitle(nextTitle);
      setSavedBodyMarkdown(nextBodyMarkdown);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || formatMessage({ id: "settings.preJoinAgreement.failedSave" }));
    } finally {
      setSaving(false);
    }
  }, [bodyMarkdown, bodyMarkdownTooLong, enabled, formatMessage, serverId, title]);

  if (!currentServer) return null;

  const dirty =
    enabled !== savedEnabled
    || title !== savedTitle
    || bodyMarkdown !== savedBodyMarkdown;
  const bodyMarkdownError = bodyMarkdownTooLong
    ? formatMessage({ id: "settings.preJoinAgreement.bodyTooLong" }, { max: PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH_LABEL })
    : "";

  return (
    <div className="mb-6">
      <SectionHeader
        className="mb-3"
        icon={<FileText size={16} />}
        label={formatMessage({ id: "settings.preJoinAgreement.sectionLabel" })}
      />

      <Card className="space-y-4 p-4">
        <label className={`flex items-start gap-3 ${saving || loading ? "cursor-not-allowed" : ""}`}>
          <Checkbox
            checked={enabled}
            disabled={saving || loading}
            onCheckedChange={handleEnabledChange}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className={`block text-subhead font-semibold ${saving || loading ? "text-foreground-disabled" : "text-foreground"}`}>{formatMessage({ id: "settings.preJoinAgreement.requireTitle" })}</span>
            <span className="block text-footnote text-foreground-muted mt-0.5">
              {formatMessage({ id: "settings.preJoinAgreement.requireDescription" })}
            </span>
          </span>
        </label>

        {enabled && (
          <>
            <FormField label={formatMessage({ id: "settings.preJoinAgreement.titleLabel" })} size="compact">
              <Input
                value={title}
                onChange={handleTitleChange}
                maxLength={160}
                disabled={saving || loading}
                className="w-full"
              />
            </FormField>
            <FormField label={formatMessage({ id: "settings.preJoinAgreement.bodyLabel" })} size="compact">
              <Textarea
                value={bodyMarkdown}
                onChange={handleBodyMarkdownChange}
                rows={7}
                maxLength={PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH}
                aria-invalid={bodyMarkdownError ? true : undefined}
                aria-describedby={bodyMarkdownError ? "pre-join-agreement-error" : "pre-join-agreement-counter"}
                disabled={saving || loading}
                className="resize-y font-mono"
              />
              <div className="mt-1 flex items-start justify-between gap-3">
                {bodyMarkdownError ? (
                  <p id="pre-join-agreement-error" role="alert" className="text-caption text-danger-strong">
                    {bodyMarkdownError}
                  </p>
                ) : (
                  <span />
                )}
                <TextareaCounter id="pre-join-agreement-counter" value={bodyMarkdown} limit={PRE_JOIN_AGREEMENT_BODY_MAX_LENGTH} />
              </div>
            </FormField>
            <div className="rounded-container border border-line-hairline bg-layer-canvas p-3">
              <SectionEyebrow as="div" className="mb-2">{formatMessage({ id: "settings.preJoinAgreement.preview" })}</SectionEyebrow>
              <div className="text-callout">
                <AgreementBody source={bodyMarkdown} />
              </div>
            </div>
          </>
        )}

        {error && (
          <Banner intent="warning" density="sm">
            {error}
          </Banner>
        )}

        <div className="flex flex-col items-start gap-2">
          <div className="text-caption text-foreground-hint">
            {formatMessage({ id: "settings.preJoinAgreement.versionNote" })}
          </div>
          <Button
            variant="accent" size="sm"
            type="button"
            onClick={handleSave}
            disabled={!dirty || bodyMarkdownTooLong || saving || loading}
          >
            {saving ? formatMessage({ id: "settings.common.saving" }) : saved ? formatMessage({ id: "settings.common.saved" }) : formatMessage({ id: "settings.common.save" })}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ServerTabContent() {
  return (
    <>
      <ProfileSection />
      <PublicVisibilitySection />
      <ArchivedChannelsSection />
      <ArchivedAgentsSection />
      <DangerZoneSection />
    </>
  );
}

function LabsTabContent() {
  const labsUiEnabled = useServerFeatureFlag(SERVER_LABS_UI_FEATURE_FLAG_KEY).enabled;
  return labsUiEnabled ? <LabsSection /> : null;
}

function BillingTabContent() {
  const { formatMessage } = useIntl();
  const server = useServerStore((s) => s.current);
  const loadingServers = useServerStore((s) => s.loading);
  const { capabilities } = useServerPermissions();

  if (!server && loadingServers) {
    return <PlanBillingLoadingSection />;
  }

  if (!capabilities.viewBilling) {
    return (
      <div className="mb-6">
        <SectionHeader
          className="mb-3"
          icon={<CreditCard size={16} />}
          label={formatMessage({ id: "billing.billing" })}
        />
        <Card className="p-4 text-callout text-foreground-muted">
          {formatMessage({ id: "billing.onlyServerOwnersAndAdminsCanViewBilling" })}
        </Card>
      </div>
    );
  }
  return (
    <>
      <PlanSection />
    </>
  );
}

function AdministrationTabContent() {
  const { capabilities } = useServerPermissions();
  return (
    <>
      {capabilities.changeMemberRoles && <AdminsSection />}
      {capabilities.changeChannelVisibility && <SystemChannelsSection />}
      <InvitesSection />
      <JoinLinksSection />
      {capabilities.editServerSettings && <PreJoinAgreementSection />}
      <OnboardingAgentSection />
      <ServerTranslationSection />
      {capabilities.editServerSettings && <WorkspaceProductAnalyticsSection />}
      <MemberPermissionsSection />
    </>
  );
}

// Visual-testing render targets: components.settings.admins.* cases
// capture ONE section each instead of the shared tab top — without this every
// administration case screenshotted the identical first viewport of the tab
// (Slock task #333). Keys follow the case-id suffix.
export const ADMINISTRATION_VISUAL_SECTIONS = {
  admins: AdminsSection,
  // Insertion order mirrors AdministrationTabContent — the full-height case
  // stacks Object.values of this map, so system-channels must sit right after
  // admins to match the real route (and Android's canonical order, task #388).
  "system-channels": SystemChannelsSection,
  invites: InvitesSection,
  "join-links": JoinLinksSection,
  "pre-join-agreement": PreJoinAgreementSection,
  onboarding: OnboardingAgentSection,
  translation: ServerTranslationSection,
  "product-analytics": WorkspaceProductAnalyticsSection,
  "member-permissions": MemberPermissionsSection,
} as const;

export function AppearanceThemeSettingsControl() {
  const theme = useOptionalAppTheme();
  if (!theme) return null;
  return <AppearanceThemePicker mode={theme.mode} onModeChange={theme.setMode} />;
}

/**
 * `publicSurface`: the public server page (anonymous or nonmember reader). It has
 * no live agent activity bar, carries no agent model on messages and has no
 * Pinned / Joint / DM sidebar groups, so those three device toggles would do
 * nothing visible there (cindyz, #wg-rbac:22e4889c). Anonymous visitors only
 * need the browser-local theme picker on this surface (cindyz,
 * #wg-rbac:a88cfff6), so every other appearance control stays member-only.
 */
// Exported for publicSettingsAppearance.behavior.test.tsx (rendered directly,
// same precedent as AboutSection).
export function AppearanceSection({ publicSurface = false }: { publicSurface?: boolean }) {
  const { formatMessage } = useIntl();
  const messageBodyFontSize = useAppearanceStore((s) => s.messageBodyFontSize);
  const setMessageBodyFontSize = useAppearanceStore((s) => s.setMessageBodyFontSize);
  const showLiveAgentActivityBar = useAppearanceStore((s) => s.showLiveAgentActivityBar);
  const setShowLiveAgentActivityBar = useAppearanceStore((s) => s.setShowLiveAgentActivityBar);
  const showAgentModelName = useAppearanceStore((s) => s.showAgentModelName);
  const setShowAgentModelName = useAppearanceStore((s) => s.setShowAgentModelName);
  const hideEmptySidebarSections = useAppearanceStore((s) => s.hideEmptySidebarSections);
  const setHideEmptySidebarSections = useAppearanceStore((s) => s.setHideEmptySidebarSections);
  const previewMessage = useMemo<Message>(() => ({
    id: "appearance-preview-message",
    channelId: APPEARANCE_PREVIEW_CHANNEL.id,
    senderType: "agent",
    senderId: APPEARANCE_PREVIEW_AGENT.id,
    senderName: APPEARANCE_PREVIEW_AGENT.displayName ?? APPEARANCE_PREVIEW_AGENT.name,
    messageType: "chat",
    content: formatMessage({ id: "settings.appearance.fontPreviewSample" }),
    createdAt: new Date().toISOString(),
    attachments: [],
    reactions: [],
  }), [formatMessage]);

  return (
    <div className="mb-6">
      <Card className="mb-6 p-4">
        <div className="mb-3">
          <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.appearance.themeTitle" })}</div>
          <p className="mt-1 text-footnote text-foreground-muted">{formatMessage({ id: "settings.appearance.themeDescription" })}</p>
        </div>
        <AppearanceThemeSettingsControl />
      </Card>
      {!publicSurface && (
        <>
      <SectionHeader
        className="mb-3"
        icon={<Type size={16} />}
        label={formatMessage({ id: "settings.appearance.sectionLabel" })}
      />

      <Card className="space-y-4 p-4">
        <div>
          <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "settings.appearance.messageFontSizeTitle" })}</div>
          <p className="mt-1 text-footnote text-foreground-muted">
            {formatMessage({ id: "settings.appearance.messageFontSizeDescription" })}
          </p>
        </div>

        <MessageBodyFontSizeSegmentedControl
          value={messageBodyFontSize}
          onValueChange={setMessageBodyFontSize}
        />

        <div className="text-caption text-foreground-hint">
          {formatMessage({ id: "settings.appearance.savedOnDevice" })}
        </div>

        <div className="space-y-2">
          <SectionEyebrow as="div">
            {formatMessage({ id: "settings.appearance.preview" })}
          </SectionEyebrow>
          <div className="pointer-events-none -mx-2 rounded-control bg-layer-canvas" aria-label={formatMessage({ id: "settings.appearance.fontSizePreviewAria" })}>
            <MessageItem
              message={previewMessage}
              mentionMap={APPEARANCE_PREVIEW_MENTION_MAP}
              channels={APPEARANCE_PREVIEW_CHANNELS}
              previewSenderAgent={APPEARANCE_PREVIEW_AGENT}
              hideThreadActions
            />
          </div>
        </div>
      </Card>

        {/* DS ListRow › setting rows (`plain`, display-only: the Switch is the
            target) in an inset group, hairlines from the 16px edge. */}
        <ListRowGroup className="mt-4">
          <ListRow variant="plain" interactive={false}>
            <ListRowBody>
              <ListRowTitle id="live-agent-activity-setting-label">
                {formatMessage({ id: "settings.appearance.liveAgentActivityTitle" })}
              </ListRowTitle>
              <ListRowDescription id="live-agent-activity-setting-description" wrap>
                {formatMessage({ id: "settings.appearance.liveAgentActivityDescription" })}
              </ListRowDescription>
              <span className="text-caption text-foreground-hint">
                {formatMessage({ id: "settings.appearance.savedOnDevice" })}
              </span>
            </ListRowBody>
            <Switch
              checked={showLiveAgentActivityBar}
              onCheckedChange={setShowLiveAgentActivityBar}
              aria-labelledby="live-agent-activity-setting-label"
              aria-describedby="live-agent-activity-setting-description"
            />
          </ListRow>
          <ListRow variant="plain" interactive={false}>
            <ListRowBody>
              <ListRowTitle id="agent-model-name-setting-label">
                {formatMessage({ id: "settings.appearance.showAgentModelNameTitle" })}
              </ListRowTitle>
              <ListRowDescription id="agent-model-name-setting-description" wrap>
                {formatMessage({ id: "settings.appearance.showAgentModelNameDescription" })}
              </ListRowDescription>
              <span className="text-caption text-foreground-hint">
                {formatMessage({ id: "settings.appearance.savedOnDevice" })}
              </span>
            </ListRowBody>
            <Switch
              checked={showAgentModelName}
              onCheckedChange={setShowAgentModelName}
              aria-labelledby="agent-model-name-setting-label"
              aria-describedby="agent-model-name-setting-description"
            />
          </ListRow>
          <ListRow variant="plain" interactive={false}>
            <ListRowBody>
              <ListRowTitle id="hide-empty-sidebar-sections-setting-label">
                {formatMessage({ id: "settings.appearance.hideEmptySidebarSectionsTitle" })}
              </ListRowTitle>
              <ListRowDescription id="hide-empty-sidebar-sections-setting-description" wrap>
                {formatMessage({ id: "settings.appearance.hideEmptySidebarSectionsDescription" })}
              </ListRowDescription>
              <span className="text-caption text-foreground-hint">
                {formatMessage({ id: "settings.appearance.savedOnDevice" })}
              </span>
            </ListRowBody>
            <Switch
              checked={hideEmptySidebarSections}
              onCheckedChange={setHideEmptySidebarSections}
              aria-labelledby="hide-empty-sidebar-sections-setting-label"
              aria-describedby="hide-empty-sidebar-sections-setting-description"
            />
          </ListRow>
        </ListRowGroup>
        </>
      )}
    </div>
  );
}

// Exported for settingsSubBatchC.i18n.behavior.test.tsx — rendered directly so the
// zh teeth exercise the real component without mounting the full SettingsPanel
// (whose account tab reads the Vite-only `import.meta.env` graph). Same precedent
// as the exported `AccountSection` used by sub-batch A.
export function AboutSection({
  appVersion = WEB_APP_VERSION,
  showWorkspace = true,
}: {
  appVersion?: string;
  showWorkspace?: boolean;
} = {}) {
  const { formatMessage } = useIntl();
  const currentServer = useServerStore((s) => s.current);
  // Absolute, because the phone scanning this is not on our origin — a relative
  // path encodes to something the camera app cannot open.
  //
  // Built from the WEB origin, not the API base. The download buttons below do
  // use the API base (the API is on a different host in every deployed
  // environment), so the two are deliberately different and neither should be
  // "made consistent" with the other:
  //
  // App Links / Universal Links are only ever triggered for hosts that serve the
  // association files, and those live on the web origin — so a QR pointing at
  // the API origin can never open the app, however correct the native side is
  // (@Mahua). The chooser at /download is public and does the platform split,
  // so nothing is lost for someone who does not have the app.
  const mobileDownloadQrUrl = `${typeof window === "undefined" ? "" : shareableWebOrigin()}${MOBILE_DOWNLOAD_CHOOSER_PATH}`;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader label={formatMessage({ id: "settings.about.versionSectionLabel" })} icon={<Tag size={16} />} />
        <SurfaceListItem interactive={false} className="space-y-1">
          {/* Product wordmark — catalog brand id; locale values may match. */}
          <div className="text-subhead font-semibold text-foreground">{formatMessage({ id: "brand.productName" })}</div>
          <div className="font-mono text-mono-meta text-foreground-muted">{appVersion}</div>
        </SurfaceListItem>
      </section>

      {/*
        Desktop app: offered on the web only. Inside Raft Desktop the reader
        already has it, and updates arrive in-app.
      */}
      {isElectronDesktopShell() ? null : (
        <section className="space-y-3">
          <SectionHeader label={formatMessage({ id: "settings.desktopApp.sectionLabel" })} icon={<Monitor size={16} />} />
          <SurfaceListItem interactive={false}>
            <DesktopDownloadOptions />
          </SurfaceListItem>
        </section>
      )}

      {/*
        Mobile app is a companion surface, not an entry point: someone who
        installs it without a connected Computer still cannot use Raft, which is
        why this lives here rather than on the landing page (@wenyi). The Help
        menu carries only a signpost to it — this section is the single content
        host, so there is exactly one place to keep current.
      */}
      <section className="space-y-3">
        <SectionHeader label={formatMessage({ id: "settings.mobileApp.sectionLabel" })} icon={<Smartphone size={16} />} />
        <SurfaceListItem interactive={false}>
          <div className="min-w-0 space-y-3">
            <div className="text-footnote text-foreground-muted">{formatMessage({ id: "settings.mobileApp.description" })}</div>
            {/* Both buttons are peers, deliberately. A primary/secondary pair
                reads as a recommendation, and we have no basis for one: the
                person's phone is not the device rendering this, so we cannot
                know which applies to them. Styling Android as the CTA sent
                iPhone users looking for the "real" button (@wenyi). */}
            <div className="flex flex-wrap gap-2">
              <Button
                render={(
                  <a
                    href={mobileDownloadUrl("android")}
                    aria-label={formatMessage({ id: "settings.mobileApp.android" })}
                    data-testid="mobile-download-android"
                  />
                )}
                nativeButton={false}
                size="sm"
                variant="outline"
              >
                {formatMessage({ id: "settings.mobileApp.android" })}
              </Button>
              {/* New tab, because this one LEAVES Raft: our route 302s to
                  testflight.apple.com. Android deliberately does NOT get this —
                  it resolves to a file download, and a download in a fresh tab
                  strands an empty tab behind it. The asymmetry is the point
                  (@wenyi). */}
              <Button
                render={(
                  <a
                    href={mobileDownloadUrl("ios")}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={formatMessage({ id: "settings.mobileApp.ios" })}
                    data-testid="mobile-download-ios"
                  />
                )}
                nativeButton={false}
                size="sm"
                variant="outline"
              >
                {formatMessage({ id: "settings.mobileApp.ios" })}
              </Button>
            </div>
            {/* Left-aligned with the rest of the card rather than pinned to the
                far edge: on a wide settings panel the right edge is a long way
                from the buttons, and the code read as an unrelated decoration
                floating in whitespace (@wenyi).

                No `platform` in the encoded URL on purpose — the scanning phone
                is not this device, so the route's UA fallback decides, and one
                code serves both platforms. */}
            <MobileDownloadQr url={mobileDownloadQrUrl} />
          </div>
        </SurfaceListItem>
      </section>

      {showWorkspace ? <section className="space-y-3" data-testid="settings-about-workspace">
        <SectionHeader label={formatMessage({ id: "settings.about.workspaceSectionLabel" })} icon={<Building2 size={16} />} />
        <SurfaceListItem interactive={false} className="space-y-1">
          <div className="text-subhead font-semibold text-foreground">{currentServer?.name ?? formatMessage({ id: "settings.about.workspaceNameFallback" })}</div>
          <div className={currentServer?.slug ? "font-mono text-mono-meta text-foreground-muted" : "text-footnote text-foreground-muted"}>{currentServer?.slug ? `/${currentServer.slug}` : formatMessage({ id: "settings.about.workspaceDetailsFallback" })}</div>
        </SurfaceListItem>
      </section> : null}
    </div>
  );
}

function McpSettingsSection() {
  const { capabilities } = useServerPermissions();
  return (
    <AgentMcpTab
      scope="server"
      canManageServer={capabilities.manageIntegrations}
    />
  );
}

export default function SettingsPanel({
  tab: tabProp,
  accountInitialError,
  accountPasswordChangeIntent = false,
  showAboutWorkspace = true,
  publicTranslationContext,
  publicSurface = false,
}: {
  tab?: string;
  accountInitialError?: string;
  accountPasswordChangeIntent?: boolean;
  showAboutWorkspace?: boolean;
  publicTranslationContext?: PublicTranslationSettingsContext;
  /** Rendered inside the public server page (anonymous or nonmember). */
  publicSurface?: boolean;
}) {
  const { formatMessage } = useIntl();
  // A host-shell embed skips the chat startup loads, and the channel list is one
  // of them. Two sections here read it (system channels, archived channels), so
  // settings asks for it itself there.
  const settingsServerId = useServerStore((s) => s.current?.id ?? null);
  useEffect(() => {
    if (!hasChatSurfaces() && settingsServerId) void useChannelStore.getState().loadChannels();
  }, [settingsServerId]);
  const requestedSettingsTab = normalizeSettingsTab(tabProp);
  const providerConnectionsEnabled = useServerFeatureFlag(PROVIDER_CONNECTIONS_FEATURE_FLAG_KEY).enabled;
  const slackBridgeGate = useServerFeatureFlag(SLACK_BRIDGE_FEATURE_FLAG_KEYS.master);
  const slackBridgeEnabled = isSlackBridgeSurfaceEnabled(slackBridgeGate);
  const { capabilities, role } = useServerPermissions();
  const settingsTab = (
    (requestedSettingsTab === "providers" && (!providerConnectionsEnabled || !capabilities.manageExternalAuth))
    || (requestedSettingsTab === "im-bridges" && !slackBridgeEnabled)
  )
    ? "account"
    : !canOpenSettingsTab(requestedSettingsTab, capabilities, role)
    ? "account"
    : requestedSettingsTab;
  // Every tab title maps through the catalog — and now the type says so, so the
  // claim cannot go stale again. It had: `about` was absent, and this fallback
  // silently rendered the English `label`.
  const activeLabel = formatMessage({ id: SETTINGS_TAB_TITLE_ID[settingsTab] });
  const serverSlug = useServerStore((s) => s.current?.slug);
  // Mobile back: Settings sub-pages (account / browser / server) are
  // level-2 views inside the Settings tab. Per iOS NavigationView model
  // (@stdrc 2026-04-30 #proj-uiux:c8711d2a), every level-2+ view must
  // cover the tab bar and show a top-left back button — so we pop back
  // to the Settings tab home here.
  const onMobileBack = useMobileBack(serverSlug ? `/s/${serverSlug}/settings` : "/");
  // embed=1: the mobile app renders this tab inside an in-app WebView with its
  // own native header (Administration/Billing pattern, botiverse/mobile#868).
  // Drop the panel header so the page isn't double-chromed; content only.
  const embedded = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1";
  const headerContainerProps = useMemo(() => ({
    "data-testid": "settings-panel-header",
    "data-slock-settings-tab": settingsTab,
  }), [settingsTab]);
  const mobileBackProps = useMemo(
    () => ({ "data-testid": "settings-mobile-back", title: formatMessage({ id: "settings.tabs.back" }) }),
    [formatMessage],
  );

  return (
    // One seam between two regions: the settings list beside this panel
    // already draws it, so the frame is inset and draws none of its own.
    // Settings content sits on paper.
    <Panel edge="inset" className="flex min-h-0 flex-1 flex-col bg-layer-canvas text-foreground" data-testid="settings-panel-frame">
      {!embedded && settingsTab !== "feedback" && (
        <PanelHeader
          title={activeLabel}
          containerProps={headerContainerProps}
          onMobileBack={onMobileBack}
          mobileBackProps={mobileBackProps}
        />
      )}

      {/* Content */}
      <div className={settingsTab === "feedback"
 ? "min-h-0 flex-1 bg-layer-canvas"
 : "flex-1 overflow-y-auto bg-layer-canvas px-4 py-4 text-foreground mobile-nav-clearance md:px-5"}
      >
        {settingsTab === "account" && (
          <AccountSection
            initialError={accountInitialError}
            passwordChangeIntent={accountPasswordChangeIntent}
          />
        )}
        {settingsTab === "account" && <UsageDataSettingsCard />}
        {settingsTab === "language-region" && <LanguageRegionSection publicContext={publicTranslationContext} />}
        {settingsTab === "appearance" && <AppearanceSection publicSurface={publicSurface} />}
        {settingsTab === "notifications" && <NotificationsTabContent />}
        {settingsTab === "server" && <ServerTabContent />}
        {settingsTab === "mcp" && <McpSettingsSection />}
        {settingsTab === "providers" && <ProviderConnectionsSettings />}
        {settingsTab === "labs" && <LabsTabContent />}
        {settingsTab === "billing" && <BillingTabContent />}
        {settingsTab === "administration" && <AdministrationTabContent />}
        {settingsTab === "im-bridges" && <IMBridgesSettingsSection />}
        {settingsTab === "integrations" && <IntegrationsSection />}
        {settingsTab === "about" && <AboutSection showWorkspace={showAboutWorkspace} />}
        {settingsTab === "feedback" && <LazyAboutFeedbackPanel />}
      </div>
    </Panel>
  );
}
