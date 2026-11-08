import { isThreadMaximized, useUIStore } from "../../store/uiStore";
import FeedbackUnreadDot from "../../feedback/FeedbackUnreadDot";
import Tooltip from "../ui/Tooltip";
import { useContext, useState, useEffect, useEffectEvent, useLayoutEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import {
  AppShellMainSlot,
  AppShellRailSlot,
  AppShellRoot,
  AppShellSidebarSlot,
  Badge,
  DialogSurface,
  PanelAction,
  PanelActions,
  PanelHeader as PanelHead,
  ThreadIcon,
  MobileNavItem,
  MobileNavLabel,
  MobileNavRoot,
  Skeleton,
  toast,
} from "@botiverse/raft-ui";
import {
  getThreadPanelDynamicMax,
  SIDEBAR_PANEL_BOUNDS,
  THREAD_PANEL_DEFAULT_WIDTH,
  THREAD_PANEL_MIN_WIDTH,
} from "../../lib/panelBounds";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { MASTER_DETAIL_COMPACT_PANEL_BOUNDS, resolveMasterDetailPanelWidth } from "./masterDetailPanelSizing";
import { Routes, Route, Navigate, UNSAFE_NavigationContext as NavigationContext, useParams, useNavigate, useLocation } from "react-router-dom";
import { useRecordRecentConversation } from "../search/useRecordRecentConversation";
import { useIntl } from "react-intl";
import { useChannelStore } from "../../store/channelStore";
import { useAgentStore } from "../../store/agentStore";
import { useMessageStore } from "../../store/messageStore";
import { useInboxStore } from "../../store/inboxStore";
import { useTaskStore, selectChannelTaskBucket } from "../../store/taskStore";
import { loadThreadParentTasksIfNeeded, resolveThreadHostTask } from "./threadHostTask";
import type { Task } from "../../store/taskStore";
import { useMachineStore } from "../../store/machineStore";
import { watchModelLabelCatalog } from "../../store/modelLabelCatalogStore";
import { useServerStore } from "../../store/serverStore";
import { shouldSuppressAnnouncements, useOnboardingAnnouncementGateStore } from "../../store/onboardingAnnouncementGateStore";
import { mainLayoutRealtimeBridgeDriver } from "../../store/mainLayoutRealtimeBridgeDriver";
import { useMainLayoutRealtimeBridge } from "../../store/socketBridge";
import Sidebar from "./Sidebar";
import { UsagePage } from "../usage/UsagePage";
import { isHostShell } from "../../embed";
import { useEmbedParamsKeeper } from "../../hooks/useEmbedParamsKeeper";
import { LeftRail } from "./LeftRail";
import { ShellTopBar } from "../topbar/ShellTopBar";
import { useTopBarHost } from "../topbar/topBarHostContext";
import { shouldShowTopBar } from "../topbar/topBarVisibility";
import { isElectronDesktopShell } from "../../utils/desktopShell";
import { useTabRouteMemory } from "../../hooks/useTabRouteMemory";
import { useRailLegacyRedirect } from "../../hooks/useRailLegacyRedirect";
import { useMobileNav } from "../../hooks/useMobileNav";
import ChatPanel from "../message/ChatPanel";
import MobileComputersPanel from "../machine/MobileComputersPanel";
import ThreadPanel from "../message/ThreadPanel";
import { useProfileStore } from "../../store/profileStore";
import { useThreadStore } from "../../store/threadStore";
import { useAuthStore } from "../../store/authStore";
import { useLegacyTaskPanelStore } from "../../store/legacyTaskPanelStore";
import {
  useSearchContentStore,
  parseSearchOpenParam,
  formatSearchOpenParam,
} from "../../store/searchContentStore";
import type {
  SearchContentSlot,
} from "../../store/searchContentStore";
import {
  isCurrentRightPanelSearchSnapshot,
  subscribeRightPanelThreadAnchor,
  syncRightPanelStoresFromSearch,
  syncRightPanelUrlFromStores,
} from "./rightPanelUrlSync";
import {
  blurFocusedControlForScreenshotShortcut,
  isGlobalSearchShortcut,
} from "../../utils/keyboardShortcuts";
import {
  routeGlobalSearchShortcut,
  SEARCH_FOCUS_REQUEST_EVENT,
} from "../../utils/searchFocusRequest";
import { ArrowLeft, CheckSquare, Home, Settings, Users, X } from "lucide-react";
import api from "../../api/client";
import type { HumanProfile } from "../member/HumanDetailPanel";
import { resolveHumanProfile } from "../member/resolveHumanProfile";
import { canRenderAgentDetail } from "../agent/agentDetailAvailability";
import { getCachedAgentProfile } from "../profile/profileFallbackCache";
import { useAppNavigate, useMobileBack } from "../../hooks/useAppNavigate";
import PanelHeader from "../ui/PanelHeader";
import { ContentSlotThreadPanel } from "./ContentSlotThreadPanel";
import { useClearLiveAgentActivityOnServerChange } from "./WorkingNowSummary";
import Modal from "../Modal";
import { legacySettingsRouteRedirectSlug } from "../settings/settingsNavigation";
import { isChangePasswordSettingsIntent } from "../../utils/changePasswordNavigation";
import ServerSetupProjectionGate from "../onboarding/ServerSetupProjectionGate";
import {
  buildThreadRoutePath,
  consumeThreadRefHandoffSearch,
  executeThreadRefHandoffOnce,
  parseThreadRefHandoff,
  resolveThreadTargetByShortId,
} from "../../utils/threadRefNavigation";
import { buildSidebarDisclosureRestoreState } from "./sidebarChannelFocus";
import { useAppTheme } from "../../hooks/useAppTheme";
import {
  RAFT_DARK_PAPER_CHROME_COLOR,
  RAFT_DARK_THEME_CHROME_COLOR,
  RAFT_LIGHT_PAPER_CHROME_COLOR,
  RAFT_LIGHT_THEME_CHROME_COLOR,
} from "../../theme/appThemeChrome";
import { observeProfileOpenE2eImport } from "../../utils/profileOpenE2eTimeline";

const MOBILE_TAB_BAR_SAFE_BOTTOM = "min(env(safe-area-inset-bottom, 0px), 34px)";
const IN_FLOW_TAB_BAR_STYLE = { paddingBottom: MOBILE_TAB_BAR_SAFE_BOTTOM };
const SHRINK_PANEL_HEADER_CONTAINER_PROPS = { className: "shrink-0" };
const LG_VIEWPORT_QUERY = "(min-width: 1024px)";

// Lazy-loaded route panels (code splitting)
const AgentDetailPanel = lazy(() => observeProfileOpenE2eImport(
  "agent-detail",
  () => import("../agent/AgentDetailPanel"),
));
const AgentUnavailablePanel = lazy(() => import("../agent/AgentUnavailablePanel"));
const MachineDetailPanel = lazy(() => import("../machine/MachineDetailPanel"));
const HumanDetailPanel = lazy(() => import("../member/HumanDetailPanel"));
const RaftBenchPage = lazy(() => import("../../raftbench/RaftBenchPage"));
const SettingsPanel = lazy(() => import("../settings/SettingsPanel"));
const MemberGraphSection = lazy(() => import("../settings/MemberGraphSection"));
const ReleaseNotesPanel = lazy(() => import("../settings/ReleaseNotesPanel"));
const ThreadsInbox = lazy(() => import("../thread/ThreadsInbox"));
const TasksPanel = lazy(() => import("../task/TasksPanel"));
const SavedPanel = lazy(() => import("../saved/SavedPanel"));
const ProfilePanel = lazy(() => observeProfileOpenE2eImport(
  "profile-panel",
  () => import("../profile/ProfilePanel"),
));
const LegacyTaskPanel = lazy(() => import("../task/LegacyTaskPanel"));
const TaskModalHead = lazy(() => import("../task/TaskModalHead"));

/** Returns true when the mobile bottom tab bar should be visible on the
 *  current route. Used by both the bar itself and its in-flow spacer so that
 *  detail views (which return null from MobileTabBar) don't leave a stray
 *  empty strip below the page content.
 *
 *  iOS NavigationView model (per @stdrc 2026-04-30 #proj-uiux:c8711d2a):
 *  the tab bar lives at the root of each tab's stack only. When the user
 *  pushes to a detail (channel / dm / agent / human / computer / settings
 *  detail / search) the new view covers the full screen including the tab
 *  bar — there is no concept of "switch tabs from inside a detail". To
 *  switch tabs the user pops back to the tab home first via the back button.
 */
function useMobileTabBarVisible(): boolean {
  const location = useLocation();
  const serverSlug = useServerStore((s) => s.current?.slug);
  const threadOpen = useThreadStore((s) => !!s.openParentMessageId);
  const searchSlotOpen = useSearchContentStore((s) => !!s.slot);

  if (!serverSlug) return false;

  const pathBase = `/s/${serverSlug}`;
  const path = location.pathname;

  if (threadOpen) return false;
  if (searchSlotOpen) return false;

  // Hide on detail routes: channel, DM, search, agent, human, computer,
  // settings sub-pages.
  // /computers and /release-notes are level-2 pushes under the Settings tab per
  // @stdrc 2026-04-30 #proj-uiux:c8711d2a ("tabbar is level-1; any view you push
  // into covers the navbar and shows a back button top-left").
  const isChannelDetail = path.startsWith(`${pathBase}/channel/`);
  const isDMDetail = path.startsWith(`${pathBase}/dm/`);
  const isSearchDetail = path === `${pathBase}/search` || path.startsWith(`${pathBase}/search/`);
  const isAgentDetail = path.startsWith(`${pathBase}/agent/`);
  const isHumanDetail = path.startsWith(`${pathBase}/human/`);
  const isMembersDetail = path.startsWith(`${pathBase}/members/`);
  const isComputerDetail = path.startsWith(`${pathBase}/computer/`) || path.startsWith(`${pathBase}/machine/`);
  const isComputersList = path === `${pathBase}/computers` || path.startsWith(`${pathBase}/computers/`);
  const isSettingsDetail = path.startsWith(`${pathBase}/settings/`) || path.startsWith(`${pathBase}/release-notes`) || path.replace(/\/$/, "") === `${pathBase}/raftbench`;
  // Inbox/legacy Threads + Saved are level-2 pushes from Chat tab — same iOS NavigationView
  // model as channel/DM detail. stdrc 2026-05-02 #proj-uiux:648f8735 0a4084eb:
  // "在移动端点击 Threads 和 Saved 出来的页面，没有覆盖掉 Tab Bar" — fix to
  // match the channel/DM/agent detail behavior.
  const isInboxList = path === `${pathBase}/activity` || path.startsWith(`${pathBase}/activity/`);
  const isThreadsList = path === `${pathBase}/threads` || path.startsWith(`${pathBase}/threads/`);
  const isSavedList = path === `${pathBase}/saved` || path.startsWith(`${pathBase}/saved/`);

  if (
    isChannelDetail || isDMDetail || isSearchDetail || isAgentDetail || isHumanDetail || isMembersDetail ||
    isComputerDetail || isComputersList || isSettingsDetail ||
    isInboxList || isThreadsList || isSavedList
  ) {
    return false;
  }

  // Show on tab home routes only: chat root, /tasks, /members, /settings.
  return true;
}

/** Mobile bottom tab bar — shown only on root-level views (md:hidden).
 *  Hidden when user drills into a detail view (channel, DM, thread, member detail). */
export function MobileTabBar() {
  const location = useLocation();
  const serverSlug = useServerStore((s) => s.current?.slug);
  const serverRole = useServerStore((s) => s.current?.role);
  const visible = useMobileTabBarVisible();
  const { selectTab } = useMobileNav();
  // Display-language (react-intl) — layout namespace. Called BEFORE the
  // host-shell / visibility early-returns below so the hook order is stable.
  const { formatMessage } = useIntl();

  // HOST-SHELL EMBED: the native WebView owns its own chrome. The app's global
  // navigation must not render inside it — checked on the RENDER PATH, not in an
  // effect, so the very first frame is already correct. (An effect would paint the
  // tab bar and then remove it: a flash the user sees while every "final DOM"
  // assertion still reports green.)
  if (isHostShell()) return null;
  if (!visible || !serverSlug) return null;

  const pathBase = `/s/${serverSlug}`;
  const path = location.pathname;
  // 4-tab mobile bar (per @stdrc 2026-04-30 #proj-uiux:c8711d2a):
  // Home / Tasks / Members / Settings. Search is a Home drill-in on mobile,
  // not a top-level tab. Computers is reachable from inside Settings; it is
  // not a top-level tab on mobile.
  const isSettings = path.replace(/\/$/, "") === `${pathBase}/raftbench`
    || path.startsWith(`${pathBase}/settings`)
    || path.startsWith(`${pathBase}/release-notes`)
    || path === `${pathBase}/computers`
    || path.startsWith(`${pathBase}/computers/`)
    || path.startsWith(`${pathBase}/computer/`)
    || path.startsWith(`${pathBase}/machine/`); // legacy
  const isTasks = !isSettings && (path === `${pathBase}/tasks` || path.startsWith(`${pathBase}/tasks/`));
  const isMembers = !isSettings && !isTasks && (
    path === `${pathBase}/members`
      || path.startsWith(`${pathBase}/members/`)
      || path.startsWith(`${pathBase}/agent/`)
      || path.startsWith(`${pathBase}/human/`)
  );
  const isChat = !isSettings && !isTasks && !isMembers;

  // selectTab (see useMobileNav): every tab tap navigates to that tab's
  // root, regardless of active state. Per-tab sub-page memory is dropped.
  // (stdrc 2026-05-09 #proj-mobile:b1c622e5 task #11 — sub-pages hide the
  // tab bar; restoring sub-page on tab tap traps the user without a path
  // back to root.)
  const tapTab = (tab: MobileTabId, active: boolean) => () => {
    trackNavEntrySelected(tab === "chat" ? "home" : tab, "mobile_tab_bar", active);
    selectTab(tab);
  };
  const tabs = [
    { id: "chat", label: formatMessage({ id: "layout.mobileTabBar.home" }), icon: Home, active: isChat, onClick: tapTab("chat", isChat) },
    { id: "tasks", label: formatMessage({ id: "layout.mobileTabBar.tasks" }), icon: CheckSquare, active: isTasks, onClick: tapTab("tasks", isTasks) },
    ...(serverRole === "guest" ? [] : [
      { id: "members", label: formatMessage({ id: "layout.mobileTabBar.members" }), icon: Users, active: isMembers, onClick: tapTab("members", isMembers) },
    ]),
    { id: "settings", label: formatMessage({ id: "layout.mobileTabBar.settings" }), icon: Settings, active: isSettings, onClick: tapTab("settings", isSettings) },
  ];

  // In-flow (not fixed): the bar is the last child of the MainLayout flex
  // column, which is itself pinned to the visual viewport via #root. This
  // avoids two iOS bugs: (1) `fixed; bottom:0` ending up above the visible
  // bottom in PWA standalone because the layout viewport is taller than the
  // visible area, and (2) the fixed bar being covered by the keyboard in
  // mobile Safari because `fixed; bottom:0` anchors to layout viewport which
  // doesn't shrink with the keyboard. Safe-area is added via padding-bottom,
  // capped at the iPhone home-indicator inset so bad PWA/browser reports do
  // not create a large blank strip below the tabs. (Raft Design System ›
  // TabBar: an edge bar on the card surface with a seam on top; nothing is
  // stacked above it.)
  return (
    <MobileNavRoot className="md:hidden shrink-0" style={IN_FLOW_TAB_BAR_STYLE}>
      {tabs.map((tab) => (
        <MobileNavItem
          key={tab.id}
          className="relative"
          selected={tab.active}
          onClick={tab.onClick}
          aria-label={tab.label}
        >
          {/* The icon stays in short windows too: Raft DS › TabBar marks the
              selected tab by the yellow sticker around its icon, so hiding
              the icon (the old Brutal short-viewport adaptation) would hide
              which tab you are on. */}
          <tab.icon />
          <MobileNavLabel>{tab.label}</MobileNavLabel>
          {tab.id === "settings" && <FeedbackUnreadDot className="absolute top-1 right-2" />}
        </MobileNavItem>
      ))}
    </MobileNavRoot>
  );
}

import AddMachineDialog from "../machine/AddMachineDialog";
import CreateAgentDialog from "../agent/CreateAgentDialog";
import { usePageViewTracking } from "../../analytics/pageViews";
import { trackNavEntrySelected } from "../../analytics/navigation";
import type { MobileTabId } from "../../store/mobileNavStore";
import JointChannelLinkIntent from "../channel/JointChannelLinkIntent";
import AnnouncementModal from "../AnnouncementModal";
import MessageSearchPage from "../search/MessageSearchPage";
import SearchOverlay from "../search/SearchOverlay";
import { isSearchOverlayEnabled, overlayCloseTarget, rememberNonSearchLocation, resolveSearchOverlayBackground } from "../search/searchOverlayLocation";
import PwaInstallPrompt from "../pwa/PwaInstallPrompt";

/** Channel content body — used by both /channel/:channelId AND the
 *  /search master/detail layout (col 3 when slot.kind === "channel").
 *  Pulling the lookup-and-hydrate logic out of the route component lets the
 *  search-slot path render the same content without faking URL params. */
function ChannelById({ channelId }: { channelId: string }) {
  const { formatMessage } = useIntl();
  const channels = useChannelStore((s) => s.channels);
  const dmChannels = useChannelStore((s) => s.dmChannels);
  const ensureChannel = useChannelStore((s) => s.ensureChannel);
  const [missingChannelId, setMissingChannelId] = useState<string | null>(null);
  const all = [...channels, ...dmChannels];
  const channel = all.find((c) => c.id === channelId);
  // ⌘K "recent conversations" (task #113): a resolved, non-thread conversation
  // the user is looking at is by definition the most recent one.
  useRecordRecentConversation(channel && channel.type !== "thread" ? channel.id : null);

  // Async resolution: when `channelId` is new and not yet in stores, ensure
  // it (server fetch) and set `missingChannelId` sentinel if it can't be
  // resolved. `missingChannelId` is a pure resolution sentinel — no user
  // input lives here, so no clobber risk (verified by @铁根 msg=6b34e537).
  // Same async-arrival recognition family as PR #2532 AddMembersDialog.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!channelId || channel) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setMissingChannelId(null);
      return;
    }

    let cancelled = false;
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setMissingChannelId(null);
    void ensureChannel(channelId).then((resolved) => {
      if (cancelled) return;
      if (!resolved) setMissingChannelId(channelId);
    });

    return () => {
      cancelled = true;
    };
  }, [channelId, channel, ensureChannel]);

  // While the channel hasn't been found AND we haven't given up resolving it,
  // hold the placeholder. The previous tri-state (channelStoreLoading OR
  // hydratingChannelId === channelId) flashed through ChatPanel's "Select a
  // channel" empty state on first render — before the effect could mark the
  // row as hydrating — which manifested as a flicker + layout shift when
  // opening a thread search hit whose channel row wasn't yet in the store
  // (stdrc msg=71334a2d 2026-05-27 "闪一下然后错位").
  if (!channel && missingChannelId !== channelId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-foreground-muted font-display text-lg font-bold uppercase">
        {formatMessage({ id: "layout.main.loadingChannel" })}
      </div>
    );
  }

  return <ChatPanel channel={channel ?? null} />;
}

/** Route: /channel/:channelId */
function ChannelRoute() {
  const { channelId } = useParams<{ channelId: string }>();
  if (!channelId) return <ChatPanel channel={null} />;
  return <ChannelById channelId={channelId} />;
}

/** DM body — same pattern as ChannelById, used by both the route and the
 *  /search col-3 slot. */
function DmById({ dmId }: { dmId: string }) {
  const { formatMessage } = useIntl();
  const dmChannels = useChannelStore((s) => s.dmChannels);
  const ensureChannel = useChannelStore((s) => s.ensureChannel);
  const [missingDmId, setMissingDmId] = useState<string | null>(null);
  const channel = dmChannels.find((c) => c.id === dmId);
  useRecordRecentConversation(channel?.id ?? null);

  // Same async-resolution sentinel pattern as ChannelById above.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    if (!dmId || channel) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setMissingDmId(null);
      return;
    }

    let cancelled = false;
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setMissingDmId(null);
    void ensureChannel(dmId).then((resolved) => {
      if (cancelled) return;
      if (!resolved) setMissingDmId(dmId);
    });

    return () => {
      cancelled = true;
    };
  }, [dmId, channel, ensureChannel]);

  if (!channel && missingDmId !== dmId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-foreground-muted font-display text-lg font-bold uppercase">
        {formatMessage({ id: "layout.main.loadingChannel" })}
      </div>
    );
  }

  return <ChatPanel channel={channel ?? null} />;
}

/** Route: /dm/:dmId */
function DmRoute() {
  const { dmId } = useParams<{ dmId: string }>();
  if (!dmId) return <ChatPanel channel={null} />;
  return <DmById dmId={dmId} />;
}

/** Suspense fallback for lazy-loaded main-area panels (routed full-page views:
 *  AgentRoute, MachineRoute, HumanRoute, SettingsRoute, ReleaseNotesRoute, etc.).
 *  `flex-1` fills the routes container column. */
function PanelFallback() {
  const { formatMessage } = useIntl();
  return (
    <div className="flex flex-1 items-center justify-center text-foreground-muted font-display text-lg font-bold">
      {formatMessage({ id: "layout.main.loading" })}
    </div>
  );
}

/** Suspense fallback for lazy-loaded OVERLAY panels (ProfilePanel, LegacyTaskPanel).
 *  These render alongside the main content in the same flex row; a `flex-1` fallback
 *  would split the mobile viewport 50/50 with the main panel, producing the
 *  "half-loaded agent detail" bug reported in `#proj-uiux:c8711d2a` msg=f4f07d15
 *  (2026-05-01). On mobile the panel itself uses `absolute inset-0 z-30` to cover
 *  the main content, so its fallback must use the same geometry — otherwise during
 *  the few hundred ms of lazy chunk load we flash the split. On desktop the
 *  overlay panel is inline (`md:relative`), so `md:flex-1` restores the normal
 *  sidebar-like fill. */
function OverlayPanelFallback({ testId }: { testId?: string } = {}) {
  const { formatMessage } = useIntl();
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-layer-canvas text-foreground-muted font-display text-lg font-bold md:relative md:inset-auto md:z-auto md:flex-1 md:border-l md:border-line-seam"
      data-testid={testId}
    >
      {formatMessage({ id: "layout.main.loading" })}
    </div>
  );
}

/** Agent body — used by both /agent/:agentId AND the /search col-3 slot.
 *
 * A peer-server agent seen through an active joint channel is never in the
 * local `agentStore` — that store only holds this server's own agents. Reading
 * only the store therefore rendered `AgentUnavailablePanel` ("terminated or no
 * longer available in this server") for every remote agent, which is the wrong
 * sentence: nothing was terminated, it simply belongs elsewhere.
 *
 * So we also consult the viewer-server-scoped projection cache that member /
 * message-sender / mention surfaces prime — the same source `ProfilePanel`
 * uses — and hand `currentServerId` to the render guard so a bounded remote
 * partial is allowed to render. We deliberately do NOT fetch this server's
 * `/agents/:id` for it: that endpoint correctly 404s on a foreign id.
 *
 * A direct route hit with no bounded projection still falls through to
 * unavailable, as do same-server incomplete/deleted agents. (task #19)
 */
function AgentById({ agentId, onBack }: { agentId: string; onBack?: () => void }) {
  // Fine-grained selector: only re-renders when THIS agent's data changes,
  // not when other agents update (which would create a new agents array reference).
  const agent = useAgentStore(
    useCallback((s) => s.agents.find((a) => a.id === agentId), [agentId])
  );
  const currentServerId = useServerStore((s) => s.current?.id);
  const projectedAgent = agent ?? getCachedAgentProfile(currentServerId, agentId);
  if (!canRenderAgentDetail(projectedAgent, currentServerId)) {
    return <Suspense fallback={<PanelFallback />}><AgentUnavailablePanel /></Suspense>;
  }
  return <Suspense fallback={<PanelFallback />}><AgentDetailPanel agent={projectedAgent} onBack={onBack} /></Suspense>;
}

/** Route: /agent/:agentId */
function AgentRoute() {
  const { agentId } = useParams<{ agentId: string }>();
  if (!agentId) return null;
  return <AgentById agentId={agentId} />;
}

/** Computer body — used by both /computer/:machineId and the /search col-3 slot. */
function MachineById({ machineId }: { machineId: string }) {
  const { formatMessage } = useIntl();
  const machines = useMachineStore((s) => s.machines);
  const machine = machines.find((m) => m.id === machineId);
  if (!machine) {
    return (
      <div className="flex flex-1 items-center justify-center text-foreground-muted font-display text-lg font-bold uppercase">
        {formatMessage({ id: "layout.main.computerNotFound" })}
      </div>
    );
  }
  return <Suspense fallback={<PanelFallback />}><MachineDetailPanel machine={machine} /></Suspense>;
}

/** Route: /machine/:machineId */
function MachineRoute() {
  const { machineId } = useParams<{ machineId: string }>();
  const server = useServerStore((s) => s.current);
  if (!machineId) return null;
  if (server?.role === "guest") {
    return <Navigate to={server.slug ? `/s/${server.slug}` : "/"} replace />;
  }
  return <MachineById machineId={machineId} />;
}

/** Human body — used by both /human/:userId AND the /search col-3 slot. */
function HumanById({ userId, onBack }: { userId: string; onBack?: () => void }) {
  const { formatMessage } = useIntl();
  const members = useServerStore((s) => s.members);
  const currentServerId = useServerStore((s) => s.current?.id);
  const human = members.find((m) => m.userId === userId);
  const [fallbackHuman, setFallbackHuman] = useState<HumanProfile | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // Async-loader: fetch fallback human profile when `userId` / `currentServerId`
  // change. Both fallbackHuman + fallbackLoading are server-fetch derived,
  // not user-controlled. Same async-loader FP family as PR #2530's
  // useChannelMembers / InviteAcceptPage loaders.
  // oxlint-disable-next-line react-doctor/no-cascading-set-state
  useEffect(() => {
    let cancelled = false;
    if (!userId || !currentServerId) {
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setFallbackHuman(null);
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
      setFallbackLoading(false);
      return;
    }
    // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setFallbackLoading(true);
    void api
      .get(`/servers/${currentServerId}/members/${userId}/profile`)
      .then(({ data }) => {
        if (!cancelled) setFallbackHuman(data as HumanProfile);
      })
      .catch(() => {
        if (!cancelled) setFallbackHuman(null);
      })
      .finally(() => {
        if (!cancelled) setFallbackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentServerId, userId]);

  const resolvedHuman = resolveHumanProfile(human, fallbackHuman);
  if (resolvedHuman) {
    // `key={resolvedHuman.userId}` forces a fresh remount when the panel
    // switches to a different human — every entity-scoped state in
    // HumanDetailPanel resets to its initializer cleanly, no in-component
    // mirror-prop effect needed.
    return <Suspense fallback={<PanelFallback />}><HumanDetailPanel key={resolvedHuman.userId} human={resolvedHuman} onBack={onBack} /></Suspense>;
  }
  if (fallbackLoading) return <PanelFallback />;
  return (
    <div className="flex flex-1 items-center justify-center text-foreground-muted font-display text-lg font-bold uppercase">
      {formatMessage({ id: "layout.main.humanNotFound" })}
    </div>
  );
}

/** Route: /human/:userId */
function HumanRoute() {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return <HumanById userId={userId} />;
}

/** Route: /settings/:tab?/* */
function SettingsRoute() {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();
  const canonicalSlug = legacySettingsRouteRedirectSlug(tab);
  if (canonicalSlug) {
    return (
      <Navigate
        to={`${location.pathname.replace(/\/settings\/[^/]+\/?$/, `/settings/${canonicalSlug}`)}${location.search}${location.hash}`}
        replace
      />
    );
  }
  return (
    <Suspense fallback={<PanelFallback />}>
      <SettingsPanel
        tab={tab}
        accountPasswordChangeIntent={tab === "account" && isChangePasswordSettingsIntent(location.search)}
      />
    </Suspense>
  );
}

/** Route: /members/graph */
function MemberGraphRoute() {
  const server = useServerStore((s) => s.current);
  const serverSlug = server?.slug;
  const onMobileBack = useMobileBack(serverSlug ? `/s/${serverSlug}/members` : "/");
  const { formatMessage } = useIntl();
  const mobileBackProps = useMemo(() => ({
    "data-testid": "member-graph-mobile-back",
    title: formatMessage({ id: "layout.memberGraph.back" }),
  }), [formatMessage]);

  if (server?.role === "guest") {
    return <Navigate to={serverSlug ? `/s/${serverSlug}` : "/"} replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title={formatMessage({ id: "layout.memberGraph.title" })}
        titleSuffix={<Badge.Experimental />}
        onMobileBack={onMobileBack}
        mobileBackProps={mobileBackProps}
      />
      <div className="flex-1 overflow-y-auto bg-layer-canvas px-5 py-4">
        <Suspense fallback={<PanelFallback />}>
          <MemberGraphSection sectionLabel={formatMessage({ id: "layout.memberGraph.connectionsSectionLabel" })} />
        </Suspense>
      </div>
    </div>
  );
}

/** Route: /release-notes */
function ReleaseNotesRoute() {
  return <Suspense fallback={<PanelFallback />}><ReleaseNotesPanel /></Suspense>;
}

function LegacyWorkspaceGridRedirect() {
  const slug = useServerStore((s) => s.current?.slug);
  return <Navigate to={slug ? `/s/${slug}` : "/"} replace />;
}


function LegacyThreadsRedirect() {
  const slug = useServerStore((s) => s.current?.slug);
  return <Navigate to={slug ? `/s/${slug}/activity` : "/"} replace />;
}

/** Route: /saved */
function SavedRoute() {
  return <Suspense fallback={<PanelFallback />}><SavedPanel /></Suspense>;
}

/** Route: /tasks */
function TasksRoute() {
  return <Suspense fallback={<PanelFallback />}><TasksPanel /></Suspense>;
}



/** Route: /search col-3 host. When the search slot is open, MainLayout puts
 *  MessageSearchPage in the sidebar slot (col 2) and renders this component
 *  in the main routes container (col 3) — dispatched on slot.kind to the
 *  same body components the dedicated /channel/:id, /dm/:id, /agent/:id,
 *  /human/:userId, /computer/:machineId routes use, so col 3 is the SAME picked-entity surface
 *  the user would see by direct navigation. When the slot is null, this
 *  renders MessageSearchPage in the routes container so /search alone
 *  (without ?open=) still shows the full-width search page. */
// Dispatch an open content slot to the col-3 entity surface — the SAME body
// components the dedicated /channel/:id, /dm/:id, /agent/:id, /human/:userId, /computer/:machineId
// routes use, so col 3 is identical to direct navigation. Shared by both the
// /search master/detail (SearchContentRoute) and the /inbox Activity one
// (InboxContentRoute) so their col-3 behavior is byte-identical.
function renderContentSlot(slot: SearchContentSlot, closeSlot: () => void) {
  if (slot.kind === "channel") return <ChannelById channelId={slot.id} />;
  if (slot.kind === "dm") return <DmById dmId={slot.id} />;
  // Agent/human search hits are detail pages inside the master/detail stack.
  // Their structural Back control closes the picked slot and restores the
  // exact Search/Activity list state; falling back to /members would leave
  // the surface that actually opened the profile.
  if (slot.kind === "agent") return <AgentById agentId={slot.id} onBack={closeSlot} />;
  if (slot.kind === "human") return <HumanById userId={slot.id} onBack={closeSlot} />;
  if (slot.kind === "machine") return <MachineById machineId={slot.id} />;
  // kind === "thread" — first-principles fix per stdrc 2026-05-28 (msg=41f5c906
  // / msg=138867ba). A thread is NOT a channel — it's a parent-message-anchored
  // sub-conversation. Rendering ChannelById/ChatPanel for the thread channel
  // showed a single floating reply with the wrong chrome. The right surface IS
  // ThreadPanel — the same component the right-panel overlay uses — driven by
  // threadStore. The col-3 parent flex column is itself the column container
  // (no width/border/resize chrome needed; that's the chat col-4's job, not
  // col-3's). The opener (MessageSearchPage.openResult / ThreadsInbox.handleOpen)
  // seeds threadStore at click time, and useRightPanelUrlSync mirrors `?thread=`
  // so cold-load deeplinks restore threadStore (col-4 overlay never appears on
  // these routes — RightPanel's content-route guard returns null structurally).
  return <ContentSlotThreadPanel closeSlot={closeSlot} />;
}

function SearchContentRoute() {
  const slot = useSearchContentStore((s) => s.slot);
  const closeSlot = useSearchContentStore((s) => s.close);
  if (!slot) return <MessageSearchPage />;
  return renderContentSlot(slot, closeSlot);
}

/** Route: /activity — Activity surface, rendered as the search-style
 *  master/detail (no slot → full-width list; slot → picked entity in col 3,
 *  with the list hosted in col 2 by the master/detail layout). The
 *  rail-vs-sidebar placement A/B was dropped 2026-06-30 (stdrc) — Activity is
 *  always the rail master/detail surface now. */
function InboxContentRoute() {
  const slot = useSearchContentStore((s) => s.slot);
  const closeSlot = useSearchContentStore((s) => s.close);
  if (!slot) {
    return <Suspense fallback={<PanelFallback />}><ThreadsInbox /></Suspense>;
  }
  if (slot.kind === "thread") {
    return <ActivityThreadContentRoute slot={slot} closeSlot={closeSlot} />;
  }
  return renderContentSlot(slot, closeSlot);
}

export function ActivityThreadContentRoute({ slot, closeSlot }: { slot: SearchContentSlot; closeSlot: () => void }) {
  const { formatMessage } = useIntl();
  const consumeMessageFocus = useSearchContentStore((s) => s.consumeMessageFocus);
  type ActivityThreadIdentity = {
    parentChannelId: string;
    parentMessageId: string;
    threadChannelId: string;
  };
  const threadItem = useInboxStore((s) => {
    const item = s.items.find((candidate) => candidate.kind === "thread" && candidate.threadChannelId === slot.id);
    return item?.kind === "thread" ? item : null;
  });
  const openThreadChannelId = useThreadStore((s) => s.openThreadChannelId);
  const openParentChannelId = useThreadStore((s) => s.openParentChannelId);
  const openParentMessageId = useThreadStore((s) => s.openParentMessageId);
  const loaded = useInboxStore((s) => s.loaded);
  const loading = useInboxStore((s) => s.loading);
  const loadInbox = useInboxStore((s) => s.loadInbox);
  const retainedThreadIdentityRef = useRef<ActivityThreadIdentity | null>(null);
  const openThreadIdentity = useMemo(() => {
    if (openThreadChannelId !== slot.id || !openParentChannelId || !openParentMessageId) return null;
    return {
      parentChannelId: openParentChannelId,
      parentMessageId: openParentMessageId,
      threadChannelId: openThreadChannelId,
    };
  }, [openParentChannelId, openParentMessageId, openThreadChannelId, slot.id]);

  useEffect(() => {
    if (!loaded && !loading) {
      void loadInbox({ reset: true });
    }
  }, [loadInbox, loaded, loading]);

  const currentThreadIdentity = threadItem
    ? {
        parentChannelId: threadItem.parentChannelId,
        parentMessageId: threadItem.parentMessageId,
        threadChannelId: threadItem.threadChannelId,
      }
    : openThreadIdentity;
  if (currentThreadIdentity) {
    retainedThreadIdentityRef.current = currentThreadIdentity;
  }
  const retainedSlotThreadIdentity = retainedThreadIdentityRef.current?.threadChannelId === slot.id
    ? retainedThreadIdentityRef.current
    : null;
  const threadIdentity = currentThreadIdentity ?? retainedSlotThreadIdentity;
  const parentChannelId = threadIdentity?.parentChannelId;
  const parentMessageId = threadIdentity?.parentMessageId;
  const threadChannelId = threadIdentity?.threadChannelId;
  const focusedMessageId = slot.messageId ?? null;
  const panelThreadIdentity = useMemo(() => (
    parentChannelId !== undefined && parentMessageId !== undefined && threadChannelId !== undefined
      ? { parentChannelId, parentMessageId, threadChannelId, focusedMessageId }
      : null
  ), [focusedMessageId, parentChannelId, parentMessageId, threadChannelId]);
  const handleFocusedMessageConsumed = useCallback(
    () => consumeMessageFocus("thread", slot.id),
    [consumeMessageFocus, slot.id],
  );

  if (!panelThreadIdentity) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-layer-canvas">
        <PanelHeader title={formatMessage({ id: "message.threadPanel.thread" })} containerProps={SHRINK_PANEL_HEADER_CONTAINER_PROPS} />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-foreground-muted font-mono text-sm">
            {loaded
              ? formatMessage({ id: "layout.main.threadNotInActivity" })
              : formatMessage({ id: "common.loading" })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ThreadPanel
      presentation="side"
      threadIdentity={panelThreadIdentity}
      onFocusedMessageConsumed={handleFocusedMessageConsumed}
      onClose={closeSlot}
    />
  );
}

/** Route: * — redirect to first channel */
function DefaultRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const { navigator } = useContext(NavigationContext);
  const channels = useChannelStore((s) => s.channels);
  const loading = useChannelStore((s) => s.loading);
  const slug = useServerStore((s) => s.current?.slug);
  const [isDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const disclosureRestoreState = useMemo(() => buildSidebarDisclosureRestoreState(), []);
  const suppressDefaultRouteRedirect =
    (location.state as { suppressDefaultRouteRedirect?: unknown } | null)?.suppressDefaultRouteRedirect === true;
  const defaultChannelPath = slug && channels[0]
    ? `/s/${slug}/channel/${channels[0].id}`
    : null;
  // On mobile, don't auto-redirect — the sidebar (channel list) is shown inline
  // as the main content via the master-detail layout in MainLayout.
  const shouldRedirect = Boolean(
    isDesktop
    && defaultChannelPath
    && !suppressDefaultRouteRedirect
    && location.pathname !== defaultChannelPath,
  );
  // Not <Navigate replace>: BrowserRouter pushes history immediately but
  // renders the new location in a transition, so this route can still render
  // for /s/<a> after the user already navigated on (switching servers twice
  // quickly). A replace then would overwrite that newer entry and bounce them
  // back to <a>. Redirect only while history still is the location we
  // rendered for.
  useEffect(() => {
    if (!shouldRedirect || !defaultChannelPath) return;
    // The router's own history, not window.location: under MemoryRouter
    // (tests, embedded shells) window.location never moves, and reading it
    // would suppress every redirect. BrowserRouter's history reads the URL.
    const live = (navigator as { location?: { pathname?: string } }).location?.pathname;
    if (live !== undefined && live !== location.pathname) return;
    navigate(defaultChannelPath, { replace: true, state: disclosureRestoreState });
  }, [shouldRedirect, defaultChannelPath, location.pathname, navigator, navigate, disclosureRestoreState]);
  if (shouldRedirect) return null;
  // A wildcard test harness (or an embedding shell) can keep this element
  // mounted after the redirect reaches the canonical channel route. Do not
  // render a second ChatPanel in that settled state; the real channel route
  // owns the surface, and returning null also prevents the redirect effect
  // from retriggering on every location update.
  if (isDesktop && defaultChannelPath && location.pathname === defaultChannelPath && !suppressDefaultRouteRedirect) {
    return null;
  }
  if (loading) {
    return null;
  }
  // Desktop: show empty state. Mobile: this won't be visible (sidebar is shown instead).
  return <ChatPanel channel={null} />;
}

// Empty placeholder for /members and /computers root routes. Unlike
// DefaultRoute, these MUST NOT auto-redirect to the first channel — that
// would silently flip the URL into chat mode (and re-highlight the Chat
// rail button) the moment the user clicks Members or Computers.
function EmptyRoute() {
  const server = useServerStore((s) => s.current);
  if (server?.role === "guest") {
    return <Navigate to={server.slug ? `/s/${server.slug}` : "/"} replace />;
  }
  return <ChatPanel channel={null} />;
}

// Computers route — on desktop the Sidebar owns the Computers rail with
// the list of machines, and the main panel shows the empty ChatPanel.
// On mobile the Sidebar is not rendered for /computers (removed from
// isMobileMasterRoute 2026-05-01 per stdrc msg 2a500cb7), so the main
// panel here IS the page the user sees: MobileComputersPanel renders a
// proper h-[62px] yellow navbar + cream body + cards, matching the
// other mobile panels (Tasks / Saved / Threads / Settings sub-pages).
function ComputersRoute() {
  const server = useServerStore((s) => s.current);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  if (server?.role === "guest") {
    return <Navigate to={server.slug ? `/s/${server.slug}` : "/"} replace />;
  }
  // Host-shell embed (`?embed=raft-settings-v1&shell=host`) FORCES the mobile panel
  // regardless of viewport width. Reason (@MingQi): a native WebView on a tablet or in
  // landscape can exceed the md breakpoint; without this guard, the route would fall
  // through to `<ChatPanel>` and the WebView would render the wrong page. Mobile can't
  // reliably fake a narrow viewport from its side, so the host-shell decision must be
  // authoritative in web — see PR #4799.
  const forceMobilePanel = isHostShell() || !isDesktop;
  return forceMobilePanel ? <MobileComputersPanel /> : <ChatPanel channel={null} />;
}

/** Thread panel wrapper — only renders if a thread is open. Owns the column
 *  container chrome (positioning / width / resize / border) appropriate for
 *  the host. ThreadPanel itself is column-agnostic per stdrc 2026-05-28
 *  msg=138867ba: page object lives in a column container; the same surface
 *  renders identically across hosts.
 *
 *  - "side"         — chat col 4: full-row overlay until the chat row can fit
 *                     both pane minimums; otherwise an inline column with a
 *                     persisted width and left-edge resize handle.
 *  - "modal"        — bordered card with standard shadow-float, fixed centered size.
 *                     Caller wraps in <Modal> for backdrop + ESC.
 *  - "mobile-modal" — full-screen overlay (no Modal wrapper); back chevron is
 *                     the close affordance.
 */
/** The task whose host message anchors this thread, if any.
 *
 *  Opening a v1 task IS opening its message's thread (`TasksPanel.openTask`),
 *  so the task is found by matching the thread's parent message rather than by
 *  any task-specific routing state. Returns null for an ordinary thread, which
 *  is what keeps the Properties block off non-task threads. */
function useThreadHostTask(parentMessageId: string | null) {
  const parentChannelId = useThreadStore((s) => s.openParentChannelId);
  const tasks = useTaskStore((s) => s.tasks);
  const serverTasks = useTaskStore((s) => s.serverTasks);
  const parentChannelTasks = useTaskStore((s) => selectChannelTaskBucket(s, parentChannelId));
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const parentLoaded = useTaskStore((s) => (parentChannelId ? s.loadedByChannelId[parentChannelId] ?? false : false));
  const parentLoading = useTaskStore((s) => (parentChannelId ? s.loadingByChannelId[parentChannelId] ?? false : false));

  // `tasks` only ever holds the channel the user currently has open, and
  // `serverTasks` is built from `type in ('channel','joint')` — DM and private
  // channels are excluded from it by design, because a server-wide board must
  // not list what happens in someone's DMs.
  //
  // Both of those are fine on their own, and together they left a hole: open a
  // DM task's thread from anywhere that is not that DM — Activity, another
  // channel — and neither source can supply the task. `hostTask` comes back
  // null, so TaskModalHead never mounts, and TaskModalHead is what renders
  // TaskProperties, which is the only place the status can be changed. The user
  // gets a bare thread viewer with no task affordance at all (@artin, task #44).
  //
  // So resolve from the parent channel's own bucket too, loading it on demand.
  // This costs nothing in the common case: a thread opened inside the channel
  // you are reading was already loaded by ChatPanel, so `parentLoaded` is true
  // and no request is made.
  useEffect(() => {
    loadThreadParentTasksIfNeeded({
      parentMessageId,
      parentChannelId,
      parentLoaded,
      parentLoading,
      loadTasks,
    });
  }, [loadTasks, parentChannelId, parentLoaded, parentLoading, parentMessageId]);

  return useMemo(
    () => resolveThreadHostTask(parentMessageId, { tasks, parentChannelTasks, serverTasks }),
    [parentMessageId, tasks, parentChannelTasks, serverTasks],
  );
}

/** The `#` is markup, not translatable copy — kept out of JSX so the i18n
 *  literal-disposition guard does not count it. */
function channelSigil(name: string): string {
  return `#${name}`;
}

/** Persistent bar for a task modal: where you are, and the way out.
 *
 *  It exists because suppressing ThreadPanel's header — needed so the modal
 *  does not announce itself as a thread — also removed the only visible close
 *  affordance. Backdrop and ESC still worked, but a dialog with no X is not a
 *  closable dialog.
 *
 *  Channel lives here rather than in the scrolling head so it survives scroll:
 *  the bar is the part that must always answer "where am I, and how do I get
 *  out". The title stays in the scroll region because a long one cannot be
 *  bounded by a fixed bar. */
const NON_INTERACTIVE_TOOLTIP_PROPS = { className: "pointer-events-none" };

function TaskModalBar({
  task,
  onClose,
  onViewInThread,
  mobile = false,
}: {
  task: Task;
  onClose: () => void;
  /** Absent when the task has no thread to show (legacy tasks, or a task
   *  whose anchor is itself a thread reply). */
  onViewInThread?: () => void;
  mobile?: boolean;
}) {
  const { formatMessage } = useIntl();
  return (
    // raft-ui PanelHeader owns the edges, as on every other panel head: the
    // last glyph 20px from the edge on desktop, and on a phone the Back
    // mirrors the last action, 3px from the edge. Its row is centred, so the X is
    // weighed against the whole two-line block, not its first line.
    <PanelHead>
      {mobile && (
        <PanelAction
          onClick={onClose}
          aria-label={formatMessage({ id: "task.modal.close" })}
          data-testid="task-modal-mobile-back"
        >
          <ArrowLeft />
        </PanelAction>
      )}
      {/* Two lines so the bar has body: where this lives, then what it is.
          Both are stable facts — the task's own title stays in the scrolling
          body, because a long one cannot be bounded by a fixed bar. */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-foreground-muted">
          {channelSigil(task.channelName || formatMessage({ id: "task.properties.unknownChannel" }))}
        </div>
        <div className="truncate text-sm font-bold" data-testid="task-modal-bar-label">
          {formatMessage({ id: "task.modal.taskWithNumber" }, { taskNumber: task.taskNumber })}
        </div>
      </div>
      {(onViewInThread || !mobile) && (
        <PanelActions>
          {/* Icon-only, the same quiet control as Close beside it — the shape
              the legacy task panel's "View in channel" already uses (Artea). */}
          {onViewInThread && (
            <Tooltip
              content={formatMessage({ id: "task.modal.viewInThread" })}
              disableHoverablePopup
              contentProps={NON_INTERACTIVE_TOOLTIP_PROPS}
            >
              <PanelAction
                onClick={onViewInThread}
                aria-label={formatMessage({ id: "task.modal.viewInThread" })}
                data-testid="task-modal-view-in-thread"
              >
                <ThreadIcon />
              </PanelAction>
            </Tooltip>
          )}
          {!mobile && (
            <PanelAction
              onClick={onClose}
              aria-label={formatMessage({ id: "task.modal.close" })}
              data-testid="task-modal-close"
            >
              <X />
            </PanelAction>
          )}
        </PanelActions>
      )}
    </PanelHead>
  );
}

function ThreadPanelWrapper({ presentation = "side", allowMaximize = true }: { presentation?: "side" | "modal" | "mobile-modal"; allowMaximize?: boolean }) {
  const openParentMessageId = useThreadStore((s) => s.openParentMessageId);
  const taskModal = useThreadStore((s) => s.taskModal);
  const closeThread = useThreadStore((s) => s.closeThread);
  const closeTaskModal = useThreadStore((s) => s.closeTaskModal);
  // Modal presentations render the task surface, whose identity lives in the
  // independent taskModal slot (task #699) — or, on the /tasks route, an
  // ordinary intent=thread open rendered as a modal, which keeps the store's
  // open* fields. The slot wins when present.
  const isTaskSurface = presentation !== "side";
  const parentMessageId = isTaskSurface
    ? taskModal?.parentMessageId ?? openParentMessageId
    : openParentMessageId;
  const surfaceThreadIdentity = useMemo(() => isTaskSurface && taskModal
    ? {
        parentMessageId: taskModal.parentMessageId,
        parentChannelId: taskModal.parentChannelId ?? "",
        threadChannelId: taskModal.threadChannelId,
        focusedMessageId: taskModal.focusedMessageId,
      }
    : undefined, [isTaskSurface, taskModal]);
  const closeSurface = isTaskSurface && taskModal ? closeTaskModal : closeThread;
  const hostTask = useThreadHostTask(parentMessageId);
  const nav = useAppNavigate();
  const openThread = useThreadStore((s) => s.openThread);
  const threadChannelId = taskModal?.threadChannelId ?? null;
  // "View in thread": leave the task surface for the ordinary side thread of
  // the same message — the reading the thread icon gives. Same two steps as a
  // thread ref (utils/refTarget.ts): land on the message, then open its
  // replies with the THREAD intent, so this never re-opens the task modal.
  const viewInThread = useCallback(() => {
    if (!hostTask) return;
    closeSurface();
    if (hostTask.channelType === "dm") nav.toDmMessage(hostTask.channelId, hostTask.messageId);
    else nav.toMessage(hostTask.channelId, hostTask.messageId);
    void openThread({
      parentChannelId: hostTask.channelId,
      parentMessageId: hostTask.messageId,
      threadChannelId,
      intent: "thread",
    });
  }, [closeSurface, hostTask, nav, openThread, threadChannelId]);
  const canViewInThread = !!hostTask && !hostTask.isLegacy && hostTask.channelType !== "thread";
  // The task sheet owns the current history entry. Close the store first so
  // the panel disappears synchronously, then consume the PUSH that opened it.
  // On a cold deep link there is no safe entry to pop, so the callback fallback
  // simply closes the sheet and leaves the user on the underlying Tasks route.
  const mobileTaskBack = useMobileBack(closeSurface, closeSurface);
  if (!parentMessageId) return null;
  // Composition point, deliberately: Properties is mounted ABOVE ThreadPanel
  // rather than inside it. ThreadPanel's identity is "the replies of a
  // message", and the endgame (a task owning its own discussion channel)
  // deletes exactly that premise — so task-shaped concerns must not accrete
  // inside it. See #proj-task thread 3a4a72db.
  if (presentation === "modal") {
    return (
      <DialogSurface
        className="h-[min(86vh,900px)] max-h-[calc(100dvh-2rem)] w-[min(960px,calc(100vw-2rem))]"
        data-testid="task-thread-modal"
      >
        {hostTask && <TaskModalBar task={hostTask} onClose={closeSurface} onViewInThread={canViewInThread ? viewInThread : undefined} />}
        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadPanel key={parentMessageId} presentation="modal" threadIdentity={surfaceThreadIdentity} hideHeader={!!hostTask} hideParentMessage={!!hostTask}
            parentSlot={hostTask ? <Suspense fallback={<div className="space-y-3 border-b border-line-hairline bg-layer-canvas p-4"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>}><TaskModalHead task={hostTask} /></Suspense> : undefined} />
        </div>
      </DialogSurface>
    );
  }
  if (presentation === "mobile-modal") {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-layer-canvas" data-testid="task-thread-modal">
        {hostTask && (
          <TaskModalBar task={hostTask} onClose={mobileTaskBack} onViewInThread={canViewInThread ? viewInThread : undefined} mobile />
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <ThreadPanel key={parentMessageId} presentation="mobile-modal" threadIdentity={surfaceThreadIdentity} hideHeader={!!hostTask} hideParentMessage={!!hostTask}
            parentSlot={hostTask ? <Suspense fallback={<div className="space-y-3 border-b border-line-hairline bg-layer-canvas p-4"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /></div>}><TaskModalHead task={hostTask} /></Suspense> : undefined} />
        </div>
      </div>
    );
  }
  return <SideThreadColumn key={parentMessageId} allowMaximize={allowMaximize} />;
}

/** Chat-side col-4 thread column container. Owns persisted width + resize +
 *  desktop/mobile chrome. Renders ThreadPanel for the surface content. */
function SideThreadColumn({ allowMaximize }: { allowMaximize: boolean }) {
  const channelCollapsed = useUIStore((s) => s.threadMaximized);
  const toggleChannel = useUIStore((s) => s.toggleThreadMaximized);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Read the actual CSS result only when the user opens the menu. There is
  // no resize subscription and no second copy of the responsive breakpoint.
  const canToggleChannel = useCallback(() => {
    const channel = panelRef.current?.parentElement?.querySelector<HTMLElement>(":scope > .thread-main-column");
    return !useProfileStore.getState().profileId && !!channel && getComputedStyle(channel).display !== "none"
      && useMessageStore.getState().currentChannelId === useThreadStore.getState().openParentChannelId;
  }, []);
  const [dynamicMax, setDynamicMax] = useState(() =>
    getThreadPanelDynamicMax(),
  );
  const getThreadDragStartWidth = useCallback(() => {
    const measuredWidth = panelRef.current?.getBoundingClientRect().width;
    return measuredWidth && measuredWidth > 0 ? measuredWidth : undefined;
  }, []);
  const { width, handleResizeStart, handleResizeMove, handleResizeEnd } = useResizablePanel({
    storageKey: "slock:threadPanelWidth",
    min: THREAD_PANEL_MIN_WIDTH,
    max: dynamicMax,
    defaultWidth: THREAD_PANEL_DEFAULT_WIDTH,
    direction: "left",
    getDragStartWidth: getThreadDragStartWidth,
  });
  const handleThreadResizeStart = useCallback((e: React.PointerEvent) => {
    // Browser window resize already forces layout and Timeline anchor repair.
    // Keep that path CSS-only; refresh the drag bounds only when the user
    // intentionally resizes this panel.
    setDynamicMax(getThreadPanelDynamicMax());
    handleResizeStart(e);
  }, [handleResizeStart]);
  return (
    <div
      ref={panelRef}
      className="thread-side-column flex flex-col bg-layer-canvas"
      data-testid="thread-side-column"
      style={{ "--thread-panel-width": `${width}px` } as React.CSSProperties}
    >
      <div
        className="thread-side-column-resizer absolute left-0 top-0 bottom-0 w-2 -ml-1 z-10 cursor-col-resize touch-none select-none"
        onPointerDown={handleThreadResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
      />
      <ThreadPanel presentation="side" channelCollapsed={channelCollapsed} onToggleChannel={allowMaximize ? toggleChannel : undefined} canToggleChannel={canToggleChannel} />
    </div>
  );
}

/** Profile panel wrapper — only renders if a profile is open */
function ProfilePanelWrapper({ collapseChannel = false, collapseThread = false }: { collapseChannel?: boolean; collapseThread?: boolean } = {}) {
  const isOpen = useProfileStore((s) => !!s.profileId);
  if (!isOpen) return null;
  // Keep this marker as a direct child of the thread layout while flattening
  // its box.  That lets CSS switch the existing three-column flex row to
  // Thread | Profile without moving/unmounting the ThreadPanel element.
  return (
    <div
      className="thread-profile-side-column contents"
      data-testid="thread-profile-side-column"
      data-collapse-channel={collapseChannel ? "true" : "false"}
      data-collapse-thread={collapseThread ? "true" : "false"}
    >
      <Suspense fallback={(
        <OverlayPanelFallback
          testId={import.meta.env.VITE_E2E === "true" ? "profile-panel-fallback" : undefined}
        />
      )}><ProfilePanel /></Suspense>
    </div>
  );
}

/** Legacy task panel wrapper — only renders if a legacy task is open */
function LegacyTaskPanelWrapper({ presentation = "side" }: { presentation?: "side" | "modal" | "mobile-modal" }) {
  const isOpen = useLegacyTaskPanelStore((s) => !!s.task);
  if (!isOpen) return null;
  return <Suspense fallback={<OverlayPanelFallback />}><LegacyTaskPanel presentation={presentation} /></Suspense>;
}

/** Right panel — renders the open views in their overlay-stack order.
 *
 * An ordinary thread and a profile are both real surfaces, not alternatives:
 * opening a profile from a thread must retain the thread underneath so closing
 * the profile returns to the exact conversation the user came from. Task
 * threads remain modal-owned and keep their existing single-surface behavior.
 */
function RightPanel() {
  const location = useLocation();
  const threadOpen = useThreadStore((s) => !!s.openParentMessageId);
  const threadOpenedAt = useThreadStore((s) => s.openedAt);
  const profileOpen = useProfileStore((s) => !!s.profileId);
  const profileOpenedAt = useProfileStore((s) => s.openedAt);
  const profileOpenSource = useProfileStore((s) => s.openSource);
  const legacyTaskOpen = useLegacyTaskPanelStore((s) => !!s.task);
  const closeThread = useThreadStore((s) => s.closeThread);
  const closeTaskModal = useThreadStore((s) => s.closeTaskModal);
  const closeLegacyTask = useLegacyTaskPanelStore((s) => s.closeLegacyTask);
  const isTasksRoute = /\/tasks\/?$/.test(location.pathname);
  // Tasks-route: rail-visible (md+) wraps the thread / legacy task in <Modal>
  // (bounded centered card with backdrop). Mobile (no Rail, <md) renders the
  // panel directly so it behaves like a regular full-screen thread overlay.
  // The md threshold matches LeftRail's own `hidden md:flex` — stdrc
  // 2026-05-21 #proj-task:287f18ce msg=59d4256c: "只要显示 Rail，就应该
  // 显示为中间弹窗". Earlier 1024px threshold made medium viewports drop into
  // mobile mode even with the Rail visible, which felt wrong.
  const [railVisible, setRailVisible] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setRailVisible(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const profileIsTop = profileOpen && (!threadOpen || profileOpenedAt >= threadOpenedAt);
  const threadIsTop = threadOpen && (!profileOpen || threadOpenedAt > profileOpenedAt);

  // Keep both ordinary side-panel surfaces mounted. The later child is the
  // visual top layer (mobile uses the shared absolute/z-index overlay; desktop
  // lays the two relative columns out side by side). This is intentionally
  // limited to ordinary threads: task threads are centered/modal surfaces and
  // must continue to be owned by their Modal wrapper.
  // Every branch that renders a side thread goes through this SAME shape —
  // fragment [thread, profile|null] — so closing the profile reconciles to the
  // identical mounted thread node instead of remounting it.
  const renderStackedSidePanels = (threadPanel: ReturnType<typeof ThreadPanelWrapper>, source: "channel" | "thread" | null) => (
    <>{threadPanel}{profileOpen ? (
      <ProfilePanelWrapper
        collapseChannel={source !== "channel"}
        collapseThread={source === "channel"}
      />
    ) : null}</>
  );

  // Is the open thread anchored to a task? Uses the same store the chip list and
  // badge read, so "this thread belongs to a task" is answered identically
  // wherever it is asked.
  // Read the caller's INTENT, do not infer it. "Is the parent a task" was the
  // old test and it conflated two different actions on one message: the thread
  // icon (show the replies, side panel) and the task badge (open the task,
  // centered modal). @stdrc msg=ef2492f5.
  // The task modal owns an independent slot (task #699) and overlays whatever
  // surface is underneath — a side thread it was opened over keeps its
  // identity, mount, and scroll; closing the modal just empties the slot.
  const taskModalOpen = useThreadStore((s) => s.taskModal !== null);

  // /search 4-column layout (stdrc #proj-uiux:c2313b1d msg=a19e7a44 2026-05-28):
  // when col 3 hosts a channel/dm/agent/human surface, clicking thread / replies
  // opens the thread in col 4 — same as chat. The col-4 overlay (ThreadPanelWrapper
  // = SideThreadColumn at lg, full-screen overlay below lg) reuses the chat-side
  // thread column container; the page object is identical (page-object/container
  // axiom, msg=138867ba). When slot.kind === "thread" the search hit IS a thread
  // and SearchContentRoute renders ThreadPanel directly in col 3 — col 4 must NOT
  // also mount ThreadPanel, or we'd double-render. ProfilePanel still allowed.
  // /search AND /inbox are master/detail content routes that host the picked
  // entity (incl. thread) in col 3. Same structural rule for both: when col 3
  // IS a thread, col 4 must not also mount ThreadPanel (double-render);
  // otherwise a thread opened from inside a col-3 channel still gets col 4.
  // Both /search and /activity are master/detail content routes (the
  // rail-vs-sidebar placement A/B was dropped 2026-06-30 — Activity is always
  // the rail master/detail surface now).
  // In search-overlay mode the URL is /search but this panel must behave for the
  // frozen background channel, so key off the background location when present.
  const rightPanelPath = (resolveSearchOverlayBackground(location) ?? location).pathname;
  const isSearchRoute = /\/search(\/|$)/.test(rightPanelPath);
  const isActivityRoute = /\/activity(\/|$)/.test(rightPanelPath);
  const isContentRoute = isSearchRoute || isActivityRoute;
  const searchSlotKind = useSearchContentStore((s) => s.slot?.kind ?? null);
  // The task modal is an overlay surface: it renders ON TOP of the base
  // decision below instead of replacing it (task #699 — the base used to be
  // dropped because both shared the one open slot). Its close handler empties
  // the taskModal slot; the /tasks-route open* modal keeps closeThread.
  const renderTaskThreadPanel = (onClose: () => void) => {
    if (railVisible) {
      // Centered modal with backdrop. Backdrop click + ESC close it; no
      // inline X (back chevron handles close at md-lg, ESC/backdrop at lg+).
      return (
        <Modal onClose={onClose} closeOnBackdrop>
          <ThreadPanelWrapper presentation="modal" />
        </Modal>
      );
    }
    return <ThreadPanelWrapper presentation="mobile-modal" />;
  };
  const taskModalOverlay = taskModalOpen ? renderTaskThreadPanel(closeTaskModal) : null;
  if (isContentRoute) {
    let base = null;
    if (
      threadOpen
      && !isTasksRoute
      && searchSlotKind
      && searchSlotKind !== "thread"
      && profileOpen
    ) {
      base = renderStackedSidePanels(<ThreadPanelWrapper allowMaximize={false} />, profileOpenSource);
    } else if (profileIsTop) base = <ProfilePanelWrapper />;
    else if (threadIsTop && searchSlotKind && searchSlotKind !== "thread") {
      base = renderStackedSidePanels(<ThreadPanelWrapper allowMaximize={false} />, profileOpenSource);
    }
    return <>{base}{taskModalOverlay}</>;
  }

  if (threadOpen && !isTasksRoute && profileOpen) {
    return <>{renderStackedSidePanels(<ThreadPanelWrapper />, profileOpenSource)}{taskModalOverlay}</>;
  }
  if (profileIsTop) return <><ProfilePanelWrapper />{taskModalOverlay}</>;
  // Centered because the thread belongs to a TASK, not because of the route.
  // Gating on `isTasksRoute` meant the same task opened as a modal from the
  // Tasks page and as a side panel from its own channel — one object, two
  // containers, decided by where you happened to click. @stdrc.
  if (threadIsTop && isTasksRoute) {
    return <>{renderTaskThreadPanel(closeThread)}{taskModalOverlay}</>;
  }
  if (threadIsTop) return <>{renderStackedSidePanels(<ThreadPanelWrapper />, profileOpenSource)}{taskModalOverlay}</>;
  if (isTasksRoute && legacyTaskOpen) {
    if (railVisible) {
      return (
        <Modal onClose={closeLegacyTask} closeOnBackdrop>
          <LegacyTaskPanelWrapper presentation="modal" />
        </Modal>
      );
    }
    return <LegacyTaskPanelWrapper presentation="mobile-modal" />;
  }
  if (legacyTaskOpen) return <LegacyTaskPanelWrapper />;
  // Overlay-only case: task modal open over a bare channel (no side thread,
  // no profile). The base surfaces above all returned before this point.
  return taskModalOverlay;
}

/** Sync right panel state ↔ URL query params */
function useRightPanelUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef({ pathname: location.pathname, search: location.search });
  // Search-overlay mode: the URL is the overlay's own /search?q=… and carries no
  // panel params, while the thread/profile panels stay mounted for the frozen
  // background. Reading that URL would close the open thread (and closing the
  // overlay would reopen it from scratch, refetch and flash "loading" — task
  // #763); writing to it would put panel params on the search URL. So the sync
  // is isolated while overlaying, like useSearchContentUrlSync, and resumes
  // against the background URL the overlay closes back to.
  const isSearchOverlay = resolveSearchOverlayBackground(location) !== null;

  // Keep a router-snapshot fallback for non-browser tests. Browser store→URL
  // sync reads `window.location.*` directly so close/open updates merge with
  // the live URL, not a React-render snapshot that may still contain a stale
  // `?thread=`.
  useEffect(() => {
    locationRef.current = { pathname: location.pathname, search: location.search };
  }, [location.pathname, location.search]);

  // URL → Store: keep thread/profile stores consistent with URL params.
  // Runs on mount AND on in-session URL changes so that clicking a permalink
  // to a different thread (which calls navigate() and only changes the query
  // string) reopens the panel to the new target instead of staying on the
  // previously opened thread.
  useEffect(() => {
    // React can still flush an older URL→store effect after a fast close has
    // already replaced the live URL. Ignore those stale snapshots so a removed
    // ?thread= param cannot reopen the just-closed panel.
    if (isSearchOverlay) return;
    if (!isCurrentRightPanelSearchSnapshot(location.search)) return;
    syncRightPanelStoresFromSearch(location.search);
  }, [location.pathname, location.search, isSearchOverlay]);

  // Store → URL: update query params when panel state changes.
  // Panels stack: both ?thread= and ?profile= can coexist. Adding a panel
  // pushes a new history entry; close / swap / in-place updates replace.
  const syncUrl = useCallback((
    mode: "auto" | "replace" = "auto",
    options: { resetAgentTabForProfileReopen?: boolean } = {},
  ) => {
      // Sync locationRef synchronously after navigate(). React-router's
      // navigate() calls history.pushState under the hood, which updates
      // window.history synchronously, but the useEffect at line 413 only
      // refreshes locationRef AFTER React re-renders. Without this manual
      // sync, a Zustand subscriber that fires a second syncUrl() in the
      // same tick (e.g. an openThread() that sets multiple fields, or an
      // openThread+openProfile combo) reads the stale locationRef and
      // pushes the SAME URL again, producing duplicate history entries —
      // which is why browser back needed 2–3 clicks to escape a thread
      // opened from /threads or a channel view. Reported in
      // `#proj-uiux:c8711d2a` msg=b61ca24b (2026-05-01, @stdrc).
      // Stryker disable next-line ObjectLiteral: MainLayout only forwards router state; rightPanelUrlSyncContract covers the URL sync behavior.
      syncRightPanelUrlFromStores({
        mode,
        navigate,
        fallback: locationRef.current,
        options,
        // Stryker disable next-line BlockStatement: this adapter keeps the fallback ref in sync after navigate; covered by rightPanelUrlSyncContract.
        updateFallback: (next) => {
          locationRef.current = next;
        },
      });
  }, [navigate]);

  useEffect(() => {
    if (isSearchOverlay) return;
    const unsubThread = subscribeRightPanelThreadAnchor(() => {
      // The URL derives only from the parent anchor. Thread fetch completion,
      // summaries, unread counts, and reply previews can arrive while a
      // browser POP is waiting for React Router to commit; letting those
      // unrelated updates call syncUrl would reattach the stale ?thread=.
      syncUrl("auto");
    });
    const unsubProfile = useProfileStore.subscribe((state, prev) => {
      const resetAgentTabForProfileReopen =
        state.openedAt !== prev.openedAt
        && state.profileType === "agent"
        && state.profileType === prev.profileType
        && state.profileId === prev.profileId
        && !!state.profileId
        && state.defaultAgentTabIntent === "ordered-first";
      syncUrl("auto", { resetAgentTabForProfileReopen });
      if (state.defaultAgentTabIntent) {
        useProfileStore.getState().clearDefaultAgentTabIntent();
      }
    });
    const unsubLegacyTask = useLegacyTaskPanelStore.subscribe((state, prev) => {
      if (state.task === prev.task) return;
      syncUrl("auto");
    });
    return () => { unsubThread(); unsubProfile(); unsubLegacyTask(); };
  }, [syncUrl, isSearchOverlay]);

  // Re-add panel params after react-router navigation changes the pathname
  useEffect(() => {
    if (isSearchOverlay) return;
    syncUrl("replace");
  }, [location.pathname, syncUrl, isSearchOverlay]);
}

// Two-way URL sync for the content master/detail (task #311 stdrc msg=b61ab472).
// `?open=<kind>:<id>` <-> searchContentStore.slot. The same slot store + URL
// param back BOTH the /search master/detail AND the /inbox (Activity) one
// (stdrc #proj-activity:171042a3 2026-06-23: "Activity 的展示方式应该跟搜索
// 结果页面一致 … 点进去后的交互行为也和搜索结果点进去的行为类似"). Scoped to
// those two routes: outside them we ignore inbound URLs AND auto-clear any open
// slot, so navigating away closes the slot without leaving residue. Because the
// slot is shared, switching between /search and /inbox is also a route change —
// the new route's URL carries no `?open=` on a fresh entry, so the URL→Store
// branch clears the prior route's slot rather than letting it bleed across.
function useSearchContentUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const serverSlug = useServerStore((s) => s.current?.slug ?? null);
  // Search-overlay mode: the URL is /search (the overlay's own query) but the
  // background — which may itself be an Activity/Search WITH a picked col-3 slot —
  // must be left exactly as it was. So this whole sync is ISOLATED while overlaying
  // (both effects early-return): we must not read the overlay's ?open=/?msg=, clear
  // the background's slot, or write the overlay URL. Only fully leaving the overlay
  // resumes the sync.
  const isSearchOverlay = resolveSearchOverlayBackground(location) !== null;
  const onContentRoute =
    !!serverSlug
    && (location.pathname === `/s/${serverSlug}/search`
        || location.pathname.startsWith(`/s/${serverSlug}/search/`)
        || location.pathname === `/s/${serverSlug}/activity`
        || location.pathname.startsWith(`/s/${serverSlug}/activity/`));

  // URL → Store. Clears the slot when leaving the content routes or when ?open
  // is removed.
  useEffect(() => {
    if (isSearchOverlay) return;
    if (!onContentRoute) {
      if (useSearchContentStore.getState().slot) {
        useSearchContentStore.getState().close();
      }
      return;
    }
    const params = new URLSearchParams(location.search);
    const openParam = params.get("open");
    const msgParam = params.get("msg");
    const parsed = parseSearchOpenParam(openParam);
    const current = useSearchContentStore.getState().slot;
    if (!parsed) {
      if (current) useSearchContentStore.getState().close();
      return;
    }
    const nextMessageId = (parsed.kind === "channel" || parsed.kind === "dm" || parsed.kind === "thread")
      ? (msgParam ?? undefined)
      : undefined;
    if (
      !current
      || current.kind !== parsed.kind
      || current.id !== parsed.id
      || current.messageId !== nextMessageId
    ) {
      useSearchContentStore.getState().open({ ...parsed, messageId: nextMessageId });
    }
  }, [location.pathname, location.search, onContentRoute, isSearchOverlay]);

  // Store → URL. Only writes when on a content route; off-route the URL→Store
  // branch above is authoritative.
  //
  // Reads the URL via `window.location.*` (not the closure'd `location.*`) so a
  // navigate() from another concurrently-firing store subscriber in the same
  // tick is preserved. Concretely: clicking a thread search hit calls
  // `closeThread()` → `openThread()` (which writes `?thread=parentCh:parentMsg`
  // via useRightPanelUrlSync) → `openSearchContent()` (this subscriber). With a
  // closure'd snapshot we'd rebuild params from the pre-click URL and clobber
  // the freshly written `?thread=`; the URL→Store branch then sees no
  // `?thread=` and calls `closeThread()`, leaving ThreadPanel with
  // `parentMessageId === null` — which renders blank for one click and is
  // why task #330's "first-click col-3 blank" repro'd on thread hits.
  useEffect(() => {
    if (isSearchOverlay || !onContentRoute) return;
    return useSearchContentStore.subscribe((state, prev) => {
      if (state.slot === prev.slot) return;
      const params = new URLSearchParams(window.location.search);
      if (!state.slot) {
        params.delete("open");
        params.delete("msg");
      } else {
        params.set("open", formatSearchOpenParam(state.slot));
        if (
          (state.slot.kind === "channel"
            || state.slot.kind === "dm"
            || state.slot.kind === "thread")
          && state.slot.messageId
        ) {
          params.set("msg", state.slot.messageId);
        } else {
          params.delete("msg");
        }
      }
      const search = params.toString();
      navigate(
        { pathname: window.location.pathname, search: search ? `?${search}` : "" },
        { replace: true },
      );
    });
  }, [onContentRoute, navigate, isSearchOverlay]);
}


export default function MainLayout() {
  // Shared model-label catalog (task #700): the shell owns the load trigger
  // (server changes while the app is up); rows and panels only subscribe, so
  // every surface switches to the reported names together.
  useEffect(() => watchModelLabelCatalog(), []);
  const { formatMessage } = useIntl();
  const { resolvedMode } = useAppTheme();
  useEmbedParamsKeeper();
  useRightPanelUrlSync();
  useSearchContentUrlSync();
  useRailLegacyRedirect();
  useTabRouteMemory();

  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const channels = useChannelStore((s) => s.channels);
  const dmChannels = useChannelStore((s) => s.dmChannels);
  const channelsLoading = useChannelStore((s) => s.loading);
  const setMessageStoreCurrentUserId = useMessageStore((s) => s.setCurrentUserId);
  const showAddMachine = useMachineStore((s) => s.showAddMachine);
  const setShowAddMachine = useMachineStore((s) => s.setShowAddMachine);
  const showCreateAgent = useAgentStore((s) => s.showCreateAgent);
  const createAgentOnboarding = useAgentStore((s) => s.createAgentOnboarding);
  const setShowCreateAgent = useAgentStore((s) => s.setShowCreateAgent);
  const navigate = useNavigate();
  const location = useLocation();
  // Desktop ⌘K search overlay (background-location modal route): when the topbar
  // Search / ⌘K navigates to /search it carries the current location as
  // `backgroundLocation`. While set, the whole layout below renders for that
  // BACKGROUND location (the channel stays frozen behind) and the search floats in
  // a SearchOverlay on top. Web never sets backgroundLocation, so every branch
  // gated on it is dead there and behaviour is byte-for-byte unchanged.
  // Desktop invariant (task #96): /search is ALWAYS the overlay — entries that
  // carry no backgroundLocation (rail, "search this channel", deep links,
  // history traversal) get one synthesized from searchFrom / the last
  // non-search location / server home instead of rendering the full page.
  const backgroundLocation = resolveSearchOverlayBackground(location);
  // The content column the web search overlay sits at the top of (SearchOverlay).
  const contentColumnRef = useRef<HTMLDivElement | null>(null);
  usePageViewTracking(location.pathname);
  useEffect(() => {
    rememberNonSearchLocation({ pathname: location.pathname, search: location.search });
  }, [location.pathname, location.search]);
  // Pushes the current user id into the external messageStore — write-to-
  // external-store sync, not derived local state. FP for no-derived-state-effect.
  // oxlint-disable-next-line react-doctor/no-derived-state-effect
  useEffect(() => {
    setMessageStoreCurrentUserId(currentUserId);
  }, [currentUserId, setMessageStoreCurrentUserId]);

  // Detect mobile vs desktop (matches Tailwind's md: breakpoint at 768px)
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [isLg, setIsLg] = useState(() => window.matchMedia(LG_VIEWPORT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(LG_VIEWPORT_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Desktop shell: the native menu's "Settings…" (⌘,) asks the renderer to open
  // settings. Only present in the Electron shell; Web/PWA never subscribes.
  useEffect(() => {
    const onOpenSettings = (window as {
      raftDesktop?: { onOpenSettings?: (cb: () => void) => () => void };
    }).raftDesktop?.onOpenSettings;
    if (!onOpenSettings) return;
    return onOpenSettings(() => {
      const slug = useServerStore.getState().current?.slug;
      if (slug) navigate(`/s/${slug}/settings`);
    });
  }, [navigate]);

  // Search master/detail responsive col-2 width per stdrc #proj-uiux:c2313b1d
  // msg=1351abcf (3c, 2026-05-26): at ≥1024 use the search-specific wider
  // panel (480 default, 360-720 range) for high-info-density result rows; at
  // 768-1023 collapse to chat-sidebar-shape (240 default, 180-320 range) so
  // col 3 picked-entity isn't squeezed to ~232px at 768. Two persisted widths
  // never conflict.
  // Resizable sidebar (desktop only)
  // Chat sidebar is a navigation rail, not a content pane. Keep the
  // resizable max compact so persisted wide values do not create an empty
  // right gutter around short labels and badges.
  const {
    width: sidebarWidth,
    handleResizeStart: handleSidebarResizeStart,
    handleResizeMove: handleSidebarResizeMove,
    handleResizeEnd: handleSidebarResizeEnd,
  } = useResizablePanel({ storageKey: "slock:sidebarWidth", ...SIDEBAR_PANEL_BOUNDS });

  // Search master/detail col-2 (MessageSearchPage when slot is open) — much
  // wider than the Sidebar rail because it hosts search input + filter row
  // + results, and per stdrc msg=b61ab472 should feel roughly half-width.
  // Persisted separately so resizing in search mode doesn't affect chat.
  const {
    width: searchPanelWidth,
    handleResizeStart: handleSearchPanelResizeStart,
    handleResizeMove: handleSearchPanelResizeMove,
    handleResizeEnd: handleSearchPanelResizeEnd,
  } = useResizablePanel({ storageKey: "slock:searchPanelWidth", min: 400, max: 720, defaultWidth: 560 });

  // Search master/detail col-2 compact width — used when col 4 thread overlay
  // is open so col 2 + col 3 + col 4 all fit at 1280-1366 viewports without
  // squeezing col 3. Persisted independently from searchPanelWidth so user can
  // resize each mode separately (stdrc #proj-uiux:c2313b1d msg=0ed291ab
  // 2026-05-28). 240 felt too narrow (msg=6fa799a7); default 320 keeps
  // search-result rows readable while leaving col 3 ~580px at 1366.
  const {
    width: searchPanelCompactWidth,
    handleResizeStart: handleSearchPanelCompactResizeStart,
    handleResizeMove: handleSearchPanelCompactResizeMove,
    handleResizeEnd: handleSearchPanelCompactResizeEnd,
  } = useResizablePanel({
    storageKey: "slock:searchPanelCompactWidth",
    ...MASTER_DETAIL_COMPACT_PANEL_BOUNDS,
  });

  const serverSlug = useServerStore((s) => s.current?.slug);
  const currentServerId = useServerStore((s) => s.current?.id);
  const announcementGateState = useOnboardingAnnouncementGateStore((state) => (
    currentServerId ? state.byServerId[currentServerId] ?? "pending" : "pending"
  ));
  const sawOnboardingThisSession = useOnboardingAnnouncementGateStore((state) => (
    currentServerId ? state.sawOnboardingServerIds.includes(currentServerId) : false
  ));
  const threadRefHandoff = useMemo(
    () => serverSlug ? parseThreadRefHandoff(serverSlug, location.search) : null,
    [location.search, serverSlug],
  );
  const consumedThreadRefHandoffsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!threadRefHandoff || !serverSlug || channelsLoading) return;
    const serverEpoch = useServerStore.getState().serverEpoch;
    void executeThreadRefHandoffOnce({
      consumedHandoffs: consumedThreadRefHandoffsRef.current,
      intent: threadRefHandoff,
      serverSlug,
      serverEpoch,
      channels: [...channels, ...dmChannels],
      consume: () => navigate(
        {
          pathname: location.pathname,
          search: consumeThreadRefHandoffSearch(location.search),
        },
        { replace: true },
      ),
      resolve: (parentChannel) => resolveThreadTargetByShortId({
        serverSlug,
        parentChannelId: parentChannel.id,
        shortId: threadRefHandoff.shortId,
        summaries: useThreadStore.getState().summaries,
        followedThreads: useThreadStore.getState().followedThreads,
        loadContext: async (channelId, targetShortId) => {
          const { data } = await api.get(`/messages/context/${targetShortId}`, {
            params: { channelId },
          });
          return data;
        },
      }),
      getAuthority: () => {
        const activeServer = useServerStore.getState();
        return { serverSlug: activeServer.current?.slug, serverEpoch: activeServer.serverEpoch };
      },
      onFailure: () => {
        toast.error(formatMessage({ id: "message.messageItem.threadUnavailable" }));
        navigate(`/s/${serverSlug}`, { replace: true });
      },
      onOpen: (target, parentChannel) => {
        void useThreadStore.getState().openThread(target);
        navigate(
          buildThreadRoutePath(target, parentChannel.type === "dm" ? "dm" : "channel"),
          { replace: true },
        );
      },
    });
  }, [channelsLoading, formatMessage, location.pathname, location.search, navigate, serverSlug, threadRefHandoff, channels, dmChannels]);

  useClearLiveAgentActivityOnServerChange(currentServerId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      blurFocusedControlForScreenshotShortcut(event);
      if (isGlobalSearchShortcut(event)) {
        event.preventDefault();
        if (!serverSlug) return;
        const searchPath = `/s/${serverSlug}/search`;
        const outcome = routeGlobalSearchShortcut({
          pathname: location.pathname,
          searchPath,
          focusMountedSearch: () => document.dispatchEvent(new Event(SEARCH_FOCUS_REQUEST_EVENT)),
          navigateToSearch: () => navigate(`/s/${serverSlug}/search`, {
            state: {
              searchFrom: `${location.pathname}${location.search}`,
              // Float the search over the current view (⌘K overlay) wherever the
              // overlay is on (desktop shell, desktop-width web); phones keep the
              // full-page /search. A minimal {pathname,search} avoids nesting the
              // location.state chain.
              ...(isSearchOverlayEnabled()
                ? { backgroundLocation: { pathname: location.pathname, search: location.search } }
                : {}),
            },
          }),
        });
        trackNavEntrySelected("search", "keyboard_shortcut", outcome === "focused");
        return;
      }
    };
    // keydown-global-exempt: cmdk search and system screenshot focus cleanup
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [location.pathname, location.search, navigate, serverSlug]);

  // One-time hash migration: redirect old hash URLs to new paths. Runs when the
  // server slug resolves or changes, not on every navigation.
  const migrateLegacyHashUrl = useEffectEvent((slug: string) => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    // Clear the hash
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const base = `/s/${slug}`;
    if (hash === "settings") {
      navigate(`${base}/settings`, { replace: true });
      return;
    }
    const [type, id] = hash.split("/");
    if (id && ["channel", "dm", "agent", "machine", "human", "member"].includes(type)) {
      navigate(`${base}/${type}/${id}`, { replace: true });
    }
  });
  useEffect(() => {
    if (serverSlug) migrateLegacyHashUrl(serverSlug);
  }, [serverSlug]);

  useMainLayoutRealtimeBridge(mainLayoutRealtimeBridgeDriver);

  // In search-overlay mode the URL is /search but the layout must render the
  // BACKGROUND channel behind the overlay, so all route checks below key off the
  // background location's path. Without an overlay this is exactly location.pathname.
  const path = (backgroundLocation ?? location).pathname;
  const pathBase = serverSlug ? `/s/${serverSlug}` : "";

  // Show sidebar inline as main content on mobile when the URL is one of
  // the per-rail-mode master pages — chat root, members root, or settings
  // root. Detail URLs (/channel/<id>, /agent/<id>, /settings/account, etc.)
  // instead show the main panel and hide the sidebar. /computers renders a
  // dedicated MobileComputersPanel on mobile (stdrc msg 2a500cb7 2026-05-01)
  // and /tasks has no sidebar at all (handled separately below).
  const isDefaultRoute = path === pathBase || path === `${pathBase}/`;
  const isMembersRoot = path === `${pathBase}/members` || path === `${pathBase}/members/`;
  const isSettingsRoot = path === `${pathBase}/settings` || path === `${pathBase}/settings/`;
  const isMobileMasterRoute = isDefaultRoute || isMembersRoot || isSettingsRoot;
  const mobileShowSidebarInline = !isDesktop && isMobileMasterRoute;

  // Tasks rail mode is single-page: TasksPanel owns its own filtering UI
  // and there is no master/detail navigation inside Tasks, so we skip the
  // Sidebar entirely and let the panel take the full width next to LeftRail.
  // Search rail mode (task #311 stdrc #proj-uiux:c2313b1d 2026-05-25) starts
  // single-page (full-width MessageSearchPage next to LeftRail). Once the
  // user picks a result and `searchContentStore.slot` opens, we flip into a
  // 3-column master/detail (LeftRail | MessageSearchPage | picked-entity)
  // by reusing the Sidebar slot to host MessageSearchPage and rendering the
  // picked entity in the routes container via SearchContentRoute.
  const isTasksRoute = path === `${pathBase}/tasks` || path.startsWith(`${pathBase}/tasks/`);
  const isUsageRoute = path === `${pathBase}/usage` || path.startsWith(`${pathBase}/usage/`);
  const isSearchRoute = path === `${pathBase}/search` || path.startsWith(`${pathBase}/search/`);
  // Inbox (Activity) is the second content master/detail route. It reuses the
  // exact same slot store, URL sync, column assembly, widths, and resize
  // handlers as /search — only col-2's content differs (ThreadsInbox vs
  // MessageSearchPage). stdrc #proj-activity:171042a3 2026-06-23.
  // /activity always gets the search-style master/detail (the rail-vs-sidebar
  // placement A/B was dropped 2026-06-30 — rail is the default).
  const isActivityRoute = path === `${pathBase}/activity` || path.startsWith(`${pathBase}/activity/`);
  const isInboxRoute = isActivityRoute;
  const isContentRoute = isSearchRoute || isInboxRoute;
  const searchSlotOpen = useSearchContentStore((s) => !!s.slot);
  const searchSlotKind = useSearchContentStore((s) => s.slot?.kind ?? null);
  const currentConversationId = useMessageStore((s) => s.currentChannelId);
  const threadParentConversationId = useThreadStore((s) => s.openParentChannelId);
  const threadMaximized = useUIStore((s) => s.threadMaximized);
  const threadParentMessageIdForLayout = useThreadStore((s) => s.openParentMessageId);
  const threadOpenForLayout = !!threadParentMessageIdForLayout;
  const profileOpenForLayout = useProfileStore((s) => !!s.profileId);
  // Desktop only: when the slot is open we want a real 3-col layout. Mobile
  // keeps the single-page surface — the picked entity uses the same
  // mobile-detail-route mechanism as a normal channel push (the slot's
  // kind→route fallback is reserved for desktop in this iteration; mobile path
  // is tracked as 311c follow-up).
  const searchMasterDetail = isContentRoute && searchSlotOpen && isDesktop;
  const masterDetailShellClassName = searchMasterDetail
    ? "flex flex-col border-r border-line-seam"
    : "";
  // When a content route has three visible work panes, col 2 swaps from
  // searchPanelWidth (wide master) to searchPanelCompactWidth (independent
  // persisted compact width) so col 3 is not squeezed by col-2 + right-panel
  // stacking (stdrc msg=ea3dd8b3 + msg=6fa799a7 + msg=0ed291ab 2026-05-28).
  // Thread overlay compacting only applies when col 3 is not already a thread;
  // profile overlay compacting applies even when col 3 is a thread, because
  // Activity/Search can show List | Thread | Profile.
  const contentRouteThreadOverlayOpen =
    searchMasterDetail && threadOpenForLayout && !!searchSlotKind && searchSlotKind !== "thread";
  const contentRouteProfileOverlayOpen = searchMasterDetail && profileOpenForLayout;
  const searchColTwoCompact = contentRouteThreadOverlayOpen || contentRouteProfileOverlayOpen;
  const hideSidebar = isTasksRoute || isUsageRoute || (isContentRoute && !searchMasterDetail);
  const isMobileTabRoot = mobileShowSidebarInline || (!isDesktop && isTasksRoute);
  // iOS-standalone chrome buckets (Raft Design System › NavBar): a tab root's
  // top bar is the frame (yellow in light, #0d0d0b in dark), a pushed detail's
  // header is paper. The shell wrapper paints the same surface above the
  // safe-area inset and `meta[theme-color]` follows it.
  const mobileDetailChrome = !isDesktop && !isMobileTabRoot;
  const browserChromeColor = mobileDetailChrome
    ? (resolvedMode === "dark" ? RAFT_DARK_PAPER_CHROME_COLOR : RAFT_LIGHT_PAPER_CHROME_COLOR)
    : (resolvedMode === "dark" ? RAFT_DARK_THEME_CHROME_COLOR : RAFT_LIGHT_THEME_CHROME_COLOR);
  const shellBackgroundColor = isDesktop ? undefined : mobileDetailChrome ? "var(--layer-canvas)" : "var(--layer-frame)";
  const shellStyle = useMemo(
    () => ({ paddingTop: "env(safe-area-inset-top, 0px)", backgroundColor: shellBackgroundColor }),
    [shellBackgroundColor],
  );
  const closeAddMachine = useCallback(() => setShowAddMachine(false), [setShowAddMachine]);
  const closeCreateAgent = useCallback(() => setShowCreateAgent(false), [setShowCreateAgent]);
  const closeSearchOverlay = useCallback(() => {
    if (backgroundLocation) navigate(overlayCloseTarget(backgroundLocation));
  }, [backgroundLocation, navigate]);

  useLayoutEffect(() => {
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) return;
    themeColor.content = browserChromeColor;
  }, [browserChromeColor]);

  // The top bar (workspace switcher + search) spans the window at desktop
  // width. The desktop shell draws its own title bar, and the host-shell embed
  // owns its chrome, so neither gets a second one. A shell that instead hands
  // its chrome to this bar (topBarHostContext.ts) gets it at any width: the
  // row is then the window's title bar and drag region.
  const topBarHosted = useTopBarHost() !== null;
  const showTopBar = shouldShowTopBar({
    hosted: topBarHosted,
    desktopWidth: isDesktop,
    hostShell: isHostShell(),
    electronShell: isElectronDesktopShell(),
  });

  return (
    <AppShellRoot
      // iOS standalone first-principles contract:
      // - browsers/PWA manifests default to theme yellow when route-level chrome
      //   cannot be applied reliably
      // - mobile detail routes still update theme-color and this wrapper to match
      //   their white top surface
      className="min-h-0 flex-1 flex-col font-display"
      // iOS standalone: the wrapper above the safe-area inset paints the
      // route's chrome colour itself, so the status-bar strip matches
      // `meta[theme-color]` (task #638, ios-standalone-chrome spec).
      style={shellStyle}
    >
      {/* System notifications live in the Notification Center popup, hung off the LeftRail
          (desktop) and the Chat-tab navbar (mobile). The previous global
          top banner stack covered itself when multiple conditions fired at
          once; collecting them into a notification-center popover (per
          stdrc 2026-05-02 #proj-uiux:f87f6eb9 task #94) makes the full
          list visible without stealing layout height. */}
      <PwaInstallPrompt />

      {showTopBar ? <ShellTopBar /> : null}

      <div className="flex min-h-0 flex-1">
        {/* Left rail — desktop only. Hosts server switcher (top), sidebar tab
            icons (Chat/Members), and Settings (bottom). On mobile the
            equivalent surfaces live in the in-Sidebar server header and the
            bottom MobileTabBar. */}
        <AppShellRailSlot>
          <LeftRail
            hidden={mobileShowSidebarInline}
            topBar={showTopBar}
          />
        </AppShellRailSlot>

        {/* Sidebar container:
            - Mobile root: relative, full width, inline as main content (the "Chat tab")
            - Mobile detail: hidden (no drawer on mobile — detail views cover everything)
            - Desktop: always relative inline at resizable width
            - Tasks rail mode: hidden (TasksPanel takes the full main area). */}
        {!hideSidebar && <AppShellSidebarSlot
          className={
            mobileShowSidebarInline
              ? "relative z-auto flex min-w-0 flex-1"
              : "hidden md:relative md:flex md:z-auto"
          }
        >
          <div
            // stdrc 2026-05-02 #proj-uiux:95e25b5b ec1523d9: invert
            // sidebar/main relationship — sidebar uses warm cream
            // (`bg-palette-cream`), main panel uses bright white. After
            // research-driven iterations through paper/yellow/cool-gray
            // candidates, the cleanest hierarchy is the inversion:
            // LeftRail (yellow) → Sidebar (cream) → Main (white).
            //
            // Search master/detail (task #311): in this mode the slot host is
            // MessageSearchPage itself, not Sidebar. We keep cream as the
            // background so it lines up with the rest of the col-2 surface,
            // but MessageSearchPage paints its own bg-white over it.
            // Sidebar paints its own right divider; in master/detail it's
            // gone (replaced by MessageSearchPage), so add it on the
            // wrapper instead — stdrc msg=76b75151: "当打开 channel 的时候,
            // 和搜索结果之间应该也要有竖线".
            // searchMasterDetail's flex flex-col: the col-2 wrapper is the
            // container for MessageSearchPage, whose root is `flex min-h-0
            // flex-1 flex-col` — flex-1 only constrains height when the
            // parent is a flex column. Without it the search results list
            // grew past the viewport and the page lost its scroll
            // (stdrc #proj-uiux:c2313b1d msg=86b31b78 2026-05-28). Sidebar
            // uses h-full on its own root so adding flex flex-col to the
            // wrapper doesn't change its layout — but we still scope it to
            // master-detail to keep the non-search wrapper byte-identical.
            className={`relative h-full min-w-0 ${mobileShowSidebarInline ? "flex-1 bg-layer-canvas" : "shrink-0 bg-layer-sidebar"} ${masterDetailShellClassName}`}
            style={
              mobileShowSidebarInline
                ? undefined
                : {
                    width: searchMasterDetail
                      ? resolveMasterDetailPanelWidth({
                          isLargeViewport: isLg,
                          isCompactLayout: searchColTwoCompact,
                          wideWidth: searchPanelWidth,
                          compactWidth: searchPanelCompactWidth,
                        })
                      : sidebarWidth,
                  }
            }
          >
            {searchMasterDetail ? (
              // Col 2 master list: the Activity list on /inbox, the search
              // results on /search — same master/detail slot drives col 3.
              isInboxRoute ? (
                <Suspense fallback={<PanelFallback />}><ThreadsInbox /></Suspense>
              ) : (
                <MessageSearchPage />
              )
            ) : (
              <Sidebar
                mobileInline={mobileShowSidebarInline}
                hideTitle={showTopBar}
              />
            )}
            {/* Resize handle (desktop only). Search master/detail at lg+
                resizes the search-specific width; at md (768-1023) it
                resizes the chat-sidebar-shape width that's currently shown
                (per (3c) responsive policy above). Non-search uses
                sidebarWidth as before. Two persisted widths never bleed
                across (slock:searchPanelWidth vs slock:sidebarWidth). */}
              <div
                className="hidden md:block absolute right-0 top-0 bottom-0 w-2 -mr-1 z-10 cursor-col-resize touch-none select-none"
                onPointerDown={
                  searchMasterDetail
                    ? (isLg
                        ? (searchColTwoCompact ? handleSearchPanelCompactResizeStart : handleSearchPanelResizeStart)
                        : handleSearchPanelCompactResizeStart)
                    : handleSidebarResizeStart
                }
                onPointerMove={
                  searchMasterDetail
                    ? (isLg
                        ? (searchColTwoCompact ? handleSearchPanelCompactResizeMove : handleSearchPanelResizeMove)
                        : handleSearchPanelCompactResizeMove)
                    : handleSidebarResizeMove
                }
                onPointerUp={
                  searchMasterDetail
                    ? (isLg
                        ? (searchColTwoCompact ? handleSearchPanelCompactResizeEnd : handleSearchPanelResizeEnd)
                        : handleSearchPanelCompactResizeEnd)
                    : handleSidebarResizeEnd
                }
                onPointerCancel={
                  searchMasterDetail
                    ? (isLg
                        ? (searchColTwoCompact ? handleSearchPanelCompactResizeEnd : handleSearchPanelResizeEnd)
                        : handleSearchPanelCompactResizeEnd)
                    : handleSidebarResizeEnd
                }
              />
          </div>
        </AppShellSidebarSlot>}

        {/* Main content — hidden on mobile root views (sidebar is the content),
            visible on mobile detail views and always on desktop.
            stdrc 2026-05-02 #proj-uiux:95e25b5b ec1523d9: bg-white on
            desktop so the whole main column reads as bright white,
            inverted with sidebar's warm cream. Mobile keeps the
            inherited cream so sidebar↔main aren't visually separated
            on small screens where they aren't side-by-side. */}
        <AppShellMainSlot
          overlay
          className={`relative ${mobileShowSidebarInline ? "hidden" : "flex"}`}
        >
          <div
            ref={contentColumnRef}
            className="thread-layout-container flex min-h-0 min-w-0 flex-1"
            data-testid="thread-layout-container"
            data-thread-maximized={isThreadMaximized(threadMaximized, threadParentMessageIdForLayout, threadParentConversationId, currentConversationId, profileOpenForLayout) ? "true" : "false"}
          >
            {/* overflow-clip, not overflow-hidden: a hidden box is still a
                scroll container, so focusing anything that pokes past it
                (scrollIntoView, an autofocused field) slid the whole page
                sideways. A clipped box cannot scroll at all. */}
            <div
              className="thread-main-column flex min-h-0 min-w-0 flex-1 flex-col overflow-clip"
              data-testid="thread-main-column"
            >
              <Routes location={backgroundLocation ?? location}>
                <Route path="channel/:channelId" element={<ChannelRoute />} />
                <Route path="dm/:dmId" element={<DmRoute />} />
                <Route path="agent/:agentId" element={<AgentRoute />} />
                <Route path="computer/:machineId" element={<MachineRoute />} />
                {/* Legacy /machine/:id — kept so external links and bookmarks
                    still work; redirected to /computer/:id by RailNavCompat. */}
                <Route path="machine/:machineId" element={<MachineRoute />} />
                <Route path="human/:userId" element={<HumanRoute />} />
                <Route path="members/graph" element={<MemberGraphRoute />} />
                <Route path="members" element={<EmptyRoute />} />
                <Route path="computers" element={<ComputersRoute />} />
                <Route path="search" element={<SearchContentRoute />} />
                <Route path="raftbench" element={<Suspense fallback={<PanelFallback />}><RaftBenchPage /></Suspense>} />
                <Route path="settings/:tab?/*" element={<SettingsRoute />} />
                <Route path="activity" element={<InboxContentRoute />} />
                {/* Legacy /inbox + /threads → /activity (stdrc renamed the route
                    #proj-activity:171042a3 2026-06-23). Keep redirects so old
                    links/bookmarks resolve. */}
                <Route path="inbox" element={<LegacyThreadsRedirect />} />
                <Route path="threads" element={<LegacyThreadsRedirect />} />
                <Route path="tasks" element={<TasksRoute />} />
                <Route path="usage" element={<UsagePage />} />
                <Route path="saved" element={<SavedRoute />} />
                <Route path="release-notes" element={<ReleaseNotesRoute />} />
                {/* Legacy /workspace from the removed Workspace grid layout. */}
                <Route path="workspace" element={<LegacyWorkspaceGridRedirect />} />
                <Route path="*" element={<DefaultRoute />} />
              </Routes>
            </div>
            <RightPanel />
          </div>

        </AppShellMainSlot>
      </div>

      <MobileTabBar />
      {currentServerId && serverSlug ? (
        <ServerSetupProjectionGate
          serverId={currentServerId}
          serverSlug={serverSlug}
        />
      ) : null}
      {showAddMachine && (
        <AddMachineDialog onClose={closeAddMachine} />
      )}
      {showCreateAgent && (
        <CreateAgentDialog
          onboarding={createAgentOnboarding}
          onClose={closeCreateAgent}
        />
      )}
      <JointChannelLinkIntent />
      <AnnouncementModal suppressed={shouldSuppressAnnouncements(announcementGateState, sawOnboardingThisSession)} />
      {/* Desktop ⌘K search overlay: floats the real /search over the frozen
          background channel. Dismiss (Esc/backdrop) navigates back to it. A hit
          selection navigates away on its own (clearing backgroundLocation). */}
      {backgroundLocation ? (
        <SearchOverlay onClose={closeSearchOverlay} contentColumnRef={showTopBar ? null : contentColumnRef} />
      ) : null}
    </AppShellRoot>
  );
}

export const __testInternals = {
  ComputersRoute,
  RightPanel,
  AgentById,
  DefaultRoute,
  renderContentSlot,
  useRightPanelUrlSync,
  useSearchContentUrlSync,
};
