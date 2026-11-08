import { Badge, ContextMenuLabel, ContextMenuPopup, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PanelActions, PanelHeaderContent, PanelSectionHeader, PanelTitle, Popover, PopoverTrigger, SidebarHeader, SidebarHeaderTitle, SidebarItem, SidebarItemChannelIcon, SidebarItemContent, SidebarItemCount, SidebarItemCountSeparator, SidebarItemIcon, SidebarItemIndicator, SidebarItemMeta, SidebarItemMetaIcon, SidebarItemSubtitle, SidebarItemThreadCount, SidebarItemTitle, SidebarRoot, SidebarSectionControl, SidebarSectionCount, SidebarSectionDisclosure, SidebarSectionHeader as RaftSidebarSectionHeader, toast, DirectMessageIcon } from "@botiverse/raft-ui";
import Tooltip from "../ui/Tooltip";
import { createContext, useState, useEffect, useCallback, useContext, useLayoutEffect, useEffectEvent, useRef, useMemo, useSyncExternalStore, memo } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useIntl } from "react-intl";
import type { MessageId } from "../../i18n/messages";
import { Archive, ArrowRightLeft, Plus, Trash2, ChevronRight, ChevronDown, ChevronLeft, User, MessageSquare, Monitor, Bot, X, Pencil, Bookmark, FileText, BookOpenText, Network, Search, Pin, PinOff, Square, RotateCcw, Play, Bell, BellOff, AtSign, Building2, Activity, Languages, GitBranch, ChartNoAxesCombined, Type, CreditCard, Shield, Link2, BadgeInfo, Blocks, Check, FlaskConical, KeyRound, FolderInput, FolderPlus } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { isSidebarDndProbeEnabled, recordSidebarDndCollisionBranch, SidebarDndE2EProbe } from "../../utils/sidebarDndE2eProbe";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Transform } from "@dnd-kit/utilities";
import api from "../../api/client";
import { useChannelStore } from "../../store/channelStore";
import type { Channel } from "../../store/channelStore";
import { useAppearanceStore } from "../../store/appearanceStore";
import { canToggleActivityMute, matchesActivityMuteState, normalizeActivityMuteState } from "../../store/channelDomain";
import { selectAgentDisplayState, useAgentCurrentActivityState, useAgentStore } from "../../store/agentStore";
import type { Agent } from "../../store/agentStore";
import { useMachineStore } from "../../store/machineStore";
import type { Machine } from "../../store/machineStore";
import { orderSidebarMachineIds } from "./sidebarMachineOrder";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "../../store/authStore";
import { useServerStore } from "../../store/serverStore";
import { useUIStore } from "../../store/uiStore";
import { useMessageStore } from "../../store/messageStore";
import { useThreadStore } from "../../store/threadStore";
import { useInboxStore } from "../../store/inboxStore";
import { SERVER_NOTIFICATION_PREFS_UPDATED_EVENT } from "../../store/events/notificationPrefsEvents";
import { trackActivityOpen } from "../../analytics/activity";
import { trackNavEntrySelected } from "../../analytics/navigation";
import { useSavedStore } from "../../store/savedStore";
import { useProfileStore } from "../../store/profileStore";
import { useAppNavigate } from "../../hooks/useAppNavigate";
import { SidebarConversationFinder } from "./SidebarConversationFinder";
import { serverRouteAgentId } from "../../utils/browserDocumentTitle";
import { useRailMode } from "../../hooks/useSidebarTab";
import AttentionDot from "../ui/AttentionDot";
import ContextMenuDivider from "../ui/ContextMenuDivider";
import MenuItem from "../ui/MenuItem";
import StatusDot from "../ui/StatusDot";
import { SkeletonRow } from "../ui/Skeleton";
import AgentActivityDot from "../agent/AgentActivityDot";
import { useLongPress } from "../../hooks/useLongPress";
import { useComputerUpgradeReconnect } from "../../hooks/useComputerUpgradeReconnect";
import { useServerPermissions } from "../../hooks/useServerPermissions";
import CreateChannelDialog from "../channel/CreateChannelDialog";
import CreateJointChannelDialog from "../channel/CreateJointChannelDialog";
import ChannelPinMenuItem from "../channel/ChannelPinMenuItem";
import { ChannelKindIcon } from "../channel/channelKindIcon";
import { PublicPageGlobe } from "../server/PublicPageGlobe";
import InviteHumanDialog from "../member/InviteHumanDialog";
import CreateAgentDialog from "../agent/CreateAgentDialog";
import { trackAgentCreateOpened } from "../../analytics/journey";
import ResetAgentDialog from "../agent/ResetAgentDialog";
import ConfirmDialog from "../ConfirmDialog";
import { AgentArchiveDialog } from "../agentArchive/AgentArchiveDialog";
import AvatarSlot from "../ui/AvatarSlot";
import ServerSwitcherMenu from "../ui/ServerSwitcherMenu";
import DismissBackdrop from "../ui/DismissBackdrop";
import { getSidebarDmContextTarget } from "./sidebarDmContext";
import { buildAgentDmChannelByAgentId, resolveAgentDmProfileSource } from "./agentDmProfileSource";
import { placeSidebarContextMenu, placeSidebarContextSubmenu } from "./sidebarContextMenuPosition";
import { sortSidebarChannels, sortSidebarDms, sortSidebarPinnedItems, sidebarDmLabel } from "./sidebarSort";
import type { SidebarSortMode } from "./sidebarSort";
import {
  filterSidebarChannelsByMembership,
  isSidebarJointChannel,
  readSidebarJoinedChannelsOnly,
  shouldShowSidebarChannelEmptyState,
  writeSidebarJoinedChannelsOnly,
} from "./sidebarChannelVisibility";
import NotificationTrigger from "./NotificationTrigger";
import { WorkingNowSummary } from "./WorkingNowSummary";
import { getChannelUnreadIndicatorState, hasUnmutedUnread, shouldShowActivityMutedIcon } from "../../utils/channelUnreadIndicator";
import {
  getComputerRowDotStatus,
  getComputerRowDotTitleDescriptor,
  getComputerRowDotLight,
} from "../../utils/computerUpgradeIndicator";
import { machineDiskLowPresentation } from "../../utils/machineDiskPresentation";
import { getComputerAvailableVersion } from "../../utils/computerVersionFact";
import { isElectronDesktopShell } from "../../utils/desktopShell";
import HandoffDialog from "../handoff/HandoffDialog";
import { isHandoffAvailable } from "../handoff/handoffSessions";
import { getMachineRunLabelDescriptor } from "../../utils/machineRunLabel";
import { MachineRunLabel } from "../machine/MachineRunLabel";
import { hasOtherServerActivityUnread } from "../../utils/serverUnreadSummary";
import { formatActivityText } from "../../utils/activity";
import {
  centeredSidebarScrollTop,
  conversationFromPathname,
  implicitSidebarFocusRequest,
  isSidebarDisclosureRestoreState,
  nearestSidebarScrollTop,
  readSidebarChannelFocusRequest,
} from "./sidebarChannelFocus";
import type { SidebarChannelFocusRequest } from "./sidebarChannelFocus";
import { canOpenSettingsTab, settingsTabIdForRouteSlug } from "../settings/settingsNavigation";
import SidebarSectionDialog from "./SidebarSectionDialog";
import { SidebarSortMenu } from "./SidebarSortMenu";
import { SidebarReadToggleMenuItem } from "./SidebarReadToggleMenuItem";
import { SectionSortModeMenuItem } from "./SectionSortModeMenuItem";
import { MoveToSectionMenuItem } from "./MoveToSectionMenuItem";
import { MemberAgentRow } from "./MemberAgentRow";
import { MemberHumanRow } from "./MemberHumanRow";
import SettingsSidebarList from "../settings/SettingsSidebarList";
import type { SettingsSidebarGroup } from "../settings/SettingsSidebarList";
import {
  moveSidebarItemToCustomSection,
  moveSidebarItemToCustomSectionAtPosition,
  reorderSidebarSectionOrder,
  removeSidebarItemPlacement,
  sidebarSectionItemKey,
} from "../../store/sidebarSections";
import type { SidebarCustomSection, SidebarSectionItemKind, SidebarSectionPlacement } from "../../store/sidebarSections";
import {
  hasSidebarPinnedRef,
  removeSidebarPinnedRef,
  sidebarPinnedRefKey,
  upsertSidebarPinnedRef,
} from "../../utils/sidebarPinnedRefs";
import type {
  SidebarPinnedRef,
} from "../../utils/sidebarPinnedRefs";
import {
  readSidebarAgentMachineGroupCollapsed,
  readSidebarCollapsedSections,
  readSidebarCustomSectionCollapsed,
  writeSidebarAgentMachineGroupCollapsed,
  writeSidebarCollapsedSection,
  writeSidebarCustomSectionCollapsed,
} from "./sidebarCollapsedSections";
import type {
  SidebarCollapsedSection,
  SidebarCollapsedSections,
} from "./sidebarCollapsedSections";
import {
  getRuntimeDisplayName,
  isExternalAgentRuntime,
  PROVIDER_CONNECTIONS_FEATURE_FLAG_KEY,
  SERVER_LABS_UI_FEATURE_FLAG_KEY,
  SLACK_BRIDGE_FEATURE_FLAG_KEYS,
} from "@botiverse/raft-shared";
import { isSlackBridgeSurfaceEnabled } from "../settings/slackBridgeVisibility";
import { canUseRaftBench } from "../../raftbench/access";
import { RAFTBENCH_OVERVIEW_FLAG_KEY, THREAD_UNREAD_BADGE_FLAG_KEY, useServerFeatureFlag } from "../../store/serverFeatureFlags";
import { useParentThreadUnread } from "../../hooks/useParentThreadUnread";
import {
  findSidebarDndContainer,
  isPointerWithinSidebarDndBounds,
  isSidebarDndData,
  moveSidebarDndItem,
  nextSidebarDndReservedHeight,
  resolveSidebarDndRetainedContainer,
  replaceSidebarSubsetOrder,
  sidebarCustomContainerId,
  sidebarCustomSectionId,
  SIDEBAR_CHANNELS_CONTAINER_ID,
  SIDEBAR_DMS_CONTAINER_ID,
  SIDEBAR_JOINT_CHANNELS_CONTAINER_ID,
  SIDEBAR_PINNED_CONTAINER_ID,
} from "./sidebarDnd";
import { shouldHideEmptySidebarSection } from "./sidebarEmptySectionVisibility";
import type { SidebarDndContainerData, SidebarDndData, SidebarDndItemData, SidebarDndProjection } from "./sidebarDnd";

interface CtxMenu {
  x: number;
  y: number;
  type: "channel" | "agent" | "human" | "dm" | "member-human" | "member-agent";
  id: string;
}

interface SectionCtxMenu {
  x: number;
  y: number;
  section: SidebarSortSection | `custom:${string}`;
}

interface SidebarSurfaceCtxMenu {
  x: number;
  y: number;
}

// Stryker disable all: shared context-menu geometry and propagation shielding predate the Activity mute action and have separate position/interaction coverage.
function getSidebarContextMenuStyle(ctxMenu: Pick<CtxMenu, "x" | "y">) {
  return { left: ctxMenu.x, top: ctxMenu.y };
}

function stopSidebarContextMenuPropagation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}
// Stryker restore all

type PinnedDisplayItem =
  | { id: string; ref: SidebarPinnedRef; type: "channel"; channel: Channel; createdAt: string; lastMessageAt?: string | null; label: string }
  | { id: string; ref: SidebarPinnedRef; type: "dm"; dm: Channel; createdAt: string; lastMessageAt?: string | null; label: string }
  | { id: string; ref: SidebarPinnedRef; type: "agent"; agent: Agent; createdAt: string; lastMessageAt?: string | null; label: string };

const EMPTY_PINNED_REFS: SidebarPinnedRef[] = [];
const EMPTY_SIDEBAR_ITEM_IDS: string[] = [];

type CustomSectionDisplayItem =
  | { id: string; type: "channel"; channel: Channel; createdAt: string; lastMessageAt?: string | null; label: string; placementKind: "channel" }
  | { id: string; type: "dm"; dm: Channel; createdAt: string; lastMessageAt?: string | null; label: string; placementKind: "channel" }
  | { id: string; type: "agent"; agent: Agent; createdAt: string; lastMessageAt?: string | null; label: string; placementKind: "agent" };
type SidebarMovableItem = { kind: SidebarSectionItemKind; id: string };
type SidebarDndDisplayItem =
  | { type: "channel"; channel: Channel; label: string }
  | { type: "dm"; dm: Channel; label: string }
  | { type: "agent"; agent: Agent; label: string };
function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, idx) => value === b[idx]);
}

function reconcileOrderIds<T extends { id: string }>(
  items: T[],
  storedIds: string[],
  pinnedId?: string | null,
): string[] {
  const itemIds = new Set(items.map((item) => item.id));
  const next: string[] = [];

  if (pinnedId && itemIds.has(pinnedId)) next.push(pinnedId);

  for (const id of storedIds) {
    if (id === pinnedId) continue;
    if (itemIds.has(id) && !next.includes(id)) next.push(id);
  }

  for (const item of items) {
    if (item.id === pinnedId) continue;
    if (!next.includes(item.id)) next.push(item.id);
  }

  return next;
}

function orderByIds<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return orderedIds.map((id) => itemMap.get(id)).filter((item): item is T => !!item);
}

export const SIDEBAR_SORT_MODES: SidebarSortMode[] = ["manual", "recent", "az"];
// Sort-mode option labels are display copy — the map now holds the layout
// catalog id and the rendering call sites resolve it through formatMessage.
export const SIDEBAR_SORT_LABEL_ID: Record<SidebarSortMode, MessageId> = {
  manual: "layout.sidebar.sortManual",
  recent: "layout.sidebar.sortRecent",
  az: "layout.sidebar.sortAz",
};

export type SidebarSortSection = "pinned" | "jointChannels" | "channels" | "dms";
// Stryker disable all: accessible section labels are asserted by rendered DOM tests; mutating copy inside Sidebar does not exercise a separate domain seam.
const SIDEBAR_SORT_SECTION_LABEL_ID: Record<SidebarSortSection, MessageId> = {
  pinned: "layout.sidebar.pinned",
  jointChannels: "layout.sidebar.jointChannels",
  channels: "layout.sidebar.channels",
  dms: "layout.sidebar.directMessages",
};
const EMPTY_CUSTOM_SECTIONS: SidebarCustomSection[] = [];
const EMPTY_SECTION_PLACEMENTS: SidebarSectionPlacement[] = [];
const DEFAULT_SECTION_ORDER = ["system:pinned", "system:joint", "system:channels", "system:dms"];
// Stryker restore all
// Raft Design System › Sidebar `.rf-section`: the section heads are raft-ui's
// parts — SidebarSectionHeader (16px above, 6px below, on the rows' text edge),
// SidebarSectionDisclosure (a collapsible title: 13/18 700 ink-3 in sentence
// case, the shared focus ring), SidebarSectionCount (Space Mono 12/16 ink-3)
// and SidebarSectionControl (the small ghost icon button, pulled into the
// title row so it never grows it).
// Phone tab roots (`mobileInline`, < md only) keep the desktop rows but give
// them ≥44px tap targets and the ListRow title type (16/24 600; unread rows
// stay 700 on the name itself). 8.5px inside the 1.5px edge centres one 24px
// line in 44, so a wrapping (pinned, computer) row starts its first line
// where a fixed row's line sits.
const SIDEBAR_ROW_PHONE_CLASS = "max-md:h-auto max-md:min-h-11 max-md:py-[8.5px] max-md:text-body max-md:font-semibold";
// Phone Home's first entries (Search, Activity, Saved) are ListRow entries
// (`.rf-row--entry`): ≥44px, a 20px ink-3 icon, the name, a count on the right,
// no lines between them and never a yellow "you are here".
const SIDEBAR_ENTRY_ROW_CLASS = "h-auto min-h-11 gap-3 py-2.5 text-body font-semibold";
const SIDEBAR_ENTRY_ICON_CLASS = "shrink-0 text-foreground-hint";
// `.rf-ws--pill` on the phone Home bar: an ink tile (`sticker-ink`, die-cut edge
// in dark) with the workspace name in yellow 17/22 700, tilted -2°, 36 tall with
// a 44px hit area; pressing lays a light veil over the ink. Short windows keep
// the product's plain text + chevron.
const MOBILE_WORKSPACE_PILL_CLASS = [
  "relative inline-flex min-h-9 min-w-0 shrink items-center gap-2 rounded-control pr-2.5 pl-3",
  "bg-sticker-ink font-sans text-headline text-brand -rotate-2 shadow-[0_0_0_1.5px_var(--sticker-edge)]",
  "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
  "hover:bg-[linear-gradient(color-mix(in_oklch,var(--sticker-paper)_15%,transparent),color-mix(in_oklch,var(--sticker-paper)_15%,transparent))]",
  "active:bg-[linear-gradient(color-mix(in_oklch,var(--sticker-paper)_15%,transparent),color-mix(in_oklch,var(--sticker-paper)_15%,transparent))]",
  "outline-none focus-visible:shadow-focus",
  "[@media(max-height:600px)]:rotate-0 [@media(max-height:600px)]:bg-transparent [@media(max-height:600px)]:bg-none [@media(max-height:600px)]:px-0 [@media(max-height:600px)]:text-foreground-on-frame [@media(max-height:600px)]:shadow-none",
].join(" ");
type SidebarSectionDescriptionProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "muted" | "subtle" | "strong";
};

/**
 * Compact help and empty-state copy that belongs to a Sidebar section.
 *
 * Keep this separate from entity metadata (for example an agent description)
 * and from the full-panel EmptyState primitive. Section descriptions share one
 * typography contract while their callsites retain context-specific spacing.
 */
function SidebarSectionDescription({
  children,
  className = "",
  tone = "muted",
  ...props
}: SidebarSectionDescriptionProps) {
  return (
    <div
      {...props}
      data-sidebar-section-description=""
      className={`px-2 font-sans text-footnote ${tone === "strong" ? "text-foreground" : tone === "subtle" ? "text-foreground-hint" : "text-foreground-muted"} ${className}`}
    >
      {children}
    </div>
  );
}
// Stryker disable all: drag-id helpers are exercised through source contracts and manual/browser DnD; the command-runner mutation oracle cannot synthesize dnd-kit pointer flows.
function channelDragId(id: string): string {
  return `channel:${id}`;
}

function agentDragId(id: string): string {
  return `agent:${id}`;
}

function parseDragId(value: string): { kind: "channel" | "dm" | "agent"; id: string } | null {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return kind === "channel" || kind === "dm" || kind === "agent" ? { kind, id } : null;
}

export function isSidebarCollisionCandidate(
  activeId: string,
  candidateId: string,
  sectionOrder: string[],
): boolean {
  const activeIsSection = sectionOrder.includes(activeId);
  return activeIsSection
    ? sectionOrder.includes(candidateId)
    : !sectionOrder.includes(candidateId);
}

function pinnedRefForDmChannel(dm: Channel): SidebarPinnedRef | null {
  if (dm.peerType === "agent" && dm.peerId) return { kind: "agent", id: dm.peerId };
  if (dm.peerType === "user" && dm.peerId) return { kind: "human", id: dm.peerId };
  return null;
}

type SidebarDropIndicatorEdge = "before" | "after";

export function getSidebarDropIndicatorEdge(
  activeCenterY: number,
  targetCenterY: number,
): SidebarDropIndicatorEdge {
  return activeCenterY < targetCenterY ? "before" : "after";
}

interface SidebarProps {
  mobileInline?: boolean;
  /** The top bar is shown (task #753): drop the panel title, as the desktop app does. */
  hideTitle?: boolean;
}

function SortableSidebarItem({
  id,
  containerId,
  children,
}: {
  id: string;
  containerId: string;
  children: ReactNode;
}) {
  const data = useMemo<SidebarDndItemData>(
    () => ({ type: "item", itemId: id, containerId }),
    [containerId, id],
  );
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data });
  const style = {
    transform: CSS.Transform.toString(getSidebarDragItemTransform(transform, true)),
    transition,
    opacity: isDragging ? 0.12 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-sidebar-drag-item={id}
      className="relative cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

// Cross-container projection moves later drop zones without resizing them.
// Always permits measuring, but dnd-kit's resize observers do not invalidate
// those unchanged-size siblings. Remeasure after the projected DOM commits.
function SidebarDndProjectionMeasurements({ projection }: { projection: SidebarDndProjection | null }) {
  const { droppableContainers, measureDroppableContainers } = useDndContext();
  const measureProjection = useEffectEvent(() => {
    // Explicit IDs also include siblings when dnd-kit already has a partial
    // resize measurement queued (an empty all-IDs request would be merged away).
    measureDroppableContainers([...droppableContainers.keys()]);
  });
  useLayoutEffect(() => {
    if (projection) measureProjection();
  }, [projection]);
  return null;
}

function SidebarDndContainer({
  id,
  kind,
  manual,
  itemIds,
  children,
  empty,
}: {
  id: string;
  kind: SidebarDndContainerData["kind"];
  manual: boolean;
  itemIds: string[];
  children: ReactNode;
  empty?: boolean;
}) {
  const data = useMemo<SidebarDndContainerData>(
    () => ({ type: "container", containerId: id, kind, manual }),
    [id, kind, manual],
  );
  const { setNodeRef, isOver, active } = useDroppable({ id, data });
  const activeData = active?.data.current;
  const itemDragActive = isSidebarDndData(activeData) && activeData.type === "item";
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const reservedHeightRef = useRef<number | null>(null);
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    setNodeRef(node);
  }, [setNodeRef]);
  // Never let a drop zone shrink while an item drag is in flight (see
  // nextSidebarDndReservedHeight): projecting the row into/out of this
  // container must not move the pointer onto a different container. Runs after
  // every render, before dnd-kit's (parent) measuring effects read the rect.
  // Written straight to the node so reserving height never re-renders.
  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const next = nextSidebarDndReservedHeight(
      itemDragActive,
      reservedHeightRef.current,
      node.getBoundingClientRect().height,
    );
    if (next === reservedHeightRef.current) return;
    reservedHeightRef.current = next;
    node.style.minHeight = next === null ? "" : `${next}px`;
  });
  return (
    <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
      <div
        ref={setContainerRef}
        data-sidebar-dnd-container={id}
        className={`relative rounded-control ${empty ? "min-h-7" : ""} ${isOver ? "bg-fill-pressed" : ""}`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

interface SidebarSectionDragHandleContextValue {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
}

const SidebarSectionDragHandleContext = createContext<SidebarSectionDragHandleContextValue | null>(null);

function SortableSidebarSection({
  id,
  testId,
  order,
  children,
}: {
  id: string;
  testId: string;
  order: number;
  children: ReactNode;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(getSidebarSortableItemTransform(transform)),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
    order,
  };
  const dragHandle = useMemo(
    () => ({ attributes, listeners, setActivatorNodeRef }),
    [attributes, listeners, setActivatorNodeRef],
  );

  return (
    <SidebarSectionDragHandleContext.Provider value={dragHandle}>
      <div ref={setNodeRef} style={style} data-testid={testId}>
        {children}
      </div>
    </SidebarSectionDragHandleContext.Provider>
  );
}

function SidebarSectionHeader({ children, section, onOpenContextMenu }: {
  children: ReactNode;
  section: SectionCtxMenu["section"];
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>, section: SectionCtxMenu["section"]) => void;
}) {
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => onOpenContextMenu(event, section),
    [onOpenContextMenu, section],
  );
  return (
    <RaftSidebarSectionHeader onContextMenu={handleContextMenu}>
      {children}
    </RaftSidebarSectionHeader>
  );
}

// The section's chevron: a bare 14px glyph (DS `.rf-section__title .rf-i`)
// that turns when the section is open.
function SidebarSectionChevronIcon({ open }: { open: boolean }) {
  return <ChevronRight size={14} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />;
}

// A collapsible section title (raft-ui SidebarSectionDisclosure) that is also
// the section's drag handle when the sections are sortable.
function SidebarSectionToggle<K extends string>({
  children,
  sectionKey,
  onToggleSection,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className"> & {
  sectionKey: K;
  onToggleSection: (sectionKey: K) => void;
}) {
  const sortable = useContext(SidebarSectionDragHandleContext);
  const handleClick = useCallback(() => onToggleSection(sectionKey), [onToggleSection, sectionKey]);
  return (
    <SidebarSectionDisclosure
      ref={sortable?.setActivatorNodeRef}
      render={<button type="button" />}
      className="cursor-default"
      {...sortable?.attributes}
      {...sortable?.listeners}
      {...props}
      onClick={handleClick}
    >
      {children}
    </SidebarSectionDisclosure>
  );
}

export function getSidebarSortableItemTransform(
  transform: Transform | null,
  allowHorizontalDrag = false,
): Transform | null {
  return getSidebarDragItemTransform(transform, allowHorizontalDrag);
}

export function getSidebarDragItemTransform(
  transform: Transform | null,
  allowHorizontalDrag = false,
): Transform | null {
  if (!transform || allowHorizontalDrag) return transform;
  return { ...transform, x: 0 };
}

/**
 * Loading placeholder for a Sidebar list (channels / DMs / computers / agents).
 * Shown WHILE the store is loading so the section reads as "loading" rather than
 * flashing the "No X yet" empty state and then the real rows (闪回 fix, task
 * #32). Uses the shared `<SkeletonRow>` (#31, Joy) with the sidebar row's own
 * padding + avatar box so each placeholder row is the SAME height as the loaded
 * row — content swaps in without the list jumping.
 */
const SIDEBAR_ROW_SKELETON_LINE_WIDTHS = ["w-3/5"];
// Empty drag-only sections can mount after activation; remeasure droppables
// deterministically instead of keeping pre-drag rects.
const SIDEBAR_DND_MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

function SidebarRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow
          key={i}
          className="my-px h-9 gap-2 px-2.5"
          avatar
          avatarClassName="size-[19px] rounded-sticker"
          lineWidths={SIDEBAR_ROW_SKELETON_LINE_WIDTHS}
        />
      ))}
    </div>
  );
}

/**
 * Computers-section row. Subscribes to its OWN machine slice so a
 * `machine:status` event re-renders only the affected row, not the whole
 * Sidebar. The parent must NOT subscribe to status-bearing machine objects —
 * it only carries stable identity (id + name). Same per-row isolation doctrine
 * as `<AgentActivityDot>` (#2412): dynamic per-entity state subscribes itself.
 */
/**
 * The "Saved" nav row's count badge: shows the true saved total, hidden when 0.
 * Exported as its own unit so the visibility/value behavior is testable (the
 * inline-conditional form left the `total > 0` guard uncovered — see
 * tests/savedNavCount.behavior.test.tsx).
 */
export function SavedNavCount({ total }: { total: number }) {
  const { formatMessage } = useIntl();
  if (total <= 0) return null;
  return (
    // `.rf-count`: a grey Space Mono number, not a badge — nothing is waiting.
    <SidebarItemMeta>
      {formatMessage({ id: "layout.sidebar.savedCount" }, { count: total })}
    </SidebarItemMeta>
  );
}

export function ComputerRow({
  machineId,
  selected,
  onSelect,
}: {
  machineId: string;
  selected: boolean;
  onSelect: (machineId: string, clickCount: number) => void;
}) {
  const machine = useMachineStore((s) => s.machines.find((m) => m.id === machineId));
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => onSelect(machineId, event.detail),
    [machineId, onSelect],
  );
  const latestComputerVersion = useMachineStore((s) => s.latestComputerVersion);
  if (!machine) return null;
  return (
    <ComputerRowBody
      machine={machine}
      latestComputerVersion={latestComputerVersion}
      selected={selected}
      onClick={handleClick}
    />
  );
}

function ComputerRowBody({
  machine,
  latestComputerVersion,
  selected,
  onClick: handleClick,
}: {
  machine: Machine;
  latestComputerVersion: string | null;
  selected: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { formatMessage } = useIntl();
  // Same answer as the detail page: offline while its upgrade restarts reads
  // "upgrading", not "computer offline".
  const { reconnecting: upgradeReconnecting } = useComputerUpgradeReconnect(machine);
  // "A newer version exists" is the web's own comparison, so the arrow also
  // shows when web upgrade is off or this version is too old for the web; the
  // detail page then gives the commands.
  const availableVersion = getComputerAvailableVersion(machine, latestComputerVersion);
  const diskLow = machineDiskLowPresentation(machine, formatMessage);
  const rowDotStatus = getComputerRowDotStatus(machine, availableVersion);
  const rowDotTitle = getComputerRowDotTitleDescriptor(
    rowDotStatus,
    machine.status,
    availableVersion,
  );
  // Raft Design System › Sidebar row for a computer (`rf-srow--two`): a bare
  // monitor glyph in the 19px identity box with its presence pixel on the
  // corner (the box must not clip — the pixel overhangs it), the name in row
  // type, and the machine-written facts (run label / version, upgrade, disk)
  // in Space Mono ink-3. Selected is the row's yellow sticker, drawn by
  // SidebarItem, and the icon, description and facts turn ink with it. Its
  // lines stack, so it is a wrapping row: it keeps the 8px between its edge
  // and its text that every one-line row has, grows instead of squeezing, and
  // centres the glyph on its first line.
  return (
    <SidebarItem
      wrap
      onClick={handleClick}
      data-slot="sidebar-item"
      active={selected}
      data-testid={`computer-list-item-${machine.id}`}
      className={`text-left ${SIDEBAR_ROW_PHONE_CLASS}`}
    >
      <SidebarItemIcon className="relative overflow-visible">
        <Monitor />
        <StatusDot
          className="absolute -right-1 -bottom-1"
          title={upgradeReconnecting
            ? formatMessage({ id: "machine.detail.upgradeV2.inProgress" })
            : formatMessage({ id: rowDotTitle.id }, rowDotTitle.values)}
          {...(upgradeReconnecting ? { tone: "bg-info" } : getComputerRowDotLight(rowDotStatus))}
          data-testid={`computer-status-dot-${machine.id}`}
        />
      </SidebarItemIcon>
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <span className="min-w-0 truncate">{machine.name}</span>
        </div>
        {machine.description && (
          <SidebarItemSubtitle className="mt-0.5">
            {machine.description}
          </SidebarItemSubtitle>
        )}
        <SidebarItemMeta className="mt-0.5 flex items-center gap-1.5">
          {upgradeReconnecting ? (
            <span className="truncate" data-testid={`computer-upgrade-reconnecting-${machine.id}`}>
              {formatMessage({ id: "machine.detail.upgradeV2.inProgress" })}
            </span>
          ) : (() => {
            const label = getMachineRunLabelDescriptor(machine);
            return (
              <span className={`truncate${label.isOffline ? " text-foreground-disabled group-data-active/sidebar-item:text-sticker-ink" : ""}`}>
                <MachineRunLabel machine={machine} />
              </span>
            );
          })()}
          {availableVersion && (
            <span className="shrink-0 font-bold text-warning-strong group-data-active/sidebar-item:text-sticker-ink">
              → v{availableVersion}
            </span>
          )}
          {diskLow && (
            <span
              className="shrink-0 font-bold text-warning-strong group-data-active/sidebar-item:text-sticker-ink"
              data-testid={`computer-disk-low-${machine.id}`}
              title={formatMessage({ id: "machine.diskLow.chipTitle" }, { free: diskLow.free, percent: diskLow.freePercent })}
            >
              {formatMessage({ id: "machine.diskLow.chip" })}
            </span>
          )}
          {/* Host slot (desktop task #124): the Electron shell marks the row of
              the machine it is running on ("This device") by portaling a small
              badge in here, so the self machine keeps EXACTLY this row anatomy
              instead of a substitute card. Empty (zero-width) on the web. */}
          <span
            data-testid={`computer-list-item-${machine.id}-meta-slot`}
            data-machine-id={machine.id}
            className="flex shrink-0 items-center empty:hidden"
          />
        </SidebarItemMeta>
      </div>
    </SidebarItem>
  );
}

// Returns `prev` untouched when every section is already open, so a route
// reveal never re-renders the Sidebar for nothing.
function expandSidebarSections(
  prev: SidebarCollapsedSections,
  sections: SidebarCollapsedSection[],
): SidebarCollapsedSections {
  if (!sections.some((section) => prev[section])) return prev;
  const next = { ...prev };
  for (const section of sections) next[section] = false;
  return next;
}

export type SidebarCtxKind = CtxMenu["type"];

// Touch long-press handlers spread onto a sidebar row button.
export type SidebarLongPress = {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
};

// Pure — at module scope so the memoized row leaves below can compute their own
// className from primitive `selected`/`menuOpen` props (no className prop, which
// would change identity every parent render and defeat memoization).
// The row chrome itself (36h, 15/20 500, hover/press overlay, focus ring, the
// yellow "you are here" sticker on `active`, and — with `wrap` — the pinned
// row that grows instead of truncating) is raft-ui SidebarItem's; these
// classes only add the pressed look while the row's context menu is open and
// the phone tap-target sizing.
// Stryker disable all: row class-token variants are visual-equivalent under the DOM oracle; wrap/unread behavior is pinned by focused Sidebar DOM tests.
export function sidebarItemClass(selected: boolean, menuOpen = false) {
  return `w-full ${!selected && menuOpen ? "bg-fill-pressed" : ""} ${SIDEBAR_ROW_PHONE_CLASS}`;
}
// Stryker restore all

export function SidebarAgentActivityBadge({ agentId }: { agentId: string }) {
  return <AgentActivityDot agentId={agentId} size="sm" data-sidebar-avatar-badge="true" />;
}

// The right-hand column: one badge, or the draft mark + the agent meta. Capped
// at 58% of the row (DS `rf-srow__meta--live`) so a long activity sentence
// never pushes the name out.
export const SIDEBAR_ROW_TRAILING_CLASS = "flex min-w-0 max-w-[58%] flex-initial items-center gap-1.5";
const SIDEBAR_AGENT_LIVE_META_CLASS = "min-w-0 truncate font-sans text-footnote font-normal text-foreground-muted group-data-active/sidebar-item:text-sticker-ink";

/**
 * The right side of an agent row (Raft Design System › Sidebar `rf-srow__meta`):
 * its runtime in Space Mono, or — while it works — what it is doing, in
 * Grotesk 13/18 ink-2 (`rf-srow__meta--live`). A leaf beside the avatar's
 * status pixel with the same narrow O(1) subscription (this one agent's
 * current activity), so an activity push re-renders only this span and an
 * unread change never reaches it. External agents keep their runtime label:
 * their presence is time-derived and the raw activity can outlive it.
 * Visual only (`aria-hidden`): the row's accessible name stays the agent's
 * name, and a sentence that changes every few seconds is not announced; the
 * avatar's status pixel already carries the state for assistive tech.
 */
export function SidebarAgentMeta({ agentId, runtime, external = false }: {
  agentId: string;
  runtime: string | null | undefined;
  external?: boolean;
}) {
  const { formatMessage } = useIntl();
  const activityState = useAgentCurrentActivityState(agentId);
  const activity = activityState?.activity;
  if (!external && activityState && (activity === "working" || activity === "thinking")) {
    const text = formatActivityText(formatMessage, activityState.activity, activityState.activityDetail, activityState.detailKind);
    return (
      <span className={SIDEBAR_AGENT_LIVE_META_CLASS} data-testid="sidebar-agent-live-meta" title={text} aria-hidden="true">
        {text}
      </span>
    );
  }
  if (!runtime) return null;
  return (
    <SidebarItemMeta className="whitespace-nowrap" data-testid="sidebar-agent-runtime" aria-hidden="true">
      {getRuntimeDisplayName(runtime)}
    </SidebarItemMeta>
  );
}

// Per-row leaf components. Two properties make them the fix for the
// channel-switch freeze:
//
//  1. They subscribe to ONLY their own unread/draft slice, so an incoming
//     `message:new` (which rebuilds the whole `unreadCounts` Record with a new
//     reference) re-renders just the one affected row, not the whole Sidebar.
//
//  2. They are `memo`'d with STABLE props — `channel`/`dm`/`agent` (structurally
//     shared by the stores), primitive `selected`/`menuOpen`, and parent
//     callbacks that are `useCallback`-stable. So when the parent DOES re-render
//     (every `message:new` rebuilds `channels`/`dmChannels` via
//     `touchChannelActivity`, bumping `lastMessageAt`), the 100s of unaffected
//     rows skip reconciliation instead of all re-rendering. Without stable props
//     memo is a no-op and the parent's re-render still walks every row — which is
//     exactly the ~80ms-of-children cost the profiler caught.
//
// The row builds its own event-handler closures from the stable callbacks; those
// inner closures are irrelevant to memo (memo compares the incoming props).
// Mirrors the <ComputerRow> machine-status isolation above. (broad-subscription sweep P0-B)
const capUnread = (count: number) => (count > 99 ? "99+" : count);

// `5 · [thread] 1`: the channel's own unread, then followed threads with new
// replies. With no thread unread this is exactly the old bare count.
function ChannelUnreadSegments({ unread, threads, threadLabel }: { unread: number; threads: number; threadLabel: string }) {
  if (threads <= 0) return <>{capUnread(unread)}</>;
  return (
    <>
      {unread > 0 && capUnread(unread)}
      {unread > 0 && <SidebarItemCountSeparator />}
      <SidebarItemThreadCount data-testid="sidebar-thread-unread" label={threadLabel}>{capUnread(threads)}</SidebarItemThreadCount>
    </>
  );
}

// Stryker disable all: ChannelRow changed lines here are visual class-token/default-prop variants; pinned/channel row identity, wrapping, dim/mute/unread behavior are covered by behavior tests.
const ChannelRow = memo(function ChannelRow({
  channel,
  selected,
  menuOpen,
  onSelect,
  onContextMenu,
  makeLongPress,
  serverPublicPageLive = false,
}: {
  channel: Channel;
  /** The current server's public page is live; with a Guest-visible channel, anyone can read it there. */
  serverPublicPageLive?: boolean;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (channel: Channel, clickCount: number) => void;
  onContextMenu: (e: React.MouseEvent, type: SidebarCtxKind, id: string) => void;
  makeLongPress: (type: SidebarCtxKind, id: string) => SidebarLongPress;
}) {
  const unread = useMessageStore((s) => s.unreadCounts[channel.id] || 0);
  const mentionMarked = useMessageStore((s) => s.mentionFlags[channel.id] === true);
  const hasNew = useMessageStore((s) => s.newFlags[channel.id] === true);
  const hasDraft = useMessageStore((s) => !!s.drafts[channel.id]);
  const threadUnreadEnabled = useServerFeatureFlag(THREAD_UNREAD_BADGE_FLAG_KEY).enabled;
  // Gated off (or not joined): no scan, exactly the pre-thread-unread row.
  const threadUnread = useParentThreadUnread(threadUnreadEnabled && channel.joined ? channel.id : null);
  // Display-language (react-intl) — the row owns its own marker copy so the
  // memoized leaf does not need a new prop from the parent.
  const { formatMessage } = useIntl();
  const dimmed = !selected && !channel.joined;
  const activityMuted = channel.activityMuted === true;
  const showMutedIcon = shouldShowActivityMutedIcon({ activityMuted, joined: channel.joined });
  const { showLoudUnreadBadge, showQuietUnreadCount, showQuietNewDot } = getChannelUnreadIndicatorState({
    unread,
    joined: channel.joined === true,
    showMutedIcon,
    hasNew,
    threadUnread: threadUnread.count,
  });
  const showMentionMarker = (mentionMarked || threadUnread.hasMention) && channel.joined;
  const unreadSegments = (
    <ChannelUnreadSegments
      unread={unread}
      threads={threadUnread.count}
      threadLabel={formatMessage({ id: "layout.sidebar.threadUnreadLabel" }, { count: threadUnread.count })}
    />
  );
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => onSelect(channel, event.detail),
    [channel, onSelect],
  );
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => onContextMenu(event, "channel", channel.id),
    [channel.id, onContextMenu],
  );
  // DS `rf-srow--away/--muted/--unread`: not joined = ink-3 name, muted = ink-2
  // name, unread = 700 name. raft-ui SidebarItem's `tone` draws them and keeps
  // the selected row's sticker ink. The three never meet: a loud unread badge
  // needs a joined, unmuted channel, and an unjoined row is dimmed only while
  // it is not selected.
  const tone = dimmed ? "away" : activityMuted ? "muted" : showLoudUnreadBadge ? "unread" : "default";
  return (
    <SidebarItem
      data-sidebar-channel-id={channel.id}
      data-slot="sidebar-item"
      active={selected}
      tone={tone}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...makeLongPress("channel", channel.id)}
      className={sidebarItemClass(selected, menuOpen)}
    >
      {/* `.rf-srow__icon`: a bare # (private: lock) in the 19px ink-3 box —
          never a coloured tile; the recipe turns it sticker-ink when selected. */}
      <SidebarItemChannelIcon>
        <ChannelKindIcon type={channel.type} size={16} onPublicPage={serverPublicPageLive && channel.guestVisible === true && !channel.archivedAt} />
      </SidebarItemChannelIcon>
      <SidebarItemContent className="items-center">
        {/* One line with an ellipsis, as every sidebar row (DS `rf-srow__name`).
            The row's tone sets its ink and weight (raft-ui SidebarItem `tone`). */}
        <SidebarItemTitle>{channel.name}</SidebarItemTitle>
        {channel.bridge?.provider === "slack" && (
          <Badge appearance="soft" variant="accent">
            {formatMessage({ id: "settings.slackBridge.providerBadge" })}
          </Badge>
        )}
        {showMutedIcon && (
          <Tooltip content={formatMessage({ id: "layout.sidebar.activityMutedTitle" })}>
          <SidebarItemMetaIcon
            className="shrink-0"
            data-slot="sidebar-item-meta-icon"
            data-testid="sidebar-activity-muted"
            aria-label={formatMessage({ id: "layout.sidebar.activityMutedAria" })}
          >
            <BellOff size={14} />
          </SidebarItemMetaIcon>
          </Tooltip>
        )}
      </SidebarItemContent>
      {/* @you is the yellow @ sticker (Badge `rf-badge--mention`), drawn by raft-ui. */}
      {showMentionMarker && (
        <Tooltip content={formatMessage({ id: "layout.sidebar.mentionedYouTitle" })}>
        <SidebarItemIndicator
          className="ml-1"
          data-slot="sidebar-item-indicator"
          role="img"
          data-testid="sidebar-mention-marker"
          aria-label={formatMessage({ id: "layout.sidebar.mentionedYouAria" })}
        >
          <AtSign />
        </SidebarItemIndicator>
        </Tooltip>
      )}
      {showLoudUnreadBadge ? (
        <SidebarItemCount className="ml-auto">
          {unreadSegments}
        </SidebarItemCount>
      ) : showQuietUnreadCount ? (
        // Muted / not-joined unread is a grey mono number (`.rf-count`), not the pink badge.
        <SidebarItemMeta className={`${showMutedIcon || showMentionMarker ? "ml-1" : ""}${threadUnread.count > 0 ? " inline-flex items-center" : ""}`}>
          {unreadSegments}
        </SidebarItemMeta>
      ) : showQuietNewDot ? (
        // A square pixel, never a round dot.
        <span
          className="ml-auto size-1.5 shrink-0 rounded-[2px] bg-foreground-hint"
          data-testid="sidebar-quiet-new-dot"
          aria-label={formatMessage({ id: "layout.sidebar.newMessagesAria" })}
        />
      ) : hasDraft && (
        <SidebarItemMetaIcon className={showMutedIcon ? "ml-1" : "ml-auto"}><Pencil /></SidebarItemMetaIcon>
      )}
    </SidebarItem>
  );
});
// Stryker restore all

/**
 * What every person or agent conversation row shows, in whichever section it
 * is listed (Direct Messages, Pinned, a custom section): the identity sticker,
 * then raft-ui's row content (the name on one line with an ellipsis, its
 * description after it, the name capped at 70% so the description still
 * shows), then the unread count, or the draft mark and the agent's meta. DmRow
 * and AgentDmRow differ only in what they subscribe to and draw through this,
 * so the same conversation cannot look different from one section to another.
 */
export function SidebarPeerRowBody({ avatar, displayName, description, unread, hasDraft, agentMeta }: {
  avatar: ReactNode;
  displayName: ReactNode;
  description: string | null | undefined;
  unread: number;
  hasDraft: boolean;
  agentMeta: ReactNode;
}) {
  return (
    <>
      {avatar}
      <SidebarItemContent>
        {/* Unread is the row's `tone="unread"` (raft-ui SidebarItem): a 700 name. */}
        <SidebarItemTitle>{displayName}</SidebarItemTitle>
        {description ? <SidebarItemSubtitle data-sidebar-row-description="">{description}</SidebarItemSubtitle> : null}
      </SidebarItemContent>
      <span className={SIDEBAR_ROW_TRAILING_CLASS}>
        {unread > 0 ? (
          <SidebarItemCount>
            {/* Stryker disable all: pre-existing unread cap is outside the workspace mutation corpus. */}
            {unread > 99 ? "99+" : unread}
            {/* Stryker restore all */}
          </SidebarItemCount>
        ) : (
          <>
            {hasDraft && <SidebarItemMetaIcon><Pencil /></SidebarItemMetaIcon>}
            {agentMeta}
          </>
        )}
      </span>
    </>
  );
}

// DM row (handles both human and agent peers). Used by the DM list and pinned
// human DMs. The context-menu target (`ctxType`/`ctxId`) can differ from the DM
// channel id (e.g. agent DMs target the agent), so it is passed explicitly.
const DmRow = memo(function DmRow({
  dm,
  isAgent,
  peerId,
  displayName,
  description,
  avatarUrl,
  selected,
  menuOpen,
  ctxType,
  ctxId,
  onSelect,
  onContextMenu,
  makeLongPress,
  agentRuntime = null,
  agentExternal = false,
}: {
  dm: Channel;
  isAgent: boolean;
  peerId: string | null;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  /** Agent DMs: the agent's runtime id for the row's mono meta (primitive, so memo holds). */
  agentRuntime?: string | null;
  agentExternal?: boolean;
  selected: boolean;
  menuOpen: boolean;
  ctxType: SidebarCtxKind;
  ctxId: string;
  onSelect: (dmId: string, clickCount: number) => void;
  onContextMenu: (e: React.MouseEvent, type: SidebarCtxKind, id: string) => void;
  makeLongPress: (type: SidebarCtxKind, id: string) => SidebarLongPress;
}) {
  // Stryker disable all: visual class-token mutations are equivalent in the DOM oracle; pinned DM profile/source, unread and pin-menu behavior are covered by behavior tests.
  const unread = useMessageStore((s) => s.unreadCounts[dm.id] || 0);
  // Stryker disable next-line all: pre-existing draft badge logic is outside the workspace mutation corpus.
  const hasDraft = useMessageStore((s) => !!s.drafts[dm.id]);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => onSelect(dm.id, event.detail),
    [dm.id, onSelect],
  );
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => onContextMenu(event, ctxType, ctxId),
    [ctxId, ctxType, onContextMenu],
  );
  return (
    <SidebarItem
      data-sidebar-channel-id={dm.id}
      data-slot="sidebar-item"
      active={selected}
      tone={unread > 0 ? "unread" : "default"}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...makeLongPress(ctxType, ctxId)}
      className={sidebarItemClass(selected, menuOpen)}
    >
      <SidebarPeerRowBody
        avatar={isAgent ? (
          <AvatarSlot
            context="sidebar-list"
            type="agent"
            agentAvatarUrl={avatarUrl}
            badge={peerId ? <SidebarAgentActivityBadge agentId={peerId} /> : undefined}
          />
        ) : (
          <AvatarSlot
            context="sidebar-list"
            type="human"
            humanAvatarUrl={dm.peerAvatarUrl ?? null}
            gravatarHash={dm.peerGravatarHash ?? null}
            humanPlaceholder={!dm.peerAvatarUrl && !dm.peerGravatarHash}
          />
        )}
        displayName={displayName}
        description={description}
        unread={unread}
        hasDraft={hasDraft}
        agentMeta={isAgent && peerId ? <SidebarAgentMeta agentId={peerId} runtime={agentRuntime} external={agentExternal} /> : null}
      />
    </SidebarItem>
  );
  // Stryker restore all
});

// Pinned agent DM row — keyed off the agent entity; subscribes to the agent's
// DM channel unread (if a DM channel exists yet).
export const AgentDmRow = memo(function AgentDmRow({
  agent,
  dmId,
  dm,
  selected,
  menuOpen,
  onSelect,
  onContextMenu,
  makeLongPress,
}: {
  agent: Agent;
  dmId: string | undefined;
  dm: Channel | undefined;
  selected: boolean;
  menuOpen: boolean;
  onSelect: (agent: Agent, dmId: string | undefined, clickCount: number) => void;
  onContextMenu: (e: React.MouseEvent, type: SidebarCtxKind, id: string) => void;
  makeLongPress: (type: SidebarCtxKind, id: string) => SidebarLongPress;
}) {
  // Stryker disable all: visual class-token mutations are equivalent in the DOM oracle; agent DM profile/source, unread and pin-menu behavior are covered by behavior tests.
  const unread = useMessageStore((s) => (dmId ? s.unreadCounts[dmId] || 0 : 0));
  const hasDraft = useMessageStore((s) => (dmId ? !!s.drafts[dmId] : false));
  const { displayName, description, avatarUrl } = resolveAgentDmProfileSource(agent, dm);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => onSelect(agent, dmId, event.detail),
    [agent, dmId, onSelect],
  );
  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => onContextMenu(event, "agent", agent.id),
    [agent.id, onContextMenu],
  );
  return (
    <SidebarItem
      // The ordinary DM row publishes this too. Without it, the same pinned
      // conversation would gain or lose its channel identity purely from whether
      // the agent is still in the client's agent list — `pinnedItems` picks this
      // renderer on a cache hit and the DM renderer on a miss. Omitted when the
      // agent has no DM channel yet, since there is no channel to name.
      data-sidebar-channel-id={dmId}
      data-slot="sidebar-item"
      active={selected}
      tone={unread > 0 ? "unread" : "default"}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      {...makeLongPress("agent", agent.id)}
      className={sidebarItemClass(selected, menuOpen)}
    >
      <SidebarPeerRowBody
        avatar={(
          <AvatarSlot
            context="sidebar-list"
            type="agent"
            agentAvatarUrl={avatarUrl}
            badge={<SidebarAgentActivityBadge agentId={agent.id} />}
          />
        )}
        displayName={displayName}
        description={description}
        unread={unread}
        hasDraft={hasDraft}
        agentMeta={<SidebarAgentMeta agentId={agent.id} runtime={agent.runtime} external={agent.external === true || isExternalAgentRuntime(agent.runtime)} />}
      />
    </SidebarItem>
  );
  // Stryker restore all
});

export default function Sidebar({ mobileInline, hideTitle = false }: SidebarProps) {
  // Display-language (react-intl) — layout namespace. The 8 settings sub-nav
  // destinations below reuse the `settings.tabs.*` ids (identical English
  // source + same destination) rather than forking the copy under `layout.*`;
  // everything else here resolves `layout.sidebar.*`.
  const { formatMessage } = useIntl();
  // `lastMessageAt` lives in the `channelActivity` slice (not the channel
  // objects), so `channels`/`dmChannels` are stable across inbound-message
  // activity bumps — plain subscriptions no longer re-render the whole Sidebar
  // per message (the channel-switch freeze / hover jank root).
  const channels = useChannelStore((s) => s.channels);
  const dmChannels = useChannelStore((s) => s.dmChannels);
  // Loading flag so the channels/DMs lists show a skeleton WHILE loading
  // instead of the "No X yet" empty state, which otherwise renders first and
  // then flashes to the real list once data arrives (闪回 fix, task #32).
  const channelsLoading = useChannelStore((s) => s.loading);
  // `channelActivity` drives recency sorting. Subscribe it LIVE only when a
  // recency sort is active; otherwise freeze the snapshot so an inbound-message
  // bump doesn't re-render the Sidebar. `recencyActiveRef` is set below once the
  // sort modes are known; the (stable) snapshot reads it at compare time (between
  // renders), so a one-render lag on a sort-mode toggle is harmless.
  const recencyActiveRef = useRef(false);
  const activitySnapRef = useRef<Record<string, string | null>>({});
  const getActivitySnap = useCallback(() => {
    if (recencyActiveRef.current) {
      activitySnapRef.current = useChannelStore.getState().channelActivity;
    }
    return activitySnapRef.current;
  }, []);
  const channelActivity = useSyncExternalStore(useChannelStore.subscribe, getActivitySnap);
  const deleteChannel = useChannelStore((s) => s.deleteChannel);
  const archiveChannel = useChannelStore((s) => s.archiveChannel);
  const openUserDM = useChannelStore((s) => s.openUserDM);
  const openDM = useChannelStore((s) => s.openDM);
  const allAgents = useAgentStore((s) => s.agents);
  const agents = useMemo(() => allAgents.filter((a) => !a.deletedAt), [allAgents]);
  // Loading flags so the agents / computers lists show a skeleton WHILE loading
  // instead of flashing "No agents/computers yet" then the real rows (闪回 fix).
  const agentsLoading = useAgentStore((s) => s.loading);
  const machinesLoading = useMachineStore((s) => s.loading);
  const startAgent = useAgentStore((s) => s.startAgent);
  const stopAgent = useAgentStore((s) => s.stopAgent);
  const setShowCreateAgent = useAgentStore((s) => s.setShowCreateAgent);
  // Parent subscribes ONLY stable machine identity (id → name), never the
  // status-bearing machine objects. `useShallow` short-circuits when the
  // id/name set is unchanged, so the high-frequency `machine:status` event
  // stream (cross-replica mirror / presence flaps) no longer re-renders the
  // whole Sidebar (× its ~140 rows). Per-machine status lives in <ComputerRow>.
  const machineNames = useMachineStore(
    useShallow((s) => Object.fromEntries(s.machines.map((m) => [m.id, m.name] as const))),
  );
  // Display order of the Computers rows: host-pinned → attached by me → rest
  // (sidebarMachineOrder.ts). Same subscription discipline: `useShallow` on the
  // id array, so only an id, its group or the pin changing re-renders.
  const sidebarMachineIds = useMachineStore(
    useShallow((s) => orderSidebarMachineIds(s.machines, s.pinnedMachineId)),
  );
  const setShowAddMachine = useMachineStore((s) => s.setShowAddMachine);
  const user = useAuthStore((s) => s.user);
  const server = useServerStore((s) => s.current);
  const serverPublicPageLive = server?.publicPageLive === true;
  const servers = useServerStore((s) => s.servers);
  const sidebarOrder = useServerStore((s) => s.sidebarOrder);
  const customSections = sidebarOrder.customSections ?? EMPTY_CUSTOM_SECTIONS;
  const sectionOrder = sidebarOrder.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const sectionPlacements = sidebarOrder.sectionPlacements ?? EMPTY_SECTION_PLACEMENTS;
  const updateSidebarOrder = useServerStore((s) => s.updateSidebarOrder);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  // NOTE: the parent intentionally does NOT subscribe to the whole
  // `unreadCounts` / `drafts` Records — those churn a new reference on every
  // inbound `message:new`, which previously re-rendered this entire (~2300-line,
  // hundreds-of-rows) component on every message and froze channel-switching in
  // large servers. Per-row unread/draft now lives in the <ChannelRow>/<DmRow>/
  // <AgentDmRow> leaves; the parent derives only narrowed aggregates below
  // (`unreadFlags` for collapsed-section dots, `closedDmUnreadIds` for the
  // closed-DM auto-reopen). Non-reactive one-off reads use getState().
  // Narrowed trigger for the eager cross-server unread-summary refetch below.
  // Subscribing the effect to the whole `unreadCounts` Record made it re-run
  // (and fire GET /servers/unread-summary) on EVERY inbound message, because
  // messageStore rebuilds the Record with a new reference per `message:new`.
  // The cross-server badge only cares whether *any* local unread exists, so we
  // collapse to a boolean — it flips on 0↔nonzero transitions, not per message.
  // (Mirrors the LeftRail/ChatPanel narrowing in PR #2590.)
  const hasLocalUnread = useMessageStore((s) =>
    Object.values(s.unreadCounts).some((count) => count > 0),
  );
  // Stryker disable next-line all: pre-existing inbox loading is outside the workspace mutation corpus.
  const loadInbox = useInboxStore((s) => s.loadInbox);
  // Subscribe to the server-provided total (not the loaded `saved` page) so the
  // badge reflects the true count, and so this always-mounted row doesn't
  // re-render on every saved-list page mutation — just on count change.
  const savedTotal = useSavedStore((s) => s.total);
  const navigate = useNavigate();
  const nav = useAppNavigate();
  const location = useLocation();
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const handledSidebarFocusLocationKeyRef = useRef<string | null>(null);
  const raftBenchEnabled = useServerFeatureFlag(RAFTBENCH_OVERVIEW_FLAG_KEY).enabled;
  const labsUiEnabled = useServerFeatureFlag(SERVER_LABS_UI_FEATURE_FLAG_KEY).enabled;
  const providerConnectionsEnabled = useServerFeatureFlag(PROVIDER_CONNECTIONS_FEATURE_FLAG_KEY).enabled;
  const slackBridgeGate = useServerFeatureFlag(SLACK_BRIDGE_FEATURE_FLAG_KEYS.master);
  const slackBridgeEnabled = isSlackBridgeSurfaceEnabled(slackBridgeGate);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateJointChannel, setShowCreateJointChannel] = useState(false);
  const [showCreateAgentMenu, setShowCreateAgentMenu] = useState(false);
  const [showCreateExternalAgent, setShowCreateExternalAgent] = useState(false);
  // Task #110: "Take over a local session" (desktop Handoff) has its own entry
  // in the Agents "+" menu and its own dialog; desktop shell + scanning bridge only.
  const [showHandoff, setShowHandoff] = useState(false);
  const [showInviteHuman, setShowInviteHuman] = useState(false);
  // Single source of truth: the store owns the cross-server unread summary and
  // coalesces concurrent loads, so this component no longer fetches it itself.
  const serverUnreadCounts = useServerStore((s) => s.serverUnreadCounts);
  const loadServerUnreadSummary = useServerStore((s) => s.loadServerUnreadSummary);
  const currentServerActivityCount = server?.id
    ? serverUnreadCounts[server.id]?.activityUnreadCount
    : undefined;
  // Activity is rendered only from the server's known authority. An absent
  // field is unknown and must not be replaced with the broader legacy count.
  const activityUnreadCount = currentServerActivityCount;
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);
  const moveToSectionTriggerRef = useRef<HTMLDivElement | null>(null);
  const [moveToSectionMenuOpen, setMoveToSectionMenuOpen] = useState(false);
  const [moveToSectionMenuPosition, setMoveToSectionMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [sidebarDndProjection, setSidebarDndProjection] = useState<SidebarDndProjection | null>(null);
  const [sidebarDndActiveId, setSidebarDndActiveId] = useState<string | null>(null);
  const [sidebarDndSourceContainerId, setSidebarDndSourceContainerId] = useState<string | null>(null);
  const sidebarDndSnapshotRef = useRef<SidebarDndProjection | null>(null);
  const sidebarDndProjectionRef = useRef<SidebarDndProjection | null>(null);
  const setMoveToSectionMenuNode = useCallback((menu: HTMLDivElement | null) => {
    const trigger = moveToSectionTriggerRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    setMoveToSectionMenuPosition(placeSidebarContextSubmenu({
      anchor: {
        left: triggerRect.left,
        right: triggerRect.right,
        top: triggerRect.top,
      },
      menuWidth: menuRect.width,
      menuHeight: menuRect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }));
  }, []);
  const [sectionCtxMenu, setSectionCtxMenu] = useState<SectionCtxMenu | null>(null);
  const sectionCtxMenuRef = useRef<HTMLDivElement | null>(null);
  const [sidebarSurfaceCtxMenu, setSidebarSurfaceCtxMenu] = useState<SidebarSurfaceCtxMenu | null>(null);
  const sidebarSurfaceCtxMenuRef = useRef<HTMLDivElement | null>(null);
  const [sectionDialog, setSectionDialog] = useState<
    | { mode: "create"; moveItem?: SidebarMovableItem }
    | { mode: "edit"; section: SidebarCustomSection }
    | null
  >(null);
  const [collapsedCustomSections, setCollapsedCustomSections] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(customSections.map((section) => [
      section.id,
      readSidebarCustomSectionCollapsed(user?.id, section.id),
    ]))
  ));
  const collapsedCustomSectionUserIdRef = useRef(user?.id);
  const customSectionIdsKey = customSections.map((section) => section.id).join("\u0000");
  const collapsedCustomSectionIdsKeyRef = useRef(customSectionIdsKey);
  useEffect(() => {
    if (
      collapsedCustomSectionUserIdRef.current === user?.id
      && collapsedCustomSectionIdsKeyRef.current === customSectionIdsKey
    ) return;
    collapsedCustomSectionUserIdRef.current = user?.id;
    collapsedCustomSectionIdsKeyRef.current = customSectionIdsKey;
    // oxlint-disable-next-line react-doctor/no-chain-state-updates -- disclosure state must reset when the authenticated user or server sections change.
    setCollapsedCustomSections(Object.fromEntries(customSections.map((section) => [
      section.id,
      readSidebarCustomSectionCollapsed(user?.id, section.id),
    ])));
  }, [customSectionIdsKey, customSections, user?.id]);
  // Members rail: per-machine disclosure for the AGENTS list groups, persisted
  // per user and stable machine id (mirrors the custom-section pattern above).
  const agentMachineGroupKeys = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const agent of agents) {
      const key = agent.machineId ?? "__no_machine__";
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return keys;
  }, [agents]);
  const agentMachineGroupIdsKey = agentMachineGroupKeys.join("\u0000");
  const [collapsedAgentMachineGroups, setCollapsedAgentMachineGroups] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(agentMachineGroupKeys.map((key) => [
      key,
      readSidebarAgentMachineGroupCollapsed(user?.id, key),
    ]))
  ));
  const collapsedAgentMachineGroupUserIdRef = useRef(user?.id);
  const collapsedAgentMachineGroupIdsKeyRef = useRef(agentMachineGroupIdsKey);
  useEffect(() => {
    if (
      collapsedAgentMachineGroupUserIdRef.current === user?.id
      && collapsedAgentMachineGroupIdsKeyRef.current === agentMachineGroupIdsKey
    ) return;
    collapsedAgentMachineGroupUserIdRef.current = user?.id;
    collapsedAgentMachineGroupIdsKeyRef.current = agentMachineGroupIdsKey;
    // oxlint-disable-next-line react-doctor/no-chain-state-updates -- disclosure state must reset when the authenticated user or machine grouping changes.
    setCollapsedAgentMachineGroups(Object.fromEntries(agentMachineGroupKeys.map((key) => [
      key,
      readSidebarAgentMachineGroupCollapsed(user?.id, key),
    ])));
  }, [agentMachineGroupIdsKey, agentMachineGroupKeys, user?.id]);
  const toggleAgentMachineGroup = (key: string) => {
    setCollapsedAgentMachineGroups((prev) => {
      const nextCollapsed = !(prev[key] === true);
      writeSidebarAgentMachineGroupCollapsed(user?.id, key, nextCollapsed);
      return { ...prev, [key]: nextCollapsed };
    });
  };
  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<SidebarCustomSection | null>(null);
  // iOS PWA (display:standalone) does not reliably suppress the synthetic
  // click after a long-press touchend, even with e.preventDefault(). That
  // phantom click would land on the context menu overlay or a menu button
  // and close the menu the instant the finger lifted. We absorb clicks with
  // an invisible full-screen shield for ~500ms after a long-press opens the
  // menu, then remove it so the user can interact normally.
  const [ctxMenuClickShielded, setCtxMenuClickShielded] = useState(false);
  const ctxMenuShieldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "channel" | "agent";
    id: string;
    name: string;
  } | null>(null);
  const [stopAgentConfirm, setStopAgentConfirm] = useState<{ id: string; name: string } | null>(null);
  const [resetAgentTarget, setResetAgentTarget] = useState<{ id: string; name: string } | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Stryker disable all: pre-existing deleted-agent confirmation cleanup is outside the workspace mutation corpus.
  useEffect(() => {
    if (deleteConfirm?.type !== "agent") return;
    // oxlint-disable-next-line react-doctor/no-event-handler -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
    if (allAgents.some((agent) => agent.id === deleteConfirm.id && agent.deletedAt)) {
      // oxlint-disable-next-line react-doctor/no-chain-state-updates -- YMNNE-family: pre-existing non-bug site grandfathered; rule now gates new code (see docs/frontend/render-cost-contract.md)
      setDeleteConfirm(null);
    }
  }, [allAgents, deleteConfirm]);
  // Stryker restore all

  // Stryker disable next-line all: pre-existing account menu state is outside the workspace mutation corpus.
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  // Stryker disable next-line all: pre-existing member subscription is covered by sidebar behavior tests.
  const members = useServerStore((s) => s.members);
  const membersLoadError = useServerStore((s) => s.membersLoadError);
  const { role: currentRole, capabilities } = useServerPermissions();
  const canManageServer = capabilities.editServerSettings;
  const canCreateChannel = capabilities.createChannels;
  const canCreateJointChannel = capabilities.federateChannels;
  const canCreateAgent = capabilities.createAgents;
  const canRegisterMachines = capabilities.registerMachines;
  const canInviteMembers = capabilities.inviteMembers;
  const canManageExternalAuth = capabilities.manageExternalAuth;
  const canViewBillingSettings = canOpenSettingsTab("billing", capabilities);
  const canViewAdministrationSettings = canOpenSettingsTab("administration", capabilities);
  const canViewApplicationsSettings = canOpenSettingsTab("integrations", capabilities, currentRole);
  const canViewMcpSettings = canOpenSettingsTab("mcp", capabilities, currentRole);
  // Stryker disable next-line all: pre-existing membership privacy is covered by server/sidebar tests.
  const hideHumansFromMembers = server?.role === "member" && server.hideHumansFromMembers;
  // The single source of truth for which left-column surface is active.
  // Both Sidebar and LeftRail derive from useRailMode(), which reads the
  // URL — so the rail's highlighted button and the sidebar's content stay
  // strictly in sync. On mobile the LeftRail is hidden; the 4-tab mobile
  // bar maps /computers back to the Settings tab (Computers is reachable
  // from the Settings sub-nav, not Members).
  const { railMode, selectRailMode } = useRailMode();
  const activeTab: "chat" | "members" = railMode === "members" ? "members" : "chat";
  const showSettingsRail = railMode === "settings";
  const showComputersRail = railMode === "computers";
  const showChatRail = activeTab === "chat";
  const railLabel = railMode === "settings" ? formatMessage({ id: "layout.sidebar.headerSettings" })
    : railMode === "tasks" ? formatMessage({ id: "layout.sidebar.headerTasks" })
    : railMode === "computers" ? formatMessage({ id: "layout.sidebar.headerComputers" })
    : railMode === "members" ? formatMessage({ id: "layout.sidebar.headerMembers" })
    : formatMessage({ id: "layout.sidebar.headerChat" });
  // Stryker restore all
  const selectSidebarTab = useCallback(
    (tab: "chat" | "members") => selectRailMode(tab),
    [selectRailMode],
  );

  const [collapsed, setCollapsed] = useState<SidebarCollapsedSections>(() => (
    readSidebarCollapsedSections(user?.id)
  ));
  const collapsedPreferenceUserIdRef = useRef(user?.id);
  useEffect(() => {
    if (collapsedPreferenceUserIdRef.current === user?.id) return;
    collapsedPreferenceUserIdRef.current = user?.id;
    setCollapsed(readSidebarCollapsedSections(user?.id));
  }, [user?.id]);
  const channelSortMode = sidebarOrder.channelSortMode;
  const jointChannelSortMode = sidebarOrder.jointChannelSortMode;
  const dmSortMode = sidebarOrder.dmSortMode;
  const pinnedSortMode = sidebarOrder.pinnedSortMode;
  // When any list sorts by recency, `lastMessageAt` order matters → the
  // channels/dmChannels subscriptions (above) must react to every bump. In the
  // default manual/az modes it does not, so those bumps are ignored.
  recencyActiveRef.current =
    channelSortMode === "recent" ||
    jointChannelSortMode === "recent" ||
    dmSortMode === "recent" ||
    pinnedSortMode === "recent";
  const [openSortMenu, setOpenSortMenu] = useState<SidebarSortSection | null>(null);
  // Stryker disable all: React persistence wiring is browser/DOM verified; storage and membership semantics are mutation-tested in sidebarChannelVisibility.
  const [joinedChannelsOnly, setJoinedChannelsOnly] = useState(() =>
    readSidebarJoinedChannelsOnly(server?.id),
  );
  // Global display preference (not per-server): drop sections that are currently
  // empty. Lives in appearanceStore so the Settings → Appearance toggle and this
  // section context menu stay in sync. Defaults ON in the desktop shell.
  const hideEmptySections = useAppearanceStore((s) => s.hideEmptySidebarSections);

  const updatePinnedSortMode = useCallback((mode: SidebarSortMode) => {
    void updateSidebarOrder({ pinnedSortMode: mode });
  }, [updateSidebarOrder]);

  const updateChannelSortMode = useCallback((mode: SidebarSortMode) => {
    void updateSidebarOrder({ channelSortMode: mode });
  }, [updateSidebarOrder]);

  const updateJointChannelSortMode = useCallback((mode: SidebarSortMode) => {
    void updateSidebarOrder({ jointChannelSortMode: mode });
  }, [updateSidebarOrder]);

  const updateDmSortMode = useCallback((mode: SidebarSortMode) => {
    void updateSidebarOrder({ dmSortMode: mode });
  }, [updateSidebarOrder]);

  const updateJoinedChannelsOnly = useCallback((joinedOnly: boolean) => {
    setJoinedChannelsOnly(joinedOnly);
    writeSidebarJoinedChannelsOnly(server?.id, joinedOnly);
  }, [server?.id]);

  const updateHideEmptySections = useAppearanceStore((s) => s.setHideEmptySidebarSections);

  // A section is dropped only once its contents have settled and it is genuinely
  // empty. Guards, in order: never mid-load (so it can't flash in on first
  // paint); never while this section is the source of an in-flight drag —
  // `count` comes from the LIVE drag projection, so dragging the last item out
  // would otherwise unmount the source mid-drag and strand the gesture. Other
  // hidden empty sections stay hidden unless a section opts into being a drag
  // target. The main Channels section is intentionally exempt — its empty state
  // carries the channel-discovery / onboarding hint.
  const isEmptySectionHidden = useCallback(
    (count: number, containerId?: string, revealWhileDragging?: boolean) =>
      shouldHideEmptySidebarSection({
        hideEmptySections,
        loading: channelsLoading,
        itemCount: count,
        dragActive: Boolean(sidebarDndActiveId),
        dragStartedInSection: containerId != null && containerId === sidebarDndSourceContainerId,
        revealWhileDragging,
      }),
    [hideEmptySections, channelsLoading, sidebarDndActiveId, sidebarDndSourceContainerId],
  );

  useEffect(() => {
    setJoinedChannelsOnly(readSidebarJoinedChannelsOnly(server?.id));
  }, [server?.id]);
  // Stryker restore all

  // Server-switch inbox reset. The first eligible run is skipped: boot is
  // covered by the rooms:joined authority load (or the offline fallback
  // armed in the realtime bootstrap); only actual server switches after that
  // must reset the inbox for the new server.
  const bootInboxArmedRef = useRef(false);
  useEffect(() => {
    if (!bootInboxArmedRef.current) {
      bootInboxArmedRef.current = true;
      return;
    }
    void loadInbox({ reset: true });
  }, [loadInbox, server?.id]);

  const focusFirstUnreadInboxItem = useCallback(() => {
    // Express the intent rather than computing the key synchronously here: at
    // dbl-click time `items` may not be loaded yet (fast mount, or a prod build
    // where this races ThreadsInbox's own load), and the old sync `find()` then
    // returned undefined → focus cleared → no highlight (preview-mode e2e flake
    // thread/sidebar-dblclick.spec.ts:25). ThreadsInbox resolves this to a
    // concrete focusedItemKey once items arrive, regardless of which load wins.
    useInboxStore.getState().setPendingFocusKind("first-unread");
    void useInboxStore.getState().loadInbox({ reset: true });
  }, []);

  // Closed DMs — server-synced via sidebarOrder for cross-device consistency
  const closedDmIds = useMemo(() => new Set(sidebarOrder.hiddenDmIds), [sidebarOrder.hiddenDmIds]);
  const closeDm = useCallback((dmId: string) => {
    const current = sidebarOrder.hiddenDmIds;
    if (current.includes(dmId)) return;
    void updateSidebarOrder({ hiddenDmIds: [...current, dmId] });
    // Navigate away if the closed DM is currently active
    const slug = useServerStore.getState().current?.slug;
    if (slug && location.pathname === `/s/${slug}/dm/${dmId}`) {
      navigate(`/s/${slug}`);
    }
  }, [sidebarOrder.hiddenDmIds, updateSidebarOrder, location.pathname, navigate]);
  const reopenDm = useCallback((dmId: string) => {
    const current = sidebarOrder.hiddenDmIds;
    if (!current.includes(dmId)) return;
    void updateSidebarOrder({ hiddenDmIds: current.filter((id) => id !== dmId) });
  }, [sidebarOrder.hiddenDmIds, updateSidebarOrder]);

  const [channelOrderIds, setChannelOrderIds] = useState<string[]>([]);
  const [dmOrderIds, setDmOrderIds] = useState<string[]>([]);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allChannelId = useMemo(() => channels.find((channel) => channel.name === "all")?.id ?? null, [channels]);

  useEffect(() => {
    const next = reconcileOrderIds(channels, sidebarOrder.channelOrder, allChannelId);
    setChannelOrderIds((prev) => arraysEqual(prev, next) ? prev : next);
  }, [sidebarOrder.channelOrder, channels, allChannelId]);

  useEffect(() => {
    const next = reconcileOrderIds(dmChannels, sidebarOrder.dmOrder);
    setDmOrderIds((prev) => arraysEqual(prev, next) ? prev : next);
  }, [sidebarOrder.dmOrder, dmChannels]);


  const toggleSection = useCallback((section: SidebarCollapsedSection) => {
    setCollapsed((prev) => {
      const nextValue = !prev[section];
      const next = { ...prev, [section]: nextValue };
      writeSidebarCollapsedSection(user?.id, section, nextValue);
      return next;
    });
  }, [user?.id]);

  const toggleCustomSection = useCallback((sectionId: string) => {
    setCollapsedCustomSections((current) => {
      const nextValue = !current[sectionId];
      writeSidebarCustomSectionCollapsed(user?.id, sectionId, nextValue);
      return { ...current, [sectionId]: nextValue };
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || servers.length === 0) return;

    // No mount fetch here: App owns the single boot entry for the summary;
    // this effect keeps only the interval + focus/visibility/prefs triggers.
    // The 2-minute catch-all sweep below bounds OTHER servers' badge staleness
    // (socket cannot tell us those; #8359) — live edges eager-refresh (#8294).
    const intervalId = window.setInterval(() => {
      loadServerUnreadSummary();
    }, 120_000);
    const handleFocus = () => {
      loadServerUnreadSummary();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadServerUnreadSummary();
      }
    };
    const handleNotificationPrefsUpdated = () => {
      loadServerUnreadSummary();
    };

    window.addEventListener("focus", handleFocus);
    // Stryker disable next-line StringLiteral: pre-existing browser visibility wiring is outside the notification-prefs behavior slice.
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(SERVER_NOTIFICATION_PREFS_UPDATED_EVENT, handleNotificationPrefsUpdated);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      // Stryker disable next-line StringLiteral: cleanup mirrors the pre-existing browser visibility listener above.
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(SERVER_NOTIFICATION_PREFS_UPDATED_EVENT, handleNotificationPrefsUpdated);
    };
    // Depend on servers.length, not the servers array identity: a store update
    // that merely re-hydrates the array used to tear this effect down and re-run
    // it, re-triggering the summary fetch (the extra "wave" per refresh).
  }, [user?.id, servers.length, loadServerUnreadSummary]);

  // Refresh server unread summary eagerly when unread counters change
  // (e.g. incoming message or mark-read), instead of waiting for polling.
  useEffect(() => {
    if (!user?.id || servers.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      loadServerUnreadSummary();
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [hasLocalUnread, user?.id, servers.length, loadServerUnreadSummary]);

  const hasOtherServerUnread = hasOtherServerActivityUnread(servers, server, serverUnreadCounts);

  const previousSidebarRouteRef = useRef({
    pathname: location.pathname,
    userId: user?.id,
  });

  // Reopening a hidden DM reads the latest sidebar order without making it a
  // trigger: the route reveal below must run only when the route changes.
  const reopenRouteDm = useEffectEvent((dmId: string) => reopenDm(dmId));

  // Auto-expand collapsed sections only for a navigation that happens while
  // the Sidebar is already mounted. On the first render, the route merely
  // describes the page being restored and must not override the user's saved
  // disclosure choices. Programmatic reveals stay transient: only an explicit
  // section-header click writes the preference.
  useEffect(() => {
    const path = location.pathname;
    const previousRoute = previousSidebarRouteRef.current;
    previousSidebarRouteRef.current = { pathname: path, userId: user?.id };
    if (
      path === previousRoute.pathname
      || user?.id !== previousRoute.userId
      || isSidebarDisclosureRestoreState(location.state)
    ) {
      return;
    }

    const channelMatch = path.match(/\/channel\/(.+)/);
    const dmMatch = path.match(/\/dm\/(.+)/);
    const agentMatch = path.match(/\/agent\/(.+)/);
    const machineMatch = path.match(/\/machine\/(.+)/);
    const humanMatch = path.match(/\/human\/(.+)/);

    if (channelMatch) {
      setCollapsed((prev) => expandSidebarSections(prev, ["channels"]));
    } else if (dmMatch) {
      // Expand DMs section (reuses agents collapsed state)
      setCollapsed((prev) => expandSidebarSections(prev, ["agents"]));
      // Reopen DM if it was closed (e.g. navigated via Message button)
      reopenRouteDm(dmMatch[1]);
    } else if (agentMatch) {
      // Expand agents in Tab 1 and in Tab 2
      setCollapsed((prev) => expandSidebarSections(prev, ["agents", "machinesAgents"]));
    } else if (machineMatch) {
      setCollapsed((prev) => expandSidebarSections(prev, ["machinesAgents"]));
    } else if (humanMatch) {
      setCollapsed((prev) => expandSidebarSections(prev, ["humans"]));
    }
  }, [location.pathname, location.state, user?.id]);

  // Close context menu on Escape. Outside-click is handled by the overlay
  // div in the portal (below) — using a document mousedown listener here
  // would race with iOS's synthetic mousedown after a long-press touchend,
  // closing the menu the instant it opens. The overlay pattern is the same
  // one MessageItem uses for its context menu.
  const clearCtxMenu = useCallback(() => setCtxMenu(null), []);
  const closeCtx = useCallback(() => {
    setCtxMenu(null);
    setMoveToSectionMenuOpen(false);
    setMoveToSectionMenuPosition(null);
  }, []);
  useEffect(() => {
    if (!ctxMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCtx();
    };
    // keydown-global-exempt: channel context-menu escape-close, anchored popover, focus stays on trigger
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ctxMenu, closeCtx]);

  // Stryker disable all: global Escape lifecycle is exercised by the Playwright proof; event-listener mutation is not stable in the focused DOM runner.
  const closeSectionCtx = useCallback(() => setSectionCtxMenu(null), []);
  useEffect(() => {
    if (!sectionCtxMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSectionCtx();
    };
    // keydown-global-exempt: section context-menu escape-close, anchored popover, focus stays on trigger
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sectionCtxMenu, closeSectionCtx]);

  const closeSidebarSurfaceCtx = useCallback(() => setSidebarSurfaceCtxMenu(null), []);
  useEffect(() => {
    if (!sidebarSurfaceCtxMenu) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSidebarSurfaceCtx();
    };
    // keydown-global-exempt: the open sidebar surface menu closes globally on Escape.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarSurfaceCtxMenu, closeSidebarSurfaceCtx]);

  // Stryker restore all

  // Close user menu on outside click or Escape
  useEffect(() => {
    if (!showUserMenu) return;
    const onMouseDown = () => setShowUserMenu(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowUserMenu(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    // keydown-global-exempt: user dropdown menu escape-close, focus stays on trigger
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showUserMenu]);

  const markUnreadSidebarItemRead = useCallback((channelId: string) => {
    const messageStore = useMessageStore.getState();
    if (!messageStore.unreadCounts[channelId]) return;

    messageStore.clearUnread(channelId);
    void messageStore.markRead(channelId).catch(() => {
      void messageStore.loadUnreadCounts();
    });
  }, []);

  // Ref tracking which item is being long-pressed (set on touchstart).
  const longPressTargetRef = useRef<{ type: CtxMenu["type"]; id: string } | null>(null);

  const openCtxMenuAt = useCallback((x: number, y: number, type: CtxMenu["type"], id: string) => {
    setCtxMenu({ x, y, type, id });
    // Shield against the phantom click that fires after the long-press
    // touchend on iOS PWA standalone mode. Without this, the synthetic
    // click lands on the overlay (or the first menu button, if the finger
    // happens to be over it) and closes the menu immediately.
    setCtxMenuClickShielded(true);
    if (ctxMenuShieldTimerRef.current) clearTimeout(ctxMenuShieldTimerRef.current);
    ctxMenuShieldTimerRef.current = setTimeout(() => {
      setCtxMenuClickShielded(false);
      ctxMenuShieldTimerRef.current = null;
    }, 500);
  }, []);

  // Long-press handler for touch devices. Memoized so useLongPress returns stable
  // method identities — which keeps `makeLongPressHandlers` and the `handleSelect*`
  // callbacks stable, which is what lets the memo'd row leaves skip re-render when
  // the parent re-renders (every message:new churns channels/dmChannels).
  // Stryker disable all: pre-existing long-press dispatch is outside the workspace mutation corpus.
  const onLongPress = useCallback((coords: { x: number; y: number }) => {
    if (longPressTargetRef.current) {
      openCtxMenuAt(coords.x, coords.y, longPressTargetRef.current.type, longPressTargetRef.current.id);
    }
  }, [openCtxMenuAt]);
  // Stryker restore all
  const channelLongPress = useLongPress(onLongPress);
  // useLongPress returns a NEW object literal each render but stable method refs;
  // destructure the stable members so downstream useCallbacks don't depend on the
  // unstable object identity.
  const longPressSuppressRef = channelLongPress.suppressClickRef;
  const { onTouchStart: lpTouchStart, onTouchEnd: lpTouchEnd, onTouchMove: lpTouchMove, onTouchCancel: lpTouchCancel } = channelLongPress;

  // Stryker disable all: pre-existing touch forwarding is outside the workspace mutation corpus.
  const makeLongPressHandlers = useCallback((type: CtxMenu["type"], id: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      longPressTargetRef.current = { type, id };
      lpTouchStart(e);
    },
    onTouchEnd: (e: React.TouchEvent) => lpTouchEnd(e),
    onTouchMove: (e: React.TouchEvent) => lpTouchMove(e),
    onTouchCancel: () => lpTouchCancel(),
  }), [lpTouchStart, lpTouchEnd, lpTouchMove, lpTouchCancel]);
  // Stryker restore all

  // Stryker disable all: route-specific host wiring is contract-pinned and browser-smoke verified.
  const handleSelectChannel = useCallback((channel: Channel, _clickCount = 1) => {
    if (longPressSuppressRef.current) return;
    markUnreadSidebarItemRead(channel.id);
    nav.toChannel(channel.id);
    setSidebarOpen(false);
  }, [longPressSuppressRef, markUnreadSidebarItemRead, nav, setSidebarOpen]);
  // Stryker restore all

  const openDmSurface = useCallback(
    (dmChannelId: string) => {
      markUnreadSidebarItemRead(dmChannelId);
      nav.toDm(dmChannelId);
      setSidebarOpen(false);
    },
    // Stryker disable next-line ArrayDeclaration: callback freshness is exercised by sidebar navigation DOM tests; replacing the dependency list is not observable in the focused mutation lifecycle.
    [markUnreadSidebarItemRead, nav, setSidebarOpen],
  );

  // Stryker disable all: route-specific host wiring is contract-pinned and browser-smoke verified.
  const handleSelectDm = useCallback((dmChannelId: string, _clickCount = 1) => {
    if (longPressSuppressRef.current) return;
    openDmSurface(dmChannelId);
  }, [longPressSuppressRef, openDmSurface]);
  // Stryker restore all

  // Stryker disable all: pre-existing singleton-panel cleanup is outside the workspace mutation corpus.
  const closeRightPanel = useCallback(() => {
    useProfileStore.getState().closeProfile();
    useThreadStore.getState().closeThread();
  }, []);
  // Stryker restore all

  const handleSelectAgent = useCallback((agentId: string, _clickCount = 1) => {
    // Stryker disable all: route dispatch is browser-smoke verified.
    if (longPressSuppressRef.current) return;
    nav.toAgent(agentId);
    closeRightPanel();
    setSidebarOpen(false);
  }, [closeRightPanel, longPressSuppressRef, nav, setSidebarOpen]);
  // Stryker restore all

  // Combined select for agent DM rows: open the existing DM if there is one,
  // otherwise navigate to the agent profile. Stable so <AgentDmRow> stays memo'd.
  // Stryker disable all: typed routing is covered by channel/agent browser smoke.
  const handleSelectAgentDm = useCallback((agent: Agent, dmId: string | undefined, clickCount = 1) => {
    if (dmId) handleSelectDm(dmId, clickCount);
    else handleSelectAgent(agent.id, clickCount);
  }, [handleSelectDm, handleSelectAgent]);
  // Stryker restore all

  const handleSelectMachine = useCallback((machineId: string, _clickCount = 1) => {
    // Stryker disable all: route dispatch is browser-smoke verified.
    if (longPressSuppressRef.current) return;
    nav.toComputer(machineId);
    closeRightPanel();
    setSidebarOpen(false);
  }, [closeRightPanel, longPressSuppressRef, nav, setSidebarOpen]);
  // Stryker restore all

  const handleSelectHuman = useCallback((userId: string, _clickCount = 1) => {
    // Stryker disable all: route dispatch is browser-smoke verified.
    if (longPressSuppressRef.current) return;
    nav.toHuman(userId);
    closeRightPanel();
    setSidebarOpen(false);
  }, [closeRightPanel, longPressSuppressRef, nav, setSidebarOpen]);
  // Stryker restore all

  const handleOpenHumanDm = useCallback(
    async (userId: string) => {
      closeRightPanel();
      selectSidebarTab("chat");
      const existingDm = dmChannels.find((dm) => dm.peerType === "user" && dm.peerId === userId);
      const dm = existingDm ?? await openUserDM(userId);
      openDmSurface(dm.id);
    },
    // Stryker disable next-line ArrayDeclaration: the DOM corpus remounts per intent; stale-closure behavior is covered by the broader sidebar navigation suite.
    [closeRightPanel, dmChannels, openDmSurface, openUserDM, selectSidebarTab],
  );

  const handleOpenAgentDm = useCallback(
    async (agentId: string) => {
      closeRightPanel();
      selectSidebarTab("chat");
      const existingDm = dmChannels.find((dm) => dm.peerType === "agent" && dm.peerId === agentId);
      const dm = existingDm ?? await openDM(agentId);
      openDmSurface(dm.id);
    },
    // Stryker disable next-line ArrayDeclaration: the DOM corpus remounts per intent; stale-closure behavior is covered by the broader sidebar navigation suite.
    [closeRightPanel, dmChannels, openDM, openDmSurface, selectSidebarTab],
  );

  // Stryker disable all: pre-existing context-menu dispatch is outside the workspace mutation corpus.
  const openCtxMenu = useCallback((e: React.MouseEvent, type: CtxMenu["type"], id: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Skip if useLongPress already opened the menu (prevents double-open on mobile)
    if (longPressSuppressRef.current) return;
    setSectionCtxMenu(null);
    setSidebarSurfaceCtxMenu(null);
    setMoveToSectionMenuOpen(false);
    setMoveToSectionMenuPosition(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, type, id });
  }, [longPressSuppressRef]);
  // Stryker restore all

  // Stryker disable all: pointer coordinates and portal placement are browser-smoke verified; clamping semantics live in placeSidebarContextMenu.
  const openSectionCtxMenu = useCallback((event: React.MouseEvent, section: SidebarSortSection | `custom:${string}`) => {
    event.preventDefault();
    event.stopPropagation();
    setCtxMenu(null);
    setSidebarSurfaceCtxMenu(null);
    setMoveToSectionMenuOpen(false);
    setMoveToSectionMenuPosition(null);
    setOpenSortMenu(null);
    setSectionCtxMenu({ x: event.clientX, y: event.clientY, section });
  }, []);
  // Stryker restore all

  const openSidebarSurfaceCtxMenu = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [role='menuitem']")) return;
    event.preventDefault();
    setCtxMenu(null);
    setSectionCtxMenu(null);
    setMoveToSectionMenuOpen(false);
    setMoveToSectionMenuPosition(null);
    setOpenSortMenu(null);
    setSidebarSurfaceCtxMenu({ x: event.clientX, y: event.clientY });
  }, []);

  // Stryker disable all: pre-existing context-menu placement is outside the workspace mutation corpus.
  useLayoutEffect(() => {
    if (!ctxMenu) return;
    const menuEl = ctxMenuRef.current;
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const next = placeSidebarContextMenu({
      x: ctxMenu.x,
      y: ctxMenu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (next.x === ctxMenu.x && next.y === ctxMenu.y) return;
    setCtxMenu((current) => {
      if (!current || current.type !== ctxMenu.type || current.id !== ctxMenu.id) return current;
      if (current.x !== ctxMenu.x || current.y !== ctxMenu.y) return current;
      return { ...current, ...next };
    });
  }, [ctxMenu]);
  // Stryker restore all

  // Stryker disable all: section-menu placement reuses the pure, separately tested context-menu geometry and is verified in the browser proof.
  useLayoutEffect(() => {
    if (!sectionCtxMenu) return;
    const menuEl = sectionCtxMenuRef.current;
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const next = placeSidebarContextMenu({
      x: sectionCtxMenu.x,
      y: sectionCtxMenu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (next.x === sectionCtxMenu.x && next.y === sectionCtxMenu.y) return;
    setSectionCtxMenu((current) => {
      if (!current || current.section !== sectionCtxMenu.section) return current;
      if (current.x !== sectionCtxMenu.x || current.y !== sectionCtxMenu.y) return current;
      return { ...current, ...next };
    });
  }, [sectionCtxMenu]);
  // Stryker restore all

  useLayoutEffect(() => {
    if (!sidebarSurfaceCtxMenu) return;
    const menuEl = sidebarSurfaceCtxMenuRef.current;
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const next = placeSidebarContextMenu({
      x: sidebarSurfaceCtxMenu.x,
      y: sidebarSurfaceCtxMenu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (next.x === sidebarSurfaceCtxMenu.x && next.y === sidebarSurfaceCtxMenu.y) return;
    setSidebarSurfaceCtxMenu((current) => {
      if (!current) return current;
      if (current.x !== sidebarSurfaceCtxMenu.x || current.y !== sidebarSurfaceCtxMenu.y) return current;
      return { ...current, ...next };
    });
  }, [sidebarSurfaceCtxMenu]);

  // Stryker disable all: route identity glue is browser-smoke verified; selection semantics live in the pure helper.
  const serverSlug = useServerStore((s) => s.current?.slug);
  const pathBase = serverSlug ? `/s/${serverSlug}` : "";
  // Stryker restore all

  // Stryker disable all: route selection is browser-smoke verified.
  const isChannelSelected = (id: string) => location.pathname === `${pathBase}/channel/${id}`;
  const isDmSelected = (id: string) => location.pathname === `${pathBase}/dm/${id}`;
  const isAgentSelected = (id: string) => location.pathname === `${pathBase}/agent/${id}`;
  const isMachineSelected = (machineId: string) => location.pathname === `${pathBase}/computer/${machineId}`
    || location.pathname === `${pathBase}/machine/${machineId}`;
  // Task #702 (artin): opening an agent page (/s/<server>/agent/<id>) lands
  // the rail on the People tab; the left list must locate the agent on open,
  // so scroll its row into view as soon as the list has it. `nearest` is a
  // no-op when the row is already visible.
  // Task #702 (artin): opening an agent page (/s/<server>/agent/<id>) lands
  // the rail on the People tab; the left list must locate the agent on open.
  // Center the row (artin: "往 center 靠一靠") so the located agent reads in
  // context instead of pinned to an edge. Located once per open — later list
  // churn (an agent added or removed) must not yank a user-scrolled list back
  // (Josh's review); the effect retries until the list has rendered the row.
  // The id is URL-decoded, so it is escaped before it reaches the selector —
  // a crafted link must never turn into a querySelector SyntaxError that
  // takes the render tree down (Josh's review).
  const routeAgentId = serverSlug ? serverRouteAgentId(location.pathname, serverSlug) : null;
  const locatedAgentRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab !== "members" || !routeAgentId) {
      locatedAgentRef.current = null;
      return;
    }
    if (locatedAgentRef.current === routeAgentId) return;
    // `globalThis.CSS`: this module imports dnd-kit's `CSS` transform helper,
    // which shadows the DOM `CSS` object.
    const row = sidebarScrollRef.current?.querySelector<HTMLElement>(
      `[data-agent-id="${globalThis.CSS.escape(routeAgentId)}"]`,
    );
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    locatedAgentRef.current = routeAgentId;
  }, [activeTab, routeAgentId, agents.length, collapsed.agents]);

  const isHumanSelected = (id: string) => location.pathname === `${pathBase}/human/${id}`;
  // Stryker restore all
  const isReleaseNotesRoute = location.pathname.startsWith(`${pathBase}/release-notes`);

  // Settings-mode sidebar contents — when the user is in the Settings rail
  // mode, the sidebar shows a sub-nav of settings sections (Account /
  // Browser / Server / Release Notes, plus Computers on mobile) with their
  // canonical icons. The main panel renders the active sub-page; Logout
  // lives at the bottom of the Account page itself, not as a sidebar item.
  //
  // Computers is part of this sub-nav ONLY on mobile. Desktop has a
  // dedicated Computers rail mode in the LeftRail — adding Computers to
  // the Settings sub-nav there would be a duplicate entry point. Mobile's
  // 4-tab bar (Chat/Tasks/Members/Settings) folds Computers into Settings
  // instead of giving it its own tab.
  const isComputersRoute =
    pathBase &&
    (location.pathname === `${pathBase}/computers`
      || location.pathname.startsWith(`${pathBase}/computers/`)
      || location.pathname.startsWith(`${pathBase}/computer/`)
      || location.pathname.startsWith(`${pathBase}/machine/`)); // legacy
  // On mobile, `/settings` is the Settings tab ROOT — a list of sub-items
  // with no sub-page rendered yet. Nothing should be highlighted until the
  // user actually picks a sub-tab. On desktop, `/settings` still defaults
  // to Account (SettingsRoute renders Account content there), so Account
  // stays highlighted.
  const settingsTabFromPath: string | null = (() => {
    if (location.pathname.replace(/\/$/, "") === `${pathBase}/raftbench`) return "raftbench";
    if (isComputersRoute) return "computers";
    if (isReleaseNotesRoute) return "release-notes";
    const m = location.pathname.match(new RegExp(`^${pathBase.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}/settings(?:/([^/?#]+))?`));
    if (!m) return null;
    const t = m[1];
    if (!t) return mobileInline ? null : "account";
    return settingsTabIdForRouteSlug(t);
  })();
  const settingsSidebarGroups = useMemo<SettingsSidebarGroup[]>(() => pathBase
    ? [
        {
          label: formatMessage({ id: "layout.sidebar.settingsGroupPersonal" }),
          items: [
            { id: "account", label: formatMessage({ id: "settings.tabs.account" }), icon: <SidebarItemIcon><User /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/account`) },
            { id: "language-region", label: formatMessage({ id: "settings.tabs.languageRegion" }), icon: <SidebarItemIcon><Languages /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/language-region`) },
            { id: "appearance", label: formatMessage({ id: "settings.tabs.appearance" }), icon: <SidebarItemIcon><Type /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/appearance`) },
            { id: "notifications", label: formatMessage({ id: "settings.tabs.notifications" }), icon: <SidebarItemIcon><Bell /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/notifications`) },
          ],
        },
        {
          label: formatMessage({ id: "layout.sidebar.settingsGroupServer" }),
          items: [
            { id: "server", label: formatMessage({ id: "settings.tabs.server" }), icon: <SidebarItemIcon><Building2 /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/server`) },
            ...(raftBenchEnabled && canUseRaftBench(currentRole ?? undefined)
              ? [{ id: "raftbench", label: formatMessage({ id: "raftbench.nav" }), icon: <SidebarItemIcon><Activity /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/raftbench`) }]
              : []),
            ...(canViewBillingSettings
              ? [{ id: "billing", label: formatMessage({ id: "settings.tabs.billingHeader" }), icon: <SidebarItemIcon><CreditCard /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/billing`) }]
              : []),
            ...(canViewAdministrationSettings
              ? [{ id: "administration", label: formatMessage({ id: "settings.tabs.administration" }), icon: <SidebarItemIcon><Shield /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/administration`) }]
              : []),
            ...(slackBridgeEnabled
              ? [{ id: "im-bridges", label: formatMessage({ id: "settings.tabs.imBridges" }), icon: <SidebarItemIcon><Network /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/im-bridges`) }]
              : []),
            ...(canViewApplicationsSettings
              ? [{ id: "integrations", label: formatMessage({ id: "settings.tabs.integrations" }), icon: <SidebarItemIcon><Link2 /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/applications`) }]
              : []),
            ...(labsUiEnabled
              ? [{ id: "labs", label: formatMessage({ id: "settings.tabs.labs" }), icon: <SidebarItemIcon><FlaskConical /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/labs`) }]
              : []),
            ...(canViewMcpSettings
              ? [{ id: "mcp", label: formatMessage({ id: "settings.tabs.mcp" }), icon: <SidebarItemIcon><Blocks /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/mcp-servers`) }]
              : []),
            ...(providerConnectionsEnabled && canManageExternalAuth
              ? [{ id: "providers", label: formatMessage({ id: "settings.tabs.providers" }), icon: <SidebarItemIcon><KeyRound /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/providers`) }]
              : []),
            ...(mobileInline && currentRole !== "guest"
              ? [{ id: "computers", label: formatMessage({ id: "layout.sidebar.settingsComputers" }), icon: <SidebarItemIcon><Monitor /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/computers`) }]
              : []),
          ],
        },
        {
          label: formatMessage({ id: "layout.sidebar.settingsGroupAbout" }),
          items: [
            { id: "about", label: formatMessage({ id: "layout.sidebar.settingsAbout" }), icon: <SidebarItemIcon><BadgeInfo /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/about`) },
            { id: "documentation", label: formatMessage({ id: "layout.sidebar.settingsDocumentation" }), icon: <SidebarItemIcon><BookOpenText /></SidebarItemIcon>, href: "https://docs.raft.build" },
            { id: "feedback", label: formatMessage({ id: "settings.about.feedbackTitle" }), icon: <SidebarItemIcon><MessageSquare /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/settings/feedback`) },
            { id: "release-notes", label: formatMessage({ id: "layout.sidebar.settingsReleaseNotes" }), icon: <SidebarItemIcon><FileText /></SidebarItemIcon>, onClick: () => navigate(`${pathBase}/release-notes`) },
          ],
        },
      ]
    : [], [
    canManageExternalAuth,
    canViewAdministrationSettings,
    canViewApplicationsSettings,
    canViewBillingSettings,
    canViewMcpSettings,
    currentRole,
    formatMessage,
    labsUiEnabled,
    raftBenchEnabled,
    mobileInline,
    navigate,
    pathBase,
    providerConnectionsEnabled,
    slackBridgeEnabled,
  ]);

  // `sidebarItemClass` is now defined at module scope (pure) so the memoized row
  // leaves can use it too.

  // Stryker disable next-line StringLiteral: class composition is pinned by source-contract and real-browser scrollbar QA.
  // `.rf-side__body`: rows sit 8px in from each edge; the first section's own
  // 16px top padding (not the scroller) sets the gap under the head.
  // Under the sidebar head the list starts 4px down. When the top bar takes
  // the head's place, the list starts 8px under the bar's seam, like the rail
  // beside it, so the first row lines up with the first rail button.
  const sidebarScrollClassName = `scrollbar-quiet flex-1 overflow-x-hidden overflow-y-auto px-2 ${hideTitle ? "pt-2" : "pt-1"} pb-2 mobile-nav-clearance`;

  const renderSortMenu = (
    section: SidebarSortSection,
    value: SidebarSortMode,
    onChange: (value: SidebarSortMode) => void,
  ) => (
    <SidebarSortMenu
      section={section}
      value={value}
      onChange={onChange}
      open={openSortMenu === section}
      setOpenSortMenu={setOpenSortMenu}
    />
  );

  const openCreateChannelDialog = useCallback(() => {
    setSectionCtxMenu(null);
    setShowCreateChannel(true);
  }, []);

  const openCreateJointChannelDialog = useCallback(() => {
    if (!canCreateJointChannel) return;
    setSectionCtxMenu(null);
    setShowCreateJointChannel(true);
  }, [canCreateJointChannel]);

  const openCreateAgentDialog = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setShowCreateAgentMenu(false);
    trackAgentCreateOpened("sidebar");
    setShowCreateAgent(true);
  }, [setShowCreateAgent]);

  const openCreateExternalAgentDialog = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setShowCreateAgentMenu(false);
    trackAgentCreateOpened("sidebar_external");
    setShowCreateExternalAgent(true);
  }, []);

  const openHandoffDialog = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setShowCreateAgentMenu(false);
    setShowHandoff(true);
  }, []);

  // Section-header action handlers. Stable references: raft-ui's
  // SidebarSectionControl is a component, not a DOM button.
  const openCreateChannelFromSectionButton = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenSortMenu(null);
    setShowCreateAgentMenu(false);
    openCreateChannelDialog();
  }, [openCreateChannelDialog]);
  const openCreateJointChannelFromSectionButton = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setOpenSortMenu(null);
    setShowCreateAgentMenu(false);
    openCreateJointChannelDialog();
  }, [openCreateJointChannelDialog]);
  const handleCreateAgentMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      setOpenSortMenu(null);
      setSectionCtxMenu(null);
    }
    setShowCreateAgentMenu(open);
  }, []);
  const openAddMachineDialog = useCallback(() => setShowAddMachine(true), [setShowAddMachine]);
  const openInviteHumanDialog = useCallback(() => setShowInviteHuman(true), []);

  // Stryker disable all: rendered DOM and Playwright tests exercise both dedicated add buttons and their dialogs; this block is React event wiring.
  const renderSectionAddButton = (section: "channels" | "jointChannels") => {
    const isJoint = section === "jointChannels";
    if (isJoint ? !canCreateJointChannel : !canCreateChannel) return null;
    const label = isJoint
      ? formatMessage({ id: "layout.sidebar.createJointChannel" })
      : formatMessage({ id: "layout.sidebar.createChannel" });

    return (
      <Tooltip content={label}>
      <SidebarSectionControl
        type="button"
        aria-label={label}
        onClick={isJoint ? openCreateJointChannelFromSectionButton : openCreateChannelFromSectionButton}
      >
        <Plus size={16} />
      </SidebarSectionControl>
      </Tooltip>
    );
  };
  // Stryker restore all

  const renderAgentActionMenu = () => {
    if (!canCreateAgent) return null;

    return (
      // A raft-ui DropdownMenu: anchored to its button, portaled and kept on
      // screen, with the menu's own focus, keyboard and dismissal.
      <DropdownMenu open={showCreateAgentMenu} onOpenChange={handleCreateAgentMenuOpenChange}>
        <Tooltip content={formatMessage({ id: "layout.sidebar.addAgent" })}>
          <DropdownMenuTrigger
            render={(
              <SidebarSectionControl type="button" aria-label={formatMessage({ id: "layout.sidebar.addAgent" })}>
                <Plus size={16} />
              </SidebarSectionControl>
            )}
          />
        </Tooltip>
        <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="min-w-[190px]">
          <DropdownMenuItem onClick={openCreateAgentDialog}>
            <Bot />
            {formatMessage({ id: "layout.sidebar.createAgent" })}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openCreateExternalAgentDialog}>
            <Link2 />
            {formatMessage({ id: "layout.sidebar.createExternalAgent" })}
          </DropdownMenuItem>
          {isHandoffAvailable() && (
            <DropdownMenuItem data-testid="sidebar-menu-handoff-session" onClick={openHandoffDialog}>
              <ArrowRightLeft />
              {formatMessage({ id: "layout.sidebar.handoffSession" })}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Stryker disable all: typed-pinned projection is covered by dedicated DOM/source contracts and browser preview.
  const pinnedRefs = Array.isArray(sidebarOrder.pinned) ? sidebarOrder.pinned : EMPTY_PINNED_REFS;
  const pinnedChannelIdSet = useMemo(
    () => new Set(pinnedRefs.filter((ref) => ref.kind === "channel").map((ref) => ref.id)),
    [pinnedRefs],
  );
  const pinnedAgentIdSet = useMemo(
    () => new Set(pinnedRefs.filter((ref) => ref.kind === "agent").map((ref) => ref.id)),
    [pinnedRefs],
  );
  const pinnedHumanIdSet = useMemo(
    () => new Set(pinnedRefs.filter((ref) => ref.kind === "human").map((ref) => ref.id)),
    [pinnedRefs],
  );
  const pinnedChannelIds = useMemo(() => {
    const ids = pinnedRefs.filter((ref) => ref.kind === "channel").map((ref) => ref.id);
    for (const dm of dmChannels) {
      if (dm.peerType === "user" && dm.peerId && pinnedHumanIdSet.has(dm.peerId)) ids.push(dm.id);
      if (dm.peerType === "agent" && dm.peerId && pinnedAgentIdSet.has(dm.peerId)) ids.push(dm.id);
    }
    return ids;
  }, [dmChannels, pinnedAgentIdSet, pinnedHumanIdSet, pinnedRefs]);
  const pinnedAgentIds = useMemo(
    () => pinnedRefs.filter((ref) => ref.kind === "agent").map((ref) => ref.id),
    [pinnedRefs],
  );
  const customPlacedChannelIds = useMemo(
    () => new Set(sectionPlacements.filter((placement) => placement.kind === "channel").map((placement) => placement.id)),
    [sectionPlacements],
  );
  const customPlacedAgentIds = useMemo(
    () => new Set(sectionPlacements.filter((placement) => placement.kind === "agent").map((placement) => placement.id)),
    [sectionPlacements],
  );

  const activeChannels = useMemo(
    () => channels.filter((channel) => !channel.archivedAt),
    [channels],
  );
  const orderedRegularChannels = useMemo(
    () => sortSidebarChannels(
      orderByIds(activeChannels.filter((channel) => !isSidebarJointChannel(channel)), channelOrderIds),
      channelSortMode,
      channelActivity,
      allChannelId,
    ),
    [activeChannels, channelOrderIds, channelSortMode, channelActivity, allChannelId],
  );
  // Stryker disable all: memo/dependency wiring is rendered-DOM verified; membership behavior is mutation-tested in sidebarChannelVisibility.
  const visibleRegularChannels = useMemo(
    () => filterSidebarChannelsByMembership(orderedRegularChannels, joinedChannelsOnly),
    [orderedRegularChannels, joinedChannelsOnly],
  );
  const orderedJointChannels = useMemo(
    () => sortSidebarChannels(
      orderByIds(activeChannels.filter((channel) => isSidebarJointChannel(channel)), channelOrderIds),
      jointChannelSortMode,
      channelActivity,
    ),
    [activeChannels, channelOrderIds, jointChannelSortMode, channelActivity],
  );
  const pinnedChannel = useMemo(
    () => visibleRegularChannels.find((channel) => channel.id === allChannelId && !pinnedChannelIdSet.has(channel.id) && !customPlacedChannelIds.has(channel.id)) ?? null,
    [visibleRegularChannels, allChannelId, pinnedChannelIdSet, customPlacedChannelIds],
  );
  const sortableChannels = useMemo(
    () => visibleRegularChannels.filter((channel) => channel.id !== allChannelId && !pinnedChannelIdSet.has(channel.id) && !customPlacedChannelIds.has(channel.id)),
    [visibleRegularChannels, allChannelId, pinnedChannelIdSet, customPlacedChannelIds],
  );
  const fallbackRegularChannels = useMemo(
    () => pinnedChannel ? [pinnedChannel, ...sortableChannels] : sortableChannels,
    [pinnedChannel, sortableChannels],
  );
  // Stryker restore all
  const sortableJointChannels = useMemo(
    () => orderedJointChannels.filter((channel) => !pinnedChannelIdSet.has(channel.id) && !customPlacedChannelIds.has(channel.id)),
    [orderedJointChannels, pinnedChannelIdSet, customPlacedChannelIds],
  );
  const channelManualSort = channelSortMode === "manual";
  const jointChannelManualSort = jointChannelSortMode === "manual";
  const dmManualSort = dmSortMode === "manual";
  const pinnedManualSort = pinnedSortMode === "manual";

  // Map agent ID → DM channel ID (for navigation + per-row unread subscription).
  // Unread itself is NOT computed here anymore — it lives in the <AgentDmRow>
  // leaf so this map stays stable across `message:new` churn.
  const agentDmChannelId = useMemo(() => {
    const channelId: Record<string, string> = {};
    for (const dm of dmChannels) {
      if (dm.peerType === "agent" && dm.peerId) {
        channelId[dm.peerId] = dm.id;
      }
    }
    return channelId;
  }, [dmChannels]);
  const agentDmChannelByAgentId = useMemo(() => {
    return buildAgentDmChannelByAgentId(dmChannels);
  }, [dmChannels]);
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );
  const dmContextPeerIds = useMemo(() => ({
    agentIds: new Set(agents.map((agent) => agent.id)),
    humanIds: new Set(members.map((member) => member.userId)),
  }), [agents, members]);

  const pinnedItems = useMemo(() => {
    const channelById = new Map(channels.filter((channel) => !channel.archivedAt).map((channel) => [channel.id, channel]));
    const humanDmByPeerId = new Map(dmChannels.filter((dm) => dm.peerType === "user" && dm.peerId).map((dm) => [dm.peerId!, dm]));
    const agentDmById = new Map(dmChannels.filter((dm) => dm.peerType === "agent" && dm.peerId).map((dm) => [dm.peerId!, dm]));
    const manualItems: PinnedDisplayItem[] = [];
    for (const ref of pinnedRefs) {
      const id = sidebarPinnedRefKey(ref);
      if (ref.kind === "channel") {
        const channel = channelById.get(ref.id);
        if (channel) manualItems.push({ id, ref, type: "channel", channel, createdAt: channel.createdAt, lastMessageAt: channelActivity[channel.id], label: channel.name });
        continue;
      }
      if (ref.kind === "human") {
        const dm = humanDmByPeerId.get(ref.id);
        if (dm) manualItems.push({ id, ref, type: "dm", dm, createdAt: dm.createdAt, lastMessageAt: channelActivity[dm.id], label: sidebarDmLabel(dm) });
        continue;
      }
      const agent = agentById.get(ref.id);
      if (agent) {
        const dmChannel = agentDmById.get(agent.id);
        manualItems.push({
          id,
          ref,
          type: "agent",
          agent,
          createdAt: dmChannel?.createdAt ?? agent.createdAt,
          lastMessageAt: dmChannel ? channelActivity[dmChannel.id] : undefined,
          label: agent.displayName || agent.name,
        });
        continue;
      }
      const dm = agentDmById.get(ref.id);
      if (dm) manualItems.push({ id, ref, type: "dm", dm, createdAt: dm.createdAt, lastMessageAt: channelActivity[dm.id], label: sidebarDmLabel(dm) });
    }

    return sortSidebarPinnedItems(manualItems, pinnedSortMode);
  }, [pinnedRefs, channels, dmChannels, agentById, pinnedSortMode, channelActivity]);
  const pinnedDmIdSet = useMemo(
    () => new Set(pinnedItems.filter((item) => item.type === "dm").map((item) => item.dm.id)),
    [pinnedItems],
  );

  const customSectionItems = useMemo(() => {
    const channelById = new Map(channels.filter((channel) => !channel.archivedAt).map((channel) => [channel.id, channel]));
    const dmById = new Map(dmChannels.map((dm) => [dm.id, dm]));
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const result = new Map<string, CustomSectionDisplayItem[]>();
    for (const placement of [...sectionPlacements].sort((a, b) => a.position - b.position)) {
      const channel = channelById.get(placement.id);
      const dm = dmById.get(placement.id);
      const agent = agentById.get(placement.id);
      if (placement.kind === "channel" && (
        pinnedChannelIdSet.has(placement.id)
        || (dm?.peerType === "user" && !!dm.peerId && pinnedHumanIdSet.has(dm.peerId))
        || (dm?.peerType === "agent" && !!dm.peerId && pinnedAgentIdSet.has(dm.peerId))
      )) continue;
      if (placement.kind === "agent" && pinnedAgentIdSet.has(placement.id)) continue;
      let item: CustomSectionDisplayItem | null = null;
      if (dm) {
        item = { id: dm.id, type: "dm", dm, createdAt: dm.createdAt, lastMessageAt: channelActivity[dm.id], label: sidebarDmLabel(dm), placementKind: "channel" };
      } else if (channel) {
        item = { id: channel.id, type: "channel", channel, createdAt: channel.createdAt, lastMessageAt: channelActivity[channel.id], label: channel.name, placementKind: "channel" };
      } else if (agent) {
        const dmChannel = agentDmChannelByAgentId[agent.id];
        item = {
          id: agent.id,
          type: "agent",
          agent,
          createdAt: dmChannel?.createdAt ?? agent.createdAt,
          lastMessageAt: dmChannel ? channelActivity[dmChannel.id] : undefined,
          label: agent.displayName || agent.name,
          placementKind: "agent",
        };
      }
      if (!item) continue;
      const items = result.get(placement.sectionId) ?? [];
      items.push(item);
      result.set(placement.sectionId, items);
    }
    for (const section of customSections) {
      const items = result.get(section.id) ?? [];
      if (section.sortMode === "az") items.sort((a, b) => a.label.localeCompare(b.label));
      if (section.sortMode === "recent") items.sort((a, b) => String(b.lastMessageAt ?? b.createdAt).localeCompare(String(a.lastMessageAt ?? a.createdAt)));
      result.set(section.id, items);
    }
    return result;
  }, [agents, agentDmChannelByAgentId, channelActivity, channels, customSections, dmChannels, pinnedAgentIdSet, pinnedChannelIdSet, pinnedHumanIdSet, sectionPlacements]);

  // Reveal the active conversation in the sidebar (task #125). Two sources:
  //  - an explicit one-shot request carried in route state (search "Open"):
  //    centre the row;
  //  - the route change itself: whenever the active channel / DM changes after
  //    mount, bring its row into view ("nearest" — no scroll if it is already
  //    visible), so the conversation finder, ⌘K, deep links, mention clicks and
  //    notifications all land with the sidebar showing where you are. Tracked
  //    per location.key with React's adjust-state-during-render so the
  //    follow-up render after a section expands still sees the same request;
  //    the first render is never a navigation.
  const explicitSidebarFocusRequest = readSidebarChannelFocusRequest(location.state);
  const [sidebarRouteTrack, setSidebarRouteTrack] = useState<{
    key: string;
    pathname: string;
    implicit: SidebarChannelFocusRequest | null;
  }>(() => ({ key: location.key, pathname: location.pathname, implicit: null }));
  if (sidebarRouteTrack.key !== location.key) {
    setSidebarRouteTrack({
      key: location.key,
      pathname: location.pathname,
      // A Chat-root redirect restores the page the user left; like the route
      // auto-expand above, it is not a navigation and reveals nothing.
      implicit: isSidebarDisclosureRestoreState(location.state)
        ? null
        : implicitSidebarFocusRequest(sidebarRouteTrack.pathname, location.pathname),
    });
  }
  const routeConversation = conversationFromPathname(location.pathname);
  // An explicit request only counts for the conversation the route actually
  // shows; a stale or mismatched state falls back to the route's own reveal.
  const sidebarChannelFocusRequest =
    explicitSidebarFocusRequest
    && routeConversation
    && explicitSidebarFocusRequest.kind === routeConversation.kind
    && explicitSidebarFocusRequest.id === routeConversation.id
      ? explicitSidebarFocusRequest
      : sidebarRouteTrack.key === location.key
        ? sidebarRouteTrack.implicit
        : null;
  useLayoutEffect(() => {
    if (
      !showChatRail
      || !sidebarChannelFocusRequest
      || handledSidebarFocusLocationKeyRef.current === location.key
    ) {
      return;
    }
    const shown = conversationFromPathname(location.pathname);
    if (!shown || shown.kind !== sidebarChannelFocusRequest.kind || shown.id !== sidebarChannelFocusRequest.id) return;

    // Which disclosure owns the row — resolved from the SAME data the sidebar
    // renders from, in render precedence: pinned → a custom section → joint /
    // regular channels → the Direct Messages section (whose disclosure reuses
    // `agents`; every non-pinned, non-custom DM lives there, human or agent).
    // Guessing from the conversation's type is wrong (a pinned human DM is in
    // `pinned`, a placed channel is in its custom section).
    type Owner = { builtin: keyof typeof collapsed } | { custom: string };
    let owner: Owner | null = null;
    const customOwnerOf = (match: (item: CustomSectionDisplayItem) => boolean): Owner | null => {
      for (const [sectionId, items] of customSectionItems) {
        if (items.some(match)) return { custom: sectionId };
      }
      return null;
    };
    const targetId = sidebarChannelFocusRequest.id;
    if (sidebarChannelFocusRequest.kind === "channel") {
      const targetChannel = activeChannels.find((channel) => channel.id === targetId);
      if (!targetChannel) return;
      owner = pinnedChannelIdSet.has(targetId)
        ? { builtin: "pinned" }
        : customOwnerOf((item) => item.type === "channel" && item.channel.id === targetId)
          ?? (isSidebarJointChannel(targetChannel)
            ? { builtin: "jointChannels" }
            : visibleRegularChannels.some((channel) => channel.id === targetId)
              ? { builtin: "channels" }
              : null);
    } else {
      const dm = dmChannels.find((candidate) => candidate.id === targetId);
      if (!dm) return;
      owner = pinnedDmIdSet.has(targetId)
        ? { builtin: "pinned" }
        : customOwnerOf((item) =>
          (item.type === "dm" && item.dm.id === targetId)
          || (item.type === "agent" && agentDmChannelByAgentId[item.agent.id]?.id === targetId))
          ?? { builtin: "agents" };
    }

    if (!owner) {
      handledSidebarFocusLocationKeyRef.current = location.key;
      return;
    }

    const ownerCollapsed = "custom" in owner
      ? collapsedCustomSections[owner.custom] === true
      : collapsed[owner.builtin];
    if (ownerCollapsed) {
      // A reveal — explicit or implied by the navigation — may open the owning
      // section transiently (it never writes the user's disclosure preference;
      // only a header click does). The route auto-expand above only opens
      // `channels`, so pinned / joint / custom sections and DMs depend on this.
      // The first render and the Chat-root restore redirect never get here:
      // they produce no request.
      if ("custom" in owner) {
        const sectionId = owner.custom;
        // oxlint-disable-next-line react-doctor/no-chain-state-updates -- the follow-up render is required before the row exists to measure.
        setCollapsedCustomSections((previous) => ({ ...previous, [sectionId]: false }));
      } else {
        const key = owner.builtin;
        // oxlint-disable-next-line react-doctor/no-chain-state-updates -- the follow-up render is required before the row exists to measure.
        setCollapsed((previous) => ({ ...previous, [key]: false }));
      }
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const scroller = sidebarScrollRef.current;
      if (!scroller) return;
      const row = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-sidebar-channel-id]"),
      ).find((candidate) => (
        candidate.dataset.sidebarChannelId === sidebarChannelFocusRequest.id
      ));
      // A row inside a hidden container (custom sections keep collapsed rows
      // mounted under `hidden`) has no geometry; never scroll to a zero rect.
      if (!row || row.closest("[hidden]")) {
        handledSidebarFocusLocationKeyRef.current = location.key;
        return;
      }

      const viewportRect = scroller.getBoundingClientRect();
      const itemRect = row.getBoundingClientRect();
      const geometry = {
        currentScrollTop: scroller.scrollTop,
        itemHeight: itemRect.height,
        itemTop: itemRect.top,
        viewportHeight: scroller.clientHeight,
        viewportTop: viewportRect.top,
      };
      const top = sidebarChannelFocusRequest.align === "center"
        ? centeredSidebarScrollTop(geometry)
        : nearestSidebarScrollTop(geometry);
      if (top !== null) scroller.scrollTo({ top, behavior: "auto" });
      handledSidebarFocusLocationKeyRef.current = location.key;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    activeChannels,
    agentDmChannelByAgentId,
    collapsed,
    collapsedCustomSections,
    customSectionItems,
    dmChannels,
    location.key,
    location.pathname,
    pinnedChannelIdSet,
    pinnedDmIdSet,
    showChatRail,
    sidebarChannelFocusRequest,
    visibleRegularChannels,
  ]);

  // Narrowed unread aggregates. These subscribe to `unreadCounts` but collapse
  // it to 4 booleans (one per collapsible section) so the parent re-renders ONLY
  // when a section's "has unread" state flips — not on every inbound message.
  const unreadFlags = useMessageStore(
    useShallow((s) => {
      const has = (...unreadChannels: Array<Channel | undefined>) => (
        hasUnmutedUnread(s.unreadCounts, unreadChannels)
      );
      return {
        pinned: pinnedItems.some((item) => {
          if (item.type === "channel") return has(item.channel);
          if (item.type === "dm") return has(item.dm);
          return has(agentDmChannelByAgentId[item.agent.id]);
        }),
        joint: has(...sortableJointChannels),
        // Stryker disable next-line MethodExpression,ArrowFunction: collapsed unread chrome follows the browser-visible filtered list; store selector mutation is outside this task's domain seam.
        channels: has(...fallbackRegularChannels),
        dms: has(...dmChannels.filter(
          (dm) =>
            !pinnedDmIdSet.has(dm.id) &&
            !(dm.peerType === "agent" && dm.peerId && pinnedAgentIdSet.has(dm.peerId)) &&
            !(dm.peerType === "user" && dm.peerId && pinnedHumanIdSet.has(dm.peerId)) &&
            !customPlacedChannelIds.has(dm.id) &&
            !(dm.peerType === "agent" && dm.peerId && customPlacedAgentIds.has(dm.peerId)),
        )),
      };
    }),
  );
  const customUnreadSectionIds = useMessageStore(
    useShallow((state) => [...customSectionItems.entries()]
      .filter(([, items]) => items.some((item) => {
        const unreadChannel = item.type === "channel" ? item.channel
          : item.type === "dm" ? item.dm
            : agentDmChannelByAgentId[item.agent.id];
        return hasUnmutedUnread(state.unreadCounts, [unreadChannel]);
      }))
      .map(([sectionId]) => sectionId)),
  );
  const customUnreadSectionIdSet = useMemo(() => new Set(customUnreadSectionIds), [customUnreadSectionIds]);
  // Closed DMs that currently have unread must stay visible (auto-reopen on a
  // new message). Narrowed to the id list so a message to an already-visible DM
  // does not re-render the parent — only a closed→unread transition does.
  const closedDmUnreadIds = useMessageStore(
    useShallow((s) =>
      dmChannels
        .filter((dm) => closedDmIds.has(dm.id) && (s.unreadCounts[dm.id] || 0) > 0)
        .map((dm) => dm.id),
    ),
  );
  const closedDmUnreadSet = useMemo(() => new Set(closedDmUnreadIds), [closedDmUnreadIds]);

  const orderedDms = useMemo(() => {
    const visibleDmSet = new Set(
      dmChannels
        .filter((dm) =>
          (!closedDmIds.has(dm.id) || closedDmUnreadSet.has(dm.id)) &&
          !(dm.peerType === "agent" && dm.peerId && pinnedAgentIdSet.has(dm.peerId)) &&
          !(dm.peerType === "user" && dm.peerId && pinnedHumanIdSet.has(dm.peerId)) &&
          !pinnedDmIdSet.has(dm.id) &&
          !customPlacedChannelIds.has(dm.id) &&
          !(dm.peerType === "agent" && dm.peerId && customPlacedAgentIds.has(dm.peerId))
        )
        .map((dm) => dm.id),
    );
    return sortSidebarDms(
      orderByIds(dmChannels, dmOrderIds),
      dmSortMode,
      channelActivity,
    ).filter((dm) => visibleDmSet.has(dm.id));
  }, [
    channelActivity,
    closedDmIds,
    closedDmUnreadSet,
    customPlacedAgentIds,
    customPlacedChannelIds,
    dmChannels,
    dmOrderIds,
    dmSortMode,
    pinnedAgentIdSet,
    pinnedDmIdSet,
    pinnedHumanIdSet,
  ]);

  const sidebarDndDisplayItems = useMemo(() => {
    const items = new Map<string, SidebarDndDisplayItem>();
    const addChannel = (channel: Channel) => {
      items.set(channelDragId(channel.id), { type: "channel", channel, label: channel.name });
    };
    const addDm = (dm: Channel) => {
      items.set(channelDragId(dm.id), { type: "dm", dm, label: sidebarDmLabel(dm) });
    };
    const addAgent = (agent: Agent) => {
      items.set(agentDragId(agent.id), { type: "agent", agent, label: agent.displayName || agent.name });
    };

    for (const item of pinnedItems) {
      if (item.type === "channel") addChannel(item.channel);
      else if (item.type === "dm") addDm(item.dm);
      else addAgent(item.agent);
    }
    for (const sectionItems of customSectionItems.values()) {
      for (const item of sectionItems) {
        if (item.type === "channel") addChannel(item.channel);
        else if (item.type === "dm") addDm(item.dm);
        else addAgent(item.agent);
      }
    }
    for (const channel of fallbackRegularChannels) addChannel(channel);
    for (const channel of sortableJointChannels) addChannel(channel);
    for (const dm of orderedDms) addDm(dm);
    return items;
  }, [
    customSectionItems,
    fallbackRegularChannels,
    orderedDms,
    pinnedItems,
    sortableJointChannels,
  ]);

  const sidebarDndBaseProjection = useMemo<SidebarDndProjection>(() => {
    const projection: SidebarDndProjection = {
      [SIDEBAR_PINNED_CONTAINER_ID]: pinnedItems.map((item) => (
        item.type === "agent" ? agentDragId(item.agent.id)
          : item.type === "dm" ? channelDragId(item.dm.id)
            : channelDragId(item.channel.id)
      )),
      [SIDEBAR_JOINT_CHANNELS_CONTAINER_ID]: sortableJointChannels.map((channel) => channelDragId(channel.id)),
      [SIDEBAR_CHANNELS_CONTAINER_ID]: fallbackRegularChannels.map((channel) => channelDragId(channel.id)),
      [SIDEBAR_DMS_CONTAINER_ID]: orderedDms.map((dm) => channelDragId(dm.id)),
    };
    for (const section of customSections) {
      projection[sidebarCustomContainerId(section.id)] = (customSectionItems.get(section.id) ?? []).map((item) => (
        item.type === "agent" ? agentDragId(item.agent.id)
          : item.type === "dm" ? channelDragId(item.dm.id)
            : channelDragId(item.channel.id)
      ));
    }
    return projection;
  }, [
    customSectionItems,
    customSections,
    fallbackRegularChannels,
    orderedDms,
    pinnedItems,
    sortableJointChannels,
  ]);
  const sidebarDndCurrentProjection = sidebarDndProjection ?? sidebarDndBaseProjection;

  const resolvePinnedRefFromDragId = useCallback((id: string): SidebarPinnedRef | null => {
    const parsed = parseDragId(id);
    if (!parsed) return null;
    if (parsed.kind === "agent") return { kind: "agent", id: parsed.id };
    const dm = dmChannels.find((channel) => channel.id === parsed.id);
    return dm ? pinnedRefForDmChannel(dm) : { kind: "channel", id: parsed.id };
  }, [dmChannels]);

  const resolveMovableItemFromDragId = useCallback((id: string): SidebarMovableItem | null => {
    const parsed = parseDragId(id);
    if (!parsed) return null;
    if (parsed.kind === "channel" || parsed.kind === "dm") {
      return { kind: "channel", id: parsed.id };
    }
    if (parsed.kind === "agent") return { kind: "agent", id: parsed.id };
    return null;
  }, []);

  const getSidebarDndHomeContainer = useCallback((itemId: string): string | null => {
    const parsed = parseDragId(itemId);
    if (!parsed) return null;
    if (parsed.kind === "agent") {
      return dmChannels.some((dm) => dm.peerType === "agent" && dm.peerId === parsed.id)
        ? SIDEBAR_DMS_CONTAINER_ID
        : null;
    }
    if (parsed.kind === "dm" || dmChannels.some((dm) => dm.id === parsed.id)) {
      return SIDEBAR_DMS_CONTAINER_ID;
    }
    const channel = channels.find((candidate) => candidate.id === parsed.id);
    if (!channel) return null;
    return isSidebarJointChannel(channel)
      ? SIDEBAR_JOINT_CHANNELS_CONTAINER_ID
      : SIDEBAR_CHANNELS_CONTAINER_ID;
  }, [channels, dmChannels]);

  const getSidebarDndDefaultOrderId = useCallback((itemId: string): string | null => {
    const parsed = parseDragId(itemId);
    if (!parsed) return null;
    if (parsed.kind === "agent") {
      return dmChannels.find((dm) => dm.peerType === "agent" && dm.peerId === parsed.id)?.id ?? null;
    }
    return parsed.id;
  }, [dmChannels]);

  const isSidebarDndContainerManual = useCallback((containerId: string): boolean => {
    if (containerId === SIDEBAR_PINNED_CONTAINER_ID) return pinnedManualSort;
    if (containerId === SIDEBAR_CHANNELS_CONTAINER_ID) return channelManualSort;
    if (containerId === SIDEBAR_JOINT_CHANNELS_CONTAINER_ID) return jointChannelManualSort;
    if (containerId === SIDEBAR_DMS_CONTAINER_ID) return dmManualSort;
    const customSectionId = sidebarCustomSectionId(containerId);
    return !!customSectionId
      && customSections.some((section) => section.id === customSectionId && section.sortMode === "manual");
  }, [
    channelManualSort,
    customSections,
    dmManualSort,
    jointChannelManualSort,
    pinnedManualSort,
  ]);

  const isValidSidebarDndDestination = useCallback((itemId: string, containerId: string): boolean => {
    if (!isSidebarDndContainerManual(containerId)) return false;
    if (
      containerId === SIDEBAR_PINNED_CONTAINER_ID
      || sidebarCustomSectionId(containerId)
    ) return true;
    return getSidebarDndHomeContainer(itemId) === containerId;
  }, [getSidebarDndHomeContainer, isSidebarDndContainerManual]);

  const togglePinnedRef = useCallback((ref: SidebarPinnedRef, placementsToRemove: SidebarMovableItem[] = []) => {
    const isPinned = hasSidebarPinnedRef(pinnedRefs, ref);
    const next = isPinned ? removeSidebarPinnedRef(pinnedRefs, ref) : upsertSidebarPinnedRef(pinnedRefs, ref);
    const nextPlacements = isPinned
      ? sectionPlacements
      : placementsToRemove.reduce(
          (placements, item) => removeSidebarItemPlacement(placements, item),
          sectionPlacements,
        );
    void updateSidebarOrder({
      pinned: next,
      ...(nextPlacements === sectionPlacements ? {} : { sectionPlacements: nextPlacements }),
    });
  }, [pinnedRefs, sectionPlacements, updateSidebarOrder]);

  const pinnedRefForMovableItem = useCallback((item: SidebarMovableItem): SidebarPinnedRef | null => {
    if (item.kind === "agent") return { kind: "agent", id: item.id };
    const dm = dmChannels.find((channel) => channel.id === item.id);
    return dm ? pinnedRefForDmChannel(dm) : { kind: "channel", id: item.id };
  }, [dmChannels]);

  const moveItemToPinned = useCallback((item: SidebarMovableItem) => {
    const ref = pinnedRefForMovableItem(item);
    if (!ref) return;
    const nextSectionPlacements = removeSidebarItemPlacement(sectionPlacements, item);
    void updateSidebarOrder({
      sectionPlacements: nextSectionPlacements,
      pinned: hasSidebarPinnedRef(pinnedRefs, ref) ? pinnedRefs : upsertSidebarPinnedRef(pinnedRefs, ref),
    });
  }, [pinnedRefForMovableItem, pinnedRefs, sectionPlacements, updateSidebarOrder]);

  const moveItemToCustomSection = useCallback((item: SidebarMovableItem, sectionId: string) => {
    const ref = pinnedRefForMovableItem(item);
    void updateSidebarOrder({
      sectionPlacements: moveSidebarItemToCustomSection(sectionPlacements, item, sectionId),
      pinned: ref ? removeSidebarPinnedRef(pinnedRefs, ref) : pinnedRefs,
    });
  }, [pinnedRefForMovableItem, pinnedRefs, sectionPlacements, updateSidebarOrder]);

  const removeItemFromCustomSection = useCallback((item: SidebarMovableItem) => {
    void updateSidebarOrder({ sectionPlacements: removeSidebarItemPlacement(sectionPlacements, item) });
  }, [sectionPlacements, updateSidebarOrder]);

  const createCustomSection = useCallback((value: { name: string; emoji: string | null }, moveItem?: SidebarMovableItem) => {
    const id = crypto.randomUUID();
    const section: SidebarCustomSection = { id, name: value.name, emoji: value.emoji, sortMode: "manual" };
    const nextSectionPlacements = moveItem
      ? moveSidebarItemToCustomSection(sectionPlacements, moveItem, id)
      : sectionPlacements;
    const moveItemRef = moveItem ? pinnedRefForMovableItem(moveItem) : null;
    void updateSidebarOrder({
      customSections: [...customSections, section],
      sectionOrder: [...sectionOrder, id],
      sectionPlacements: nextSectionPlacements,
      pinned: moveItemRef ? removeSidebarPinnedRef(pinnedRefs, moveItemRef) : pinnedRefs,
    });
    setSectionDialog(null);
  }, [customSections, pinnedRefForMovableItem, pinnedRefs, sectionOrder, sectionPlacements, updateSidebarOrder]);

  const updateCustomSection = useCallback((sectionId: string, value: { name: string; emoji: string | null }) => {
    void updateSidebarOrder({
      customSections: customSections.map((section) => section.id === sectionId ? { ...section, ...value } : section),
    });
    setSectionDialog(null);
  }, [customSections, updateSidebarOrder]);

  const deleteCustomSection = useCallback((sectionId: string) => {
    void updateSidebarOrder({
      customSections: customSections.filter((section) => section.id !== sectionId),
      sectionOrder: sectionOrder.filter((id) => id !== sectionId),
      sectionPlacements: sectionPlacements.filter((placement) => placement.sectionId !== sectionId),
    });
    setSectionCtxMenu(null);
  }, [customSections, sectionOrder, sectionPlacements, updateSidebarOrder]);

  const togglePinChannel = useCallback((channelId: string) => {
    togglePinnedRef({ kind: "channel", id: channelId }, [{ kind: "channel", id: channelId }]);
  }, [togglePinnedRef]);

  const toggleChannelActivityMute = useCallback(async (channel: Channel) => {
    // Stryker disable next-line all: the context-menu visibility gate enforces the same supported/joined/non-thread predicate; this is defense-in-depth for non-UI callers.
    if (!canToggleActivityMute(channel)) return;
    const previous = {
      activityMuted: channel.activityMuted === true,
      muteFromSeq: channel.muteFromSeq ?? null,
      prefsVersion: channel.prefsVersion,
    };
    const nextActivityMuted = !previous.activityMuted;
    const optimistic = {
      activityMuted: nextActivityMuted,
      muteFromSeq: previous.muteFromSeq,
      prefsVersion: previous.prefsVersion,
    };
    useChannelStore.getState().setActivityMuteState(channel.id, optimistic);

    try {
      const { data } = await api.patch(`/channels/${channel.id}/notification-settings`, {
        activityMuted: nextActivityMuted,
      });
      useChannelStore.getState().setActivityMuteState(channel.id, normalizeActivityMuteState(data));
    } catch {
      const current = useChannelStore.getState().channels.find((candidate) => candidate.id === channel.id);
      if (matchesActivityMuteState(current, optimistic)) {
        useChannelStore.getState().setActivityMuteState(channel.id, previous);
        toast.error(nextActivityMuted
          ? formatMessage({ id: "layout.sidebar.failedMuteActivity" })
          : formatMessage({ id: "layout.sidebar.failedUnmuteActivity" }));
      }
    }
  }, [formatMessage]);

  const togglePinAgent = useCallback((agentId: string) => {
    const agentDm = dmChannels.find((dm) => dm.peerType === "agent" && dm.peerId === agentId);
    togglePinnedRef(
      { kind: "agent", id: agentId },
      [
        { kind: "agent", id: agentId },
        ...(agentDm ? [{ kind: "channel", id: agentDm.id } satisfies SidebarMovableItem] : []),
      ],
    );
  }, [dmChannels, togglePinnedRef]);

  const togglePinDm = useCallback((dm: Channel) => {
    const ref = pinnedRefForDmChannel(dm);
    if (!ref) return;
    togglePinnedRef(ref, [{ kind: "channel", id: dm.id }]);
  }, [togglePinnedRef]);

  const sidebarCollisionDetection = useCallback<CollisionDetection>((args) => {
    const activeId = String(args.active.id);
    const pointerX = args.pointerCoordinates?.x;
    const pointerY = args.pointerCoordinates?.y;
    if (sectionOrder.includes(activeId)) {
      const sectionCollisions = closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => (
          sectionOrder.includes(String(container.id))
        )),
      });
      if (import.meta.env.VITE_E2E === "true" && isSidebarDndProbeEnabled()) {
        recordSidebarDndCollisionBranch({ branch: "section-sort", resultIds: sectionCollisions.map((collision) => String(collision.id)), x: pointerX, y: pointerY });
      }
      return sectionCollisions;
    }

    const validContainers = args.droppableContainers.filter((container) => {
      const data = container.data.current;
      if (!isSidebarDndData(data)) return false;
      return isValidSidebarDndDestination(activeId, data.containerId);
    });
    const collisionArgs = { ...args, droppableContainers: validContainers };
    const pointerCollisions = pointerWithin(collisionArgs);
    const itemCollision = pointerCollisions.find((collision) => {
      const container = validContainers.find((candidate) => candidate.id === collision.id);
      return (container?.data.current as SidebarDndData | undefined)?.type === "item";
    });
    const branchContext = () => ({
      validContainerIds: validContainers.map((container) => String(container.id)),
      rectIds: [...args.droppableRects.keys()].map(String),
      x: pointerX,
      y: pointerY,
    });
    if (itemCollision) {
      if (import.meta.env.VITE_E2E === "true" && isSidebarDndProbeEnabled()) {
        recordSidebarDndCollisionBranch({ branch: "pointer-item", resultIds: [String(itemCollision.id)], ...branchContext() });
      }
      return [itemCollision];
    }
    if (pointerCollisions.length > 0) {
      if (import.meta.env.VITE_E2E === "true" && isSidebarDndProbeEnabled()) {
        recordSidebarDndCollisionBranch({ branch: "pointer-container", resultIds: pointerCollisions.map((collision) => String(collision.id)), ...branchContext() });
      }
      return pointerCollisions;
    }

    // Keyboard drags have no pointer, and a pointer outside the section list
    // (past the last section, off the sidebar, or beyond an auto-scrolling
    // edge) has no local target: snap to the nearest valid container.
    if (
      !args.pointerCoordinates
      || !isPointerWithinSidebarDndBounds(args.pointerCoordinates, args.droppableRects.values())
    ) {
      const boundsCollisions = closestCenter(collisionArgs);
      if (import.meta.env.VITE_E2E === "true" && isSidebarDndProbeEnabled()) {
        recordSidebarDndCollisionBranch({ branch: "bounds-closest-center", resultIds: boundsCollisions.map((collision) => String(collision.id)), ...branchContext() });
      }
      return boundsCollisions;
    }

    // Inside the list the pointer is over no valid destination: a gap between
    // sections, a section header, or a section this item may not enter (a
    // regular channel crossing Joint Channels). Keep the item where the live
    // projection already put it. Any geometry-based answer here (nearest valid
    // container, or the
    // drag-start container) feeds back into itself: the projection changes the
    // height of the containers the item leaves and enters, which moves the
    // pointer in or out of them, which flips the answer again. dnd-kit re-runs
    // collision detection on every remeasure, so that alternation loops without
    // pointer movement until React hits its update-depth guard (#185).
    const retainedContainerId = resolveSidebarDndRetainedContainer(
      sidebarDndProjectionRef.current,
      sidebarDndSnapshotRef.current,
      activeId,
    );
    const retainedCollisions = retainedContainerId ? [{ id: retainedContainerId }] : [];
    if (import.meta.env.VITE_E2E === "true" && isSidebarDndProbeEnabled()) {
      recordSidebarDndCollisionBranch({
        branch: retainedContainerId ? "retained" : "empty",
        resultIds: retainedCollisions.map((collision) => String(collision.id)),
        ...branchContext(),
      });
    }
    return retainedCollisions;
  }, [isValidSidebarDndDestination, sectionOrder]);

  const resetSidebarDnd = useCallback(() => {
    sidebarDndSnapshotRef.current = null;
    sidebarDndProjectionRef.current = null;
    setSidebarDndProjection(null);
    setSidebarDndActiveId(null);
    setSidebarDndSourceContainerId(null);
  }, []);

  const handleSidebarDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as SidebarDndData | undefined;
    if (data?.type !== "item") {
      resetSidebarDnd();
      return;
    }
    sidebarDndSnapshotRef.current = sidebarDndBaseProjection;
    sidebarDndProjectionRef.current = sidebarDndBaseProjection;
    setSidebarDndProjection(sidebarDndBaseProjection);
    setSidebarDndActiveId(data.itemId);
    setSidebarDndSourceContainerId(findSidebarDndContainer(sidebarDndBaseProjection, data.itemId));
  }, [resetSidebarDnd, sidebarDndBaseProjection]);

  const projectSidebarDndOver = useCallback((
    active: DragOverEvent["active"],
    over: NonNullable<DragOverEvent["over"]>,
    current: SidebarDndProjection,
  ): SidebarDndProjection => {
    const activeData = active.data.current;
    const overData = over.data.current;
    if (
      !isSidebarDndData(activeData)
      || activeData.type !== "item"
      || !isSidebarDndData(overData)
    ) return current;
    if (!isValidSidebarDndDestination(activeData.itemId, overData.containerId)) return current;
    const destinationItems = current[overData.containerId];
    if (!destinationItems) return current;

    let destinationIndex = destinationItems.length;
    if (overData.type === "item" && overData.itemId !== activeData.itemId) {
      const itemsWithoutActive = destinationItems.filter((itemId) => itemId !== activeData.itemId);
      const overIndex = itemsWithoutActive.indexOf(overData.itemId);
      if (overIndex === -1) return current;
      const activeRect = active.rect.current.translated ?? active.rect.current.initial;
      const edge = getSidebarDropIndicatorEdge(
        activeRect ? activeRect.top + activeRect.height / 2 : over.rect.top,
        over.rect.top + over.rect.height / 2,
      );
      destinationIndex = overIndex + (edge === "after" ? 1 : 0);
    } else if (overData.type === "item") {
      return current;
    } else if (destinationItems.includes(activeData.itemId)) {
      // Container-level hover of the container that already holds the item
      // (including the retained-container collision above) keeps its slot.
      return current;
    }

    return moveSidebarDndItem(
      current,
      activeData.itemId,
      overData.containerId,
      destinationIndex,
    );
  }, [isValidSidebarDndDestination]);

  const handleSidebarDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over) return;
    const current = sidebarDndProjectionRef.current ?? sidebarDndBaseProjection;
    const next = projectSidebarDndOver(active, over, current);
    if (next === current) return;
    sidebarDndProjectionRef.current = next;
    setSidebarDndProjection(next);
  }, [projectSidebarDndOver, sidebarDndBaseProjection]);

  const handleSidebarDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    const activeId = String(active.id);
    if (over && sectionOrder.includes(activeId) && sectionOrder.includes(String(over.id))) {
      const overId = String(over.id);
      const nextOrder = reorderSidebarSectionOrder(sectionOrder, activeId, overId);
      if (nextOrder !== sectionOrder) void updateSidebarOrder({ sectionOrder: nextOrder });
      resetSidebarDnd();
      return;
    }

    const snapshot = sidebarDndSnapshotRef.current;
    const currentProjection = sidebarDndProjectionRef.current;
    const projection = over && currentProjection
      ? projectSidebarDndOver(active, over, currentProjection)
      : currentProjection;
    const sourceContainerId = snapshot ? findSidebarDndContainer(snapshot, activeId) : null;
    const destinationContainerId = projection ? findSidebarDndContainer(projection, activeId) : null;
    resetSidebarDnd();
    if (
      !over
      || !snapshot
      || !projection
      || !sourceContainerId
      || !destinationContainerId
      || !isValidSidebarDndDestination(activeId, destinationContainerId)
    ) {
      return;
    }

    const movableItem = resolveMovableItemFromDragId(activeId);
    if (!movableItem) return;

    if (destinationContainerId === SIDEBAR_PINNED_CONTAINER_ID) {
      const seen = new Set<string>();
      const nextPinned = projection[SIDEBAR_PINNED_CONTAINER_ID]
        .map(resolvePinnedRefFromDragId)
        .filter((ref): ref is SidebarPinnedRef => {
          if (!ref) return false;
          const key = sidebarPinnedRefKey(ref);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      void updateSidebarOrder({
        pinned: nextPinned,
        sectionPlacements: removeSidebarItemPlacement(sectionPlacements, movableItem),
      });
      return;
    }

    const customSectionId = sidebarCustomSectionId(destinationContainerId);
    if (customSectionId) {
      const destinationIndex = projection[destinationContainerId].indexOf(activeId);
      const ref = resolvePinnedRefFromDragId(activeId);
      void updateSidebarOrder({
        sectionPlacements: moveSidebarItemToCustomSectionAtPosition(
          sectionPlacements,
          movableItem,
          customSectionId,
          destinationIndex,
        ),
        pinned: ref ? removeSidebarPinnedRef(pinnedRefs, ref) : pinnedRefs,
      });
      return;
    }

    const activeDefaultOrderId = getSidebarDndDefaultOrderId(activeId);
    if (!activeDefaultOrderId) return;
    const nextSubset = projection[destinationContainerId]
      .map(getSidebarDndDefaultOrderId)
      .filter((id): id is string => !!id);
    const previousSubset = [
      ...new Set([
        ...snapshot[destinationContainerId]
          .map(getSidebarDndDefaultOrderId)
          .filter((id): id is string => !!id),
        activeDefaultOrderId,
      ]),
    ];
    const ref = resolvePinnedRefFromDragId(activeId);
    const nextPlacements = removeSidebarItemPlacement(sectionPlacements, movableItem);
    const nextPinned = ref ? removeSidebarPinnedRef(pinnedRefs, ref) : pinnedRefs;

    if (destinationContainerId === SIDEBAR_DMS_CONTAINER_ID) {
      const nextOrder = replaceSidebarSubsetOrder(dmOrderIds, previousSubset, nextSubset);
      setDmOrderIds(nextOrder);
      void updateSidebarOrder({
        dmOrder: nextOrder,
        pinned: nextPinned,
        sectionPlacements: nextPlacements,
      });
      return;
    }
    const nextOrder = replaceSidebarSubsetOrder(channelOrderIds, previousSubset, nextSubset);
    setChannelOrderIds(nextOrder);
    void updateSidebarOrder({
      channelOrder: nextOrder.filter((id) => id !== allChannelId),
      pinned: nextPinned,
      sectionPlacements: nextPlacements,
    });
  }, [
    allChannelId,
    channelOrderIds,
    dmOrderIds,
    getSidebarDndDefaultOrderId,
    isValidSidebarDndDestination,
    pinnedRefs,
    resetSidebarDnd,
    resolveMovableItemFromDragId,
    resolvePinnedRefFromDragId,
    projectSidebarDndOver,
    sectionOrder,
    sectionPlacements,
    updateSidebarOrder,
  ]);
  // Stryker restore all

  const renderChannelItem = (channel: Channel) => (
    <ChannelRow
      key={channel.id}
      channel={channel}
      selected={isChannelSelected(channel.id)}
      menuOpen={ctxMenu?.type === "channel" && ctxMenu.id === channel.id}
      onSelect={handleSelectChannel}
      onContextMenu={openCtxMenu}
      makeLongPress={makeLongPressHandlers}
      serverPublicPageLive={serverPublicPageLive}
    />
  );

  /** Render agent as a DM conversation item (Chat tab) — navigates to /dm/:dmId */
  const renderAgentDmItem = (agent: typeof agents[0]) => {
    const dmId = agentDmChannelId[agent.id];
    const dm = agentDmChannelByAgentId[agent.id];
    return (
      <AgentDmRow
        key={agent.id}
        agent={agent}
        dmId={dmId}
        dm={dm}
        selected={dmId ? isDmSelected(dmId) : false}
        menuOpen={ctxMenu?.type === "agent" && ctxMenu.id === agent.id}
        onSelect={handleSelectAgentDm}
        onContextMenu={openCtxMenu}
        makeLongPress={makeLongPressHandlers}
      />
    );
  };

  const renderDmItem = (dm: Channel) => {
    const isAgent = dm.peerType === "agent";
    const dmCtxTarget = getSidebarDmContextTarget(dm, dmContextPeerIds);
    const matchingAgent = isAgent && dm.peerId ? agentById.get(dm.peerId) : undefined;
    const agentProfile = matchingAgent ? resolveAgentDmProfileSource(matchingAgent, dm) : null;
    const displayName = agentProfile
      ? agentProfile.displayName
      : dm.peerDisplayName || dm.peerName || dm.name;
    const description = isAgent
      ? agentProfile?.description ?? null
      : dm.peerDescription ?? null;
    const avatarUrl = agentProfile ? agentProfile.avatarUrl : dm.peerAvatarUrl ?? null;
    return (
      <DmRow
        key={dm.id}
        dm={dm}
        isAgent={isAgent}
        peerId={dm.peerId ?? null}
        displayName={displayName}
        description={description}
        avatarUrl={avatarUrl}
        selected={isDmSelected(dm.id)}
        menuOpen={ctxMenu?.type === dmCtxTarget.type && ctxMenu.id === dmCtxTarget.id}
        ctxType={dmCtxTarget.type}
        ctxId={dmCtxTarget.id}
        onSelect={handleSelectDm}
        onContextMenu={openCtxMenu}
        makeLongPress={makeLongPressHandlers}
        agentRuntime={matchingAgent?.runtime ?? null}
        agentExternal={matchingAgent ? matchingAgent.external === true || isExternalAgentRuntime(matchingAgent.runtime) : false}
      />
    );
  };

  /** Render agent as an entity item (Members tab) — navigates to /agent/:agentId */
  // Stryker disable all: member-row interaction glue is contract-pinned and browser-smoke verified.
  const renderAgentItem = (agent: typeof agents[0]) => (
    <MemberAgentRow
      key={agent.id}
      agent={agent}
      selected={isAgentSelected(agent.id)}
      menuOpen={ctxMenu?.type === "member-agent" && ctxMenu.id === agent.id}
      onSelect={handleSelectAgent}
      onOpenDm={handleOpenAgentDm}
      onContextMenu={openCtxMenu}
      makeLongPress={makeLongPressHandlers}
    />
  );
  // Stryker restore all

  // Stryker disable all: pre-existing shared section-toggle glue is outside the workspace mutation corpus.
  const agentsExpanded = !collapsed.agents;
  // Stryker restore all

  // A row looks the same in every section it can be in (its home section,
  // Pinned, a custom section): the section never changes how it is drawn.
  const renderSidebarDndDisplayItem = (item: SidebarDndDisplayItem) => {
    switch (item.type) {
      case "channel":
        return renderChannelItem(item.channel);
      case "dm":
        return renderDmItem(item.dm);
      case "agent":
        return renderAgentDmItem(item.agent);
    }
  };

  const renderSidebarDndItem = (itemId: string, containerId: string) => {
    const item = sidebarDndDisplayItems.get(itemId);
    if (!item) return null;
    return (
      <SortableSidebarItem key={itemId} id={itemId} containerId={containerId}>
        {renderSidebarDndDisplayItem(item)}
      </SortableSidebarItem>
    );
  };

  const contextCustomSection = sectionCtxMenu?.section.startsWith("custom:")
    ? customSections.find((section) => section.id === sectionCtxMenu.section.slice("custom:".length)) ?? null
    : null;
  const sectionContextLabel = contextCustomSection?.name
    ?? (
      sectionCtxMenu && !sectionCtxMenu.section.startsWith("custom:")
        ? formatMessage({ id: SIDEBAR_SORT_SECTION_LABEL_ID[sectionCtxMenu.section as SidebarSortSection] })
        : "Section"
    );
  const contextMovableItem: SidebarMovableItem | null = (() => {
    if (!ctxMenu) return null;
    if (ctxMenu.type === "channel" || ctxMenu.type === "dm") return { kind: "channel", id: ctxMenu.id };
    if (ctxMenu.type === "human") {
      const dm = dmChannels.find((candidate) => candidate.peerType === "user" && candidate.peerId === ctxMenu.id);
      return dm ? { kind: "channel", id: dm.id } : null;
    }
    if (ctxMenu.type === "agent") {
      if (pinnedAgentIds.includes(ctxMenu.id) || customPlacedAgentIds.has(ctxMenu.id)) return { kind: "agent", id: ctxMenu.id };
      const dm = dmChannels.find((candidate) => candidate.peerType === "agent" && candidate.peerId === ctxMenu.id);
      return dm ? { kind: "channel", id: dm.id } : { kind: "agent", id: ctxMenu.id };
    }
    return null;
  })();
  const contextPlacement = contextMovableItem
    ? sectionPlacements.find((placement) => sidebarSectionItemKey(placement.kind, placement.id) === sidebarSectionItemKey(contextMovableItem.kind, contextMovableItem.id)) ?? null
    : null;
  const contextItemPinned = contextMovableItem?.kind === "channel"
    ? pinnedChannelIds.includes(contextMovableItem.id)
    : contextMovableItem?.kind === "agent" && pinnedAgentIds.includes(contextMovableItem.id);

  const renderReadToggleAction = (channelId: string, hasUnread: boolean, includeThreads = false) => (
    <SidebarReadToggleMenuItem
      channelId={channelId}
      hasUnread={hasUnread}
      includeThreads={includeThreads}
      onDone={clearCtxMenu}
    />
  );

  const closeServerMenu = useCallback(() => setShowServerMenu(false), []);
  // The phone workspace switcher hangs from the whole Home bar.
  const mobileHeadRef = useRef<HTMLDivElement | null>(null);
  const openFinderChannel = useCallback((channelId: string) => nav.toChannel(channelId), [nav]);
  const openFinderDm = useCallback((dmChannelId: string) => nav.toDm(dmChannelId), [nav]);
  const openFinderAgentDm = useCallback((agentId: string) => {
    void openDM(agentId).then((opened) => nav.toDm(opened.id));
  }, [nav, openDM]);
  const openFinderHumanDm = useCallback((userId: string) => {
    void openUserDM(userId).then((opened) => nav.toDm(opened.id));
  }, [nav, openUserDM]);
  const openSaved = useCallback(() => {
    if (mobileInline) trackNavEntrySelected("saved", "mobile_home_shortcuts", false);
    else trackNavEntrySelected("saved", "sidebar", location.pathname.endsWith("/saved"));
    nav.toSaved();
  }, [location.pathname, mobileInline, nav]);
  // Phone Home entries (Search, Activity).
  // Stryker disable next-line all: pre-existing mobile Search routing is outside the workspace mutation corpus.
  const openSearchEntry = useCallback(() => {
    trackNavEntrySelected("search", "mobile_home_shortcuts", false);
    nav.toSearch(undefined, { flushSync: true });
  }, [nav]);
  const openActivityEntry = useCallback((event: React.MouseEvent) => {
    if (event.detail >= 2) return;
    trackActivityOpen("sidebar");
    trackNavEntrySelected("activity", "mobile_home_shortcuts", false);
    nav.toThreadsInbox();
  }, [nav]);
  const openActivityEntryFirstUnread = useCallback(() => {
    // Land in the Activity surface and signal which row to scroll-to-top and
    // highlight. We deliberately do NOT open the right thread panel — keeping
    // the user in the inbox layer lets them scan other unread threads instead
    // of jumping straight into one.
    nav.toThreadsInbox();
    focusFirstUnreadInboxItem();
  }, [focusFirstUnreadInboxItem, nav]);
  const openMembersGraph = useCallback(() => navigate(`${pathBase}/members/graph`), [navigate, pathBase]);
  const openUsage = useCallback(() => navigate(`${pathBase}/usage`), [navigate, pathBase]);

  // Stryker disable all: pre-existing empty-computer state is outside the workspace mutation corpus.
  const emptyComputersContent = Object.keys(machineNames).length === 0
    ? machinesLoading ? (
      <SidebarRowsSkeleton rows={2} />
    ) : (
      <SidebarSectionDescription>{formatMessage({ id: "layout.sidebar.noComputersYet" })}</SidebarSectionDescription>
    )
    : null;
  // Stryker restore all

  // Dialog handlers. Each dialog only mounts while its state is set, so the
  // null guards below never fire in practice; they keep the callbacks total.
  const closeCreateChannelDialog = useCallback(() => setShowCreateChannel(false), []);
  const closeCreateJointChannelDialog = useCallback(() => setShowCreateJointChannel(false), []);
  const closeInviteHumanDialog = useCallback(() => setShowInviteHuman(false), []);
  const closeCreateExternalAgentDialog = useCallback(() => setShowCreateExternalAgent(false), []);
  const closeHandoffDialog = useCallback(() => setShowHandoff(false), []);
  const closeDeleteConfirm = useCallback(() => setDeleteConfirm(null), []);
  const confirmDelete = useCallback(async () => {
    if (deleteConfirm?.type !== "channel") return;
    await deleteChannel(deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteChannel, deleteConfirm]);
  const closeStopAgentConfirm = useCallback(() => setStopAgentConfirm(null), []);
  const confirmStopAgent = useCallback(async () => {
    if (stopAgentConfirm) await stopAgent(stopAgentConfirm.id);
  }, [stopAgent, stopAgentConfirm]);
  const closeResetAgentDialog = useCallback(() => setResetAgentTarget(null), []);
  const closeArchiveConfirm = useCallback(() => setArchiveConfirm(null), []);
  const confirmArchive = useCallback(async () => {
    if (archiveConfirm) await archiveChannel(archiveConfirm.id);
  }, [archiveChannel, archiveConfirm]);
  const closeSectionDialog = useCallback(() => setSectionDialog(null), []);
  const submitCreateSection = useCallback((value: { name: string; emoji: string | null }) => {
    if (sectionDialog?.mode === "create") createCustomSection(value, sectionDialog.moveItem);
  }, [createCustomSection, sectionDialog]);
  const submitEditSection = useCallback((value: { name: string; emoji: string | null }) => {
    if (sectionDialog?.mode === "edit") updateCustomSection(sectionDialog.section.id, value);
  }, [sectionDialog, updateCustomSection]);
  const closeDeleteSectionConfirm = useCallback(() => setDeleteSectionConfirm(null), []);
  const confirmDeleteSection = useCallback(() => {
    if (!deleteSectionConfirm) return;
    deleteCustomSection(deleteSectionConfirm.id);
    setDeleteSectionConfirm(null);
  }, [deleteCustomSection, deleteSectionConfirm]);

  // Section context-menu actions. The menu only renders while
  // `sectionCtxMenu` is set; each action reads the section it was opened for.
  const selectSectionSortMode = useCallback((mode: SidebarSortMode) => {
    if (!sectionCtxMenu) return;
    if (contextCustomSection) {
      void updateSidebarOrder({
        customSections: customSections.map((section) => section.id === contextCustomSection.id ? { ...section, sortMode: mode } : section),
      });
    } else if (sectionCtxMenu.section === "pinned") updatePinnedSortMode(mode);
    else if (sectionCtxMenu.section === "jointChannels") updateJointChannelSortMode(mode);
    else if (sectionCtxMenu.section === "channels") updateChannelSortMode(mode);
    else updateDmSortMode(mode);
    closeSectionCtx();
  }, [
    closeSectionCtx,
    contextCustomSection,
    customSections,
    sectionCtxMenu,
    updateChannelSortMode,
    updateDmSortMode,
    updateJointChannelSortMode,
    updatePinnedSortMode,
    updateSidebarOrder,
  ]);
  const toggleJoinedChannelsOnlyFromMenu = useCallback(() => {
    updateJoinedChannelsOnly(!joinedChannelsOnly);
    closeSectionCtx();
  }, [closeSectionCtx, joinedChannelsOnly, updateJoinedChannelsOnly]);
  const toggleHideEmptySectionsFromMenu = useCallback(() => {
    updateHideEmptySections(!hideEmptySections);
    closeSectionCtx();
  }, [closeSectionCtx, hideEmptySections, updateHideEmptySections]);
  const renameContextSection = useCallback(() => {
    if (!contextCustomSection) return;
    setSectionDialog({ mode: "edit", section: contextCustomSection });
    closeSectionCtx();
  }, [closeSectionCtx, contextCustomSection]);
  const createSectionFromSectionMenu = useCallback(() => {
    setSectionDialog({ mode: "create" });
    closeSectionCtx();
  }, [closeSectionCtx]);
  const deleteContextSection = useCallback(() => {
    if (!contextCustomSection) return;
    setDeleteSectionConfirm(contextCustomSection);
    closeSectionCtx();
  }, [closeSectionCtx, contextCustomSection]);

  // Sidebar surface context-menu actions.
  const createChannelFromSurfaceMenu = useCallback(() => {
    setShowCreateChannel(true);
    closeSidebarSurfaceCtx();
  }, [closeSidebarSurfaceCtx]);
  const createJointChannelFromSurfaceMenu = useCallback(() => {
    setShowCreateJointChannel(true);
    closeSidebarSurfaceCtx();
  }, [closeSidebarSurfaceCtx]);
  const createSectionFromSurfaceMenu = useCallback(() => {
    setSectionDialog({ mode: "create" });
    closeSidebarSurfaceCtx();
  }, [closeSidebarSurfaceCtx]);

  // Row context-menu targets and actions. Targets are resolved from the id the
  // menu was opened with; actions only run while the menu (and so its target)
  // is rendered.
  const ctxChannel = ctxMenu?.type === "channel" ? channels.find((c) => c.id === ctxMenu.id) : undefined;
  const ctxHumanDmChannel = ctxMenu?.type === "human"
    ? dmChannels.find((dm) => dm.peerType === "user" && dm.peerId === ctxMenu.id)
    : undefined;
  const ctxDmChannel = ctxMenu?.type === "dm" ? dmChannels.find((dm) => dm.id === ctxMenu.id) : undefined;
  const ctxAgent = ctxMenu?.type === "agent" || ctxMenu?.type === "member-agent"
    ? agents.find((a) => a.id === ctxMenu.id)
    : undefined;
  const ctxAgentDmChannelId = ctxMenu?.type === "agent" && ctxAgent ? agentDmChannelId[ctxAgent.id] : undefined;
  const ctxAgentIsOnline = ctxMenu?.type === "member-agent" && ctxAgent
    ? selectAgentDisplayState(useAgentStore.getState(), ctxAgent.id, ctxAgent).isOnline
    : false;
  const ctxDmIdToClose = ctxHumanDmChannel?.id ?? ctxDmChannel?.id ?? ctxAgentDmChannelId;

  const closeMoveToSectionMenuFromHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const menuItem = (event.target as Element).closest('[role="menuitem"]');
    if (menuItem && !moveToSectionTriggerRef.current?.contains(menuItem)) {
      setMoveToSectionMenuOpen(false);
    }
  }, []);
  const closeMoveToSectionMenuFromFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!moveToSectionTriggerRef.current?.contains(event.target)) {
      setMoveToSectionMenuOpen(false);
    }
  }, []);
  const openMoveToSectionMenu = useCallback(() => setMoveToSectionMenuOpen(true), []);
  const toggleContextChannelMute = useCallback(() => {
    if (!ctxChannel) return;
    void toggleChannelActivityMute(ctxChannel);
    setCtxMenu(null);
  }, [ctxChannel, toggleChannelActivityMute]);
  // Stryker disable all: pin behavior predates the Activity mute action and has separate coverage.
  const toggleContextChannelPin = useCallback(() => {
    if (!ctxMenu) return;
    togglePinChannel(ctxMenu.id);
    setCtxMenu(null);
  }, [ctxMenu, togglePinChannel]);
  // Stryker restore all
  const archiveContextChannel = useCallback(() => {
    if (!ctxMenu) return;
    setArchiveConfirm({ id: ctxMenu.id, name: ctxChannel?.name ?? "" });
    setCtxMenu(null);
  }, [ctxChannel, ctxMenu]);
  const toggleContextHumanPin = useCallback(() => {
    if (!ctxMenu) return;
    togglePinnedRef({ kind: "human", id: ctxMenu.id });
    setCtxMenu(null);
  }, [ctxMenu, togglePinnedRef]);
  const toggleContextDmPin = useCallback(() => {
    if (!ctxDmChannel) return;
    togglePinDm(ctxDmChannel);
    setCtxMenu(null);
  }, [ctxDmChannel, togglePinDm]);
  const toggleContextAgentPin = useCallback(() => {
    if (!ctxMenu) return;
    togglePinAgent(ctxMenu.id);
    setCtxMenu(null);
  }, [ctxMenu, togglePinAgent]);
  const closeContextDm = useCallback(() => {
    if (!ctxDmIdToClose) return;
    closeDm(ctxDmIdToClose);
    setCtxMenu(null);
  }, [closeDm, ctxDmIdToClose]);
  const messageContextHuman = useCallback(() => {
    if (!ctxMenu) return;
    setCtxMenu(null);
    void handleOpenHumanDm(ctxMenu.id);
  }, [ctxMenu, handleOpenHumanDm]);
  const messageContextAgent = useCallback(() => {
    if (!ctxAgent) return;
    setCtxMenu(null);
    void handleOpenAgentDm(ctxAgent.id);
  }, [ctxAgent, handleOpenAgentDm]);
  const toggleContextAgentRuntime = useCallback(() => {
    if (!ctxAgent) return;
    if (ctxAgentIsOnline) {
      setStopAgentConfirm({ id: ctxAgent.id, name: ctxAgent.displayName || ctxAgent.name });
    } else {
      void startAgent(ctxAgent.id);
    }
    setCtxMenu(null);
  }, [ctxAgent, ctxAgentIsOnline, startAgent]);
  const resetContextAgent = useCallback(() => {
    if (!ctxAgent) return;
    setResetAgentTarget({ id: ctxAgent.id, name: ctxAgent.displayName || ctxAgent.name });
    setCtxMenu(null);
  }, [ctxAgent]);

  // Move-to-section submenu actions.
  const moveToSectionMenuStyle = useMemo<React.CSSProperties>(() => ({
    left: moveToSectionMenuPosition?.x ?? 0,
    top: moveToSectionMenuPosition?.y ?? 0,
    visibility: moveToSectionMenuPosition ? "visible" : "hidden",
  }), [moveToSectionMenuPosition]);
  const moveContextItemToPinned = useCallback(() => {
    if (!contextMovableItem) return;
    moveItemToPinned(contextMovableItem);
    closeCtx();
  }, [closeCtx, contextMovableItem, moveItemToPinned]);
  const moveContextItemToSection = useCallback((sectionId: string) => {
    if (!contextMovableItem) return;
    moveItemToCustomSection(contextMovableItem, sectionId);
    closeCtx();
  }, [closeCtx, contextMovableItem, moveItemToCustomSection]);
  const createSectionWithContextItem = useCallback(() => {
    if (!contextMovableItem) return;
    setSectionDialog({ mode: "create", moveItem: contextMovableItem });
    closeCtx();
  }, [closeCtx, contextMovableItem]);
  const removeContextItemFromSection = useCallback(() => {
    if (!contextMovableItem) return;
    removeItemFromCustomSection(contextMovableItem);
    closeCtx();
  }, [closeCtx, contextMovableItem, removeItemFromCustomSection]);

  return (
    <>
      {/* Raft Design System › Sidebar / NavBar. Desktop: the cream sidebar
          (`.rf-side`) between the yellow rail and the white main column, a
          seam on its right. Phone tab roots (mobileInline): the frame's 56px
          top bar over a white paper list (yellow → cream → white). */}
      <SidebarRoot
        // Stryker disable next-line StringLiteral: Tailwind composition is presentation-only and browser-smoke verified.
        className={`relative flex h-full w-full flex-col font-sans text-foreground select-none ${mobileInline ? "bg-layer-canvas" : "border-r border-line-seam bg-layer-sidebar"}`}
        data-testid="sidebar-root"
      >
        {/* Phone tab-root NavBar, the DS "same as production" version: raft-ui's
            section head, which on a phone is the frame with a seam below and
            owns the edges (content on 16, the last 44px button 3px from the
            edge, mirroring a Back). No tab icon. Home shows only the workspace
            pill — the one label — then who is working and the bell; every
            other tab root writes its page name in the bar and has no pill. On
            desktop the switcher lives in the rail or the top bar. */}
        {mobileInline && (
          <PanelSectionHeader ref={mobileHeadRef}>
            {railMode === "chat" ? (
              <>
                {/* The switcher hangs under the whole bar, 8px in from each
                    side, as a raft-ui Popover kept on screen. */}
                <Popover open={showServerMenu} onOpenChange={setShowServerMenu}>
                  <PopoverTrigger
                    /* `.rf-ws--pill`: the workspace you are in is an ink tile
                       with yellow type, tilted -2°. In short windows (max-h:600)
                       the tile drops to plain text + chevron. */
                    render={<button type="button" className={MOBILE_WORKSPACE_PILL_CLASS} />}
                  >
                    {hasOtherServerUnread && (
                      <AttentionDot
                        aria-label={formatMessage({ id: "layout.sidebar.otherServersUnread" })}
                        size="lg"
                        className="absolute -right-1 -top-1"
                        title={formatMessage({ id: "layout.sidebar.otherServersUnread" })}
                      />
                    )}
                    <span className="min-w-0 max-w-[200px] truncate">{server?.name || formatMessage({ id: "layout.sidebar.serverFallbackName" })}</span>
                    <PublicPageGlobe live={serverPublicPageLive} size={14} />
                    <ChevronDown size={16} className="shrink-0" />
                  </PopoverTrigger>
                  <ServerSwitcherMenu
                    onClose={closeServerMenu}
                    serverUnreadCounts={serverUnreadCounts}
                    testId="mobile-server-switcher-menu"
                    navigationMode="replace-with-home"
                    anchor={mobileHeadRef}
                    sideOffset={4}
                    alignOffset={8}
                    className="w-[calc(var(--anchor-width)-16px)]"
                  />
                </Popover>
                <div className="min-w-0 flex-1" />
                {/* Who is working (AgentActivity `rf-working--count`); renders
                    nothing when nobody is, or the setting is off. */}
                <WorkingNowSummary variant="count" onFrame />
                {/* Notification Center entry — the permanent Bell on the Home
                    bar's right; only its attention pixel depends on whether
                    notifications exist. */}
                <PanelActions>
                  <NotificationTrigger flavor="mobile-navbar" />
                </PanelActions>
              </>
            ) : (
              <PanelHeaderContent>
                <PanelTitle>{railLabel}</PanelTitle>
              </PanelHeaderContent>
            )}
          </PanelSectionHeader>
        )}

        {/* Desktop sidebar head (`.rf-side__head`, raft-ui SidebarHeader): 56
            tall like the rail head and every panel head, so the seams line up;
            just the rail mode's name (the rail already carries the icon), and
            on Chat who is working right now on the right. With the top bar it
            is dropped. */}
        {!mobileInline && !hideTitle && (
          <SidebarHeader>
            <SidebarHeaderTitle className="min-w-0 flex-1">
              {railLabel}
            </SidebarHeaderTitle>
            {railMode === "chat" && <WorkingNowSummary variant="count" />}
          </SidebarHeader>
        )}

        {/* "Find a conversation…" jump box, pinned above the scroll surface.
            Chat rail only; name-based fuzzy jump over channels/DMs/agents/
            people — no message-content search, no keyboard shortcut. Electron
            desktop shell only (the web has none), so `isElectronDesktopShell()`
            gates the block. */}
        {railMode === "chat" && isElectronDesktopShell() && (
          <SidebarConversationFinder
            channels={channels}
            dmChannels={dmChannels}
            agents={agents}
            members={members}
            currentUserId={user?.id}
            onOpenChannel={openFinderChannel}
            onOpenDm={openFinderDm}
            onOpenAgentDm={openFinderAgentDm}
            onOpenHumanDm={openFinderHumanDm}
          />
        )}

        {/* Scrollable content, with the browser's native scrollbars. */}
        <div className="relative flex min-h-0 flex-1">
          <div
            ref={sidebarScrollRef}
            className={sidebarScrollClassName}
            data-testid="sidebar-scroll-surface"
            onContextMenu={railMode === "chat" ? openSidebarSurfaceCtxMenu : undefined}
          >
            {/* Keep a full-height inner surface without manufacturing phantom
                overflow; scrollbars should appear only for real overflow. */}
            <div className="min-h-full">
          {showSettingsRail ? (
            <SettingsSidebarList groups={settingsSidebarGroups} activeId={settingsTabFromPath} />
          ) : showComputersRail ? (
            <>
              {/* Computers surface — one row per computer (name, its mono run
                  label / version, presence pixel). Renders on both desktop
                  (dedicated Computers rail) and mobile (reached via the
                  Settings sub-nav → /computers). */}
              {/* Mobile-only back row — on mobile Computers is not a top-level
                  tab, it's a level-2 push under the Settings tab. iOS
                  NavigationView expects a back affordance at the top of every
                  pushed view, so render a "← Settings" row that pops back to
                  /settings (the Settings tab home). Desktop has its own
                  dedicated Computers rail so the back row would be wrong there. */}
              {mobileInline && (
                <button
                  type="button"
                  onClick={() => navigate(`${pathBase}/settings`)}
                  data-testid="computers-mobile-back"
                  className="mt-1 flex min-h-11 w-full items-center gap-1 rounded-control px-2 text-left font-sans text-subhead font-semibold text-foreground-muted outline-none transition-colors hover:bg-fill-pressed hover:text-foreground active:bg-fill-pressed focus-visible:shadow-focus"
                  aria-label={formatMessage({ id: "layout.sidebar.backToSettings" })}
                >
                  <ChevronLeft size={20} className="shrink-0" />
                  {formatMessage({ id: "layout.sidebar.headerSettings" })}
                </button>
              )}
              <RaftSidebarSectionHeader>
                {/* Not collapsible: the section title's type, without the button. */}
                <SidebarSectionDisclosure render={<div />} type={undefined}>
                  {formatMessage({ id: "layout.sidebar.computersSectionLabel" })} <SidebarSectionCount>{sidebarMachineIds.length}</SidebarSectionCount>
                </SidebarSectionDisclosure>
                {canRegisterMachines && (
                  <Tooltip content={formatMessage({ id: "layout.sidebar.addComputer" })}>
                  <SidebarSectionControl
                    type="button"
                    aria-label={formatMessage({ id: "layout.sidebar.addComputer" })}
                    onClick={openAddMachineDialog}
                  >
                    <Plus size={16} />
                  </SidebarSectionControl>
                  </Tooltip>
                )}
              </RaftSidebarSectionHeader>

              {sidebarMachineIds.map((machineId) => (
                <ComputerRow
                  key={machineId}
                  machineId={machineId}
                  selected={isMachineSelected(machineId)}
                  onSelect={handleSelectMachine}
                />
              ))}

              {emptyComputersContent}
            </>
          ) : showChatRail ? (
            <>
              {/* Desktop Search lives in the LeftRail. Mobile keeps Search under
                  Home so it does not become a separate bottom-tab destination.
                  Home's first rows are ListRow entries (Search, Activity,
                  Saved): no lines between them, and no "you are here" — the
                  phone shows the current page by pushing it, not in lists. */}
              {mobileInline && (
                <SidebarItem
                  data-testid="mobile-home-search-entry"
                  onClick={openSearchEntry}
                  className={SIDEBAR_ENTRY_ROW_CLASS}
                >
                  <Search size={20} className={SIDEBAR_ENTRY_ICON_CLASS} />
                  {formatMessage({ id: "layout.sidebar.search" })}
                </SidebarItem>
              )}

              {/* Activity entry. On mobile (no rail) it always lives here; on
                  desktop Activity lives on the LeftRail (LeftRail.tsx), so this
                  sidebar entry is mobile-only. Unread activity is the pink count
                  badge. */}
              {mobileInline && (
                <SidebarItem
                  onClick={openActivityEntry}
                  onDoubleClick={openActivityEntryFirstUnread}
                  className={SIDEBAR_ENTRY_ROW_CLASS}
                >
                  <Activity size={20} className={SIDEBAR_ENTRY_ICON_CLASS} />
                  {formatMessage({ id: "layout.sidebar.activity" })}
                  {(() => {
                    return activityUnreadCount !== undefined && activityUnreadCount > 0 ? (
                      <SidebarItemCount className="ml-auto">
                        {activityUnreadCount > 99 ? "99+" : activityUnreadCount}
                      </SidebarItemCount>
                    ) : null;
                  })()}
                </SidebarItem>
              )}

              {/* Tasks moved to its own LeftRail mode, removed from Chat sidebar. */}

              {/* Saved — a sidebar row on desktop (yellow while open), the third
                  Home entry on the phone; its count is the grey mono number. */}
              <SidebarItem
                active={!mobileInline && location.pathname.endsWith("/saved")}
                onClick={openSaved}
                className={mobileInline ? SIDEBAR_ENTRY_ROW_CLASS : sidebarItemClass(location.pathname.endsWith("/saved"))}
                data-testid="sidebar-saved-entry"
              >
                {mobileInline ? (
                  <Bookmark size={20} className={SIDEBAR_ENTRY_ICON_CLASS} />
                ) : (
                  <SidebarItemIcon><Bookmark /></SidebarItemIcon>
                )}
                {formatMessage({ id: "layout.sidebar.saved" })}
                <SavedNavCount total={savedTotal} />
              </SidebarItem>

              {(() => {
                // Stryker disable all: sidebar drag/drop render composition is covered by source contracts and browser/manual preview; command-runner DOM mutation tests cannot perform dnd-kit drags.
                const sidebarDragSections = (
              /* Stryker disable all: section-row event wiring and empty-state chrome are covered by rendered DOM plus the real-browser recording. */
              <DndContext
                sensors={dndSensors}
                collisionDetection={sidebarCollisionDetection}
                // Empty drag-only sections can mount after activation; remeasure
                // droppables deterministically instead of keeping pre-drag rects.
                measuring={SIDEBAR_DND_MEASURING}
                onDragStart={handleSidebarDragStart}
                onDragOver={handleSidebarDragOver}
                onDragCancel={resetSidebarDnd}
                onDragEnd={handleSidebarDragEnd}
              >
              <SidebarDndProjectionMeasurements projection={sidebarDndProjection} />
              {import.meta.env.VITE_E2E === "true" ? <SidebarDndE2EProbe /> : null}
              <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col" data-testid="sidebar-section-list">
              {/* Pinned */}
              {!isEmptySectionHidden(sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID].length, SIDEBAR_PINNED_CONTAINER_ID, true) && (
              <SortableSidebarSection id="system:pinned" testId="sidebar-section-block-pinned" order={sectionOrder.indexOf("system:pinned")}>
                  <SidebarSectionHeader section="pinned" onOpenContextMenu={openSectionCtxMenu}>
                    <SidebarSectionToggle
                      sectionKey="pinned"
                      onToggleSection={toggleSection}
                      aria-expanded={!collapsed.pinned}
                      aria-controls="sidebar-section-pinned"
                      data-testid="sidebar-section-toggle-pinned"
                    >
                      <SidebarSectionChevronIcon open={!collapsed.pinned} />
                      {formatMessage({ id: "layout.sidebar.pinned" })}
                      <SidebarSectionCount>
                        {sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID].length}
                      </SidebarSectionCount>
                      {collapsed.pinned && unreadFlags.pinned && (
                        <AttentionDot size="lg" className="ml-1" />
                      )}
                    </SidebarSectionToggle>
                    <div className="flex shrink-0 items-center gap-1">
                      {renderSortMenu("pinned", pinnedSortMode, updatePinnedSortMode)}
                    </div>
                  </SidebarSectionHeader>

                  <div id="sidebar-section-pinned" hidden={collapsed.pinned}>
                    {!collapsed.pinned && (
                      <SidebarDndContainer
                        id={SIDEBAR_PINNED_CONTAINER_ID}
                        kind="pinned"
                        manual={pinnedManualSort}
                        itemIds={sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID]}
                        empty={sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID].length === 0}
                      >
                        {sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID].length > 0 ? (
                            <>{sidebarDndCurrentProjection[SIDEBAR_PINNED_CONTAINER_ID]
                              .map((itemId) => renderSidebarDndItem(itemId, SIDEBAR_PINNED_CONTAINER_ID))}</>
                          ) : (
                            <SidebarSectionDescription
                              data-testid="sidebar-pinned-empty-hint"
                              tone="subtle"
                              className="mb-1 min-h-9 py-1.5 transition-colors"
                            >
                              <span className="block whitespace-normal break-words">
                                {formatMessage({ id: "layout.sidebar.pinnedEmptyHint" })}
                              </span>
                            </SidebarSectionDescription>
                          )
                        }
                      </SidebarDndContainer>
                    )}
                  </div>
                </SortableSidebarSection>
              )}

              {customSections
                .slice()
                .sort((a, b) => sectionOrder.indexOf(a.id) - sectionOrder.indexOf(b.id))
                .map((section) => {
                  const containerId = sidebarCustomContainerId(section.id);
                  const projectedItemIds = sidebarDndCurrentProjection[containerId] ?? EMPTY_SIDEBAR_ITEM_IDS;
                  const collapsedCustom = collapsedCustomSections[section.id] === true;
                  return (
                    <SortableSidebarSection key={section.id} id={section.id} testId={`sidebar-custom-section-${section.id}`} order={sectionOrder.indexOf(section.id)}>
                      <SidebarSectionHeader section={`custom:${section.id}`} onOpenContextMenu={openSectionCtxMenu}>
                        <SidebarSectionToggle
                          sectionKey={section.id}
                          onToggleSection={toggleCustomSection}
                          aria-expanded={!collapsedCustom}
                        >
                          <SidebarSectionChevronIcon open={!collapsedCustom} />
                          {section.emoji && <span aria-hidden>{section.emoji}</span>}
                          <span className="truncate">{section.name}</span>
                          <SidebarSectionCount>{projectedItemIds.length}</SidebarSectionCount>
                          {collapsedCustom && customUnreadSectionIdSet.has(section.id) && <AttentionDot size="lg" className="ml-1" />}
                        </SidebarSectionToggle>
                      </SidebarSectionHeader>
                      <div hidden={collapsedCustom}>
                        <SidebarDndContainer
                          id={containerId}
                          kind="custom"
                          manual={section.sortMode === "manual"}
                          itemIds={projectedItemIds}
                          empty={projectedItemIds.length === 0}
                        >
                          {projectedItemIds.length === 0 ? (
                            <SidebarSectionDescription tone="subtle" className="py-1">
                              {formatMessage({ id: "layout.sidebar.noConversations" })}
                            </SidebarSectionDescription>
                          ) : (
                            <>{projectedItemIds.map((itemId) => renderSidebarDndItem(itemId, containerId))}</>
                          )}
                        </SidebarDndContainer>
                      </div>
                    </SortableSidebarSection>
                  );
                })}

              {/* Joint Channels */}
              {!isEmptySectionHidden(sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID].length, SIDEBAR_JOINT_CHANNELS_CONTAINER_ID, true) && (
              <SortableSidebarSection id="system:joint" testId="sidebar-section-block-joint" order={sectionOrder.indexOf("system:joint")}>
                  <SidebarSectionHeader section="jointChannels" onOpenContextMenu={openSectionCtxMenu}>
                    <SidebarSectionToggle
                      sectionKey="jointChannels"
                      onToggleSection={toggleSection}
                      aria-expanded={!collapsed.jointChannels}
                      aria-controls="sidebar-section-joint-channels"
                      data-testid="sidebar-section-toggle-joint-channels"
                    >
                      <SidebarSectionChevronIcon open={!collapsed.jointChannels} />
                      <span className="truncate">{formatMessage({ id: "layout.sidebar.jointChannels" })}</span>
                      <SidebarSectionCount>
                        {sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID].length}
                      </SidebarSectionCount>
                      {collapsed.jointChannels && unreadFlags.joint && (
                        <AttentionDot size="lg" className="ml-1" />
                      )}
                    </SidebarSectionToggle>
                    <div className="flex shrink-0 items-center gap-1">
                      {renderSortMenu("jointChannels", jointChannelSortMode, updateJointChannelSortMode)}
                      {renderSectionAddButton("jointChannels")}
                    </div>
                  </SidebarSectionHeader>

                  <div id="sidebar-section-joint-channels" hidden={collapsed.jointChannels}>
                    {!collapsed.jointChannels && (
                      <SidebarDndContainer
                        id={SIDEBAR_JOINT_CHANNELS_CONTAINER_ID}
                        kind="jointChannels"
                        manual={jointChannelManualSort}
                        itemIds={sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID]}
                        empty={sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID].length === 0}
                      >
                        {sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID].length === 0 ? (
                          channelsLoading ? (
                            <SidebarRowsSkeleton rows={2} />
                          ) : (
                            <SidebarSectionDescription>{formatMessage({ id: "layout.sidebar.jointChannelsEmpty" })}</SidebarSectionDescription>
                          )
                        ) : (
                          <>{sidebarDndCurrentProjection[SIDEBAR_JOINT_CHANNELS_CONTAINER_ID]
                            .map((itemId) => renderSidebarDndItem(itemId, SIDEBAR_JOINT_CHANNELS_CONTAINER_ID))}</>
                        )}
                      </SidebarDndContainer>
                    )}
                  </div>
              </SortableSidebarSection>
              )}

              {/* Channels */}
              <SortableSidebarSection id="system:channels" testId="sidebar-section-block-channels" order={sectionOrder.indexOf("system:channels")}>
              <SidebarSectionHeader section="channels" onOpenContextMenu={openSectionCtxMenu}>
                <SidebarSectionToggle
                  sectionKey="channels"
                      onToggleSection={toggleSection}
                  aria-expanded={!collapsed.channels}
                  aria-controls="sidebar-section-channels"
                  data-testid="sidebar-section-toggle-channels"
                >
                  <SidebarSectionChevronIcon open={!collapsed.channels} />
                  <span className="truncate">{formatMessage({ id: "layout.sidebar.channels" })}</span>
                  <SidebarSectionCount>
                    {sidebarDndCurrentProjection[SIDEBAR_CHANNELS_CONTAINER_ID].length}
                  </SidebarSectionCount>
                  {collapsed.channels && unreadFlags.channels && (
                    <AttentionDot size="lg" className="ml-1" data-testid="sidebar-section-unread-dot-channels" />
                  )}
                </SidebarSectionToggle>
                <div className="flex shrink-0 items-center gap-1">
                  {renderSortMenu("channels", channelSortMode, updateChannelSortMode)}
                  {renderSectionAddButton(
                    // Stryker disable next-line StringLiteral: the helper's non-joint branch intentionally treats every value other than jointChannels as a regular channel.
                    "channels",
                  )}
                </div>
              </SidebarSectionHeader>

              <div id="sidebar-section-channels" hidden={collapsed.channels}>
                {!collapsed.channels && (
                  <SidebarDndContainer
                    id={SIDEBAR_CHANNELS_CONTAINER_ID}
                    kind="channels"
                    manual={channelManualSort}
                    itemIds={sidebarDndCurrentProjection[SIDEBAR_CHANNELS_CONTAINER_ID]}
                    empty={sidebarDndCurrentProjection[SIDEBAR_CHANNELS_CONTAINER_ID].length === 0}
                  >
                    <>{sidebarDndCurrentProjection[SIDEBAR_CHANNELS_CONTAINER_ID]
                      .map((itemId) => renderSidebarDndItem(itemId, SIDEBAR_CHANNELS_CONTAINER_ID))}</>
                    {shouldShowSidebarChannelEmptyState(fallbackRegularChannels) && (
                      channelsLoading ? (
                        <SidebarRowsSkeleton />
                      ) : (
                        <SidebarSectionDescription>
                          {joinedChannelsOnly ? formatMessage({ id: "layout.sidebar.noJoinedChannels" }) : formatMessage({ id: "layout.sidebar.noChannelsYet" })}
                        </SidebarSectionDescription>
                      )
                    )}
                  </SidebarDndContainer>
                )}
              </div>
              {/* Stryker restore all */}
              </SortableSidebarSection>

              {/* Direct Messages — show open DMs, auto-reopen on unread */}
              {/* Stryker disable all: pre-existing DM ordering and section chrome are outside the workspace mutation corpus. */}
                {!isEmptySectionHidden(sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID].length, SIDEBAR_DMS_CONTAINER_ID) && (
                <SortableSidebarSection id="system:dms" testId="sidebar-section-block-dms" order={sectionOrder.indexOf("system:dms")}>
                  <SidebarSectionHeader section="dms" onOpenContextMenu={openSectionCtxMenu}>
                    <SidebarSectionToggle
                      sectionKey="agents"
                      onToggleSection={toggleSection}
                      aria-expanded={agentsExpanded}
                      aria-controls="sidebar-section-direct-messages"
                      data-testid="sidebar-section-toggle-dms"
                    >
                      <SidebarSectionChevronIcon open={!collapsed.agents} />
                      <span className="truncate">{formatMessage({ id: "layout.sidebar.directMessages" })}</span>
                  <SidebarSectionCount>
                        {sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID].length}
                      </SidebarSectionCount>
                      {collapsed.agents && unreadFlags.dms && (
                        <AttentionDot size="lg" className="ml-1" />
                      )}
                    </SidebarSectionToggle>
                    <div className="flex shrink-0 items-center gap-1">
                      {renderSortMenu("dms", dmSortMode, updateDmSortMode)}
                    </div>
                  </SidebarSectionHeader>

                  <div id="sidebar-section-direct-messages" hidden={collapsed.agents}>
                    {!collapsed.agents && (
                      <SidebarDndContainer
                        id={SIDEBAR_DMS_CONTAINER_ID}
                        kind="dms"
                        manual={dmManualSort}
                        itemIds={sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID]}
                        empty={sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID].length === 0}
                      >
                        {sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID].length > 0 ? (
                          <>{sidebarDndCurrentProjection[SIDEBAR_DMS_CONTAINER_ID]
                            .map((itemId) => renderSidebarDndItem(itemId, SIDEBAR_DMS_CONTAINER_ID))}</>
                        ) : channelsLoading ? (
                          <SidebarRowsSkeleton rows={3} />
                        ) : null}
                      </SidebarDndContainer>
                    )}
                  </div>
                </SortableSidebarSection>
                )}
                {/* Stryker restore all */}
              </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {sidebarDndActiveId && sidebarDndDisplayItems.get(sidebarDndActiveId) ? (
                  <div
                    data-testid="sidebar-drag-overlay"
                    className="max-w-72 truncate rounded-control bg-layer-popover px-2.5 py-2 font-sans text-subhead font-medium text-foreground shadow-float ring-1 ring-line-seam"
                  >
                    {sidebarDndDisplayItems.get(sidebarDndActiveId)!.label}
                  </div>
                ) : null}
              </DragOverlay>
              </DndContext>
                );
                // Stryker restore all
                return sidebarDragSections;
              })()}
            </>
          ) : (
            <>
              {/* People tab: Agents, Humans, Computers */}
              {mobileInline && server?.role !== "guest" && <SidebarItem onClick={openUsage} className="text-left">
                <SidebarItemIcon><ChartNoAxesCombined /></SidebarItemIcon>
                {formatMessage({ id: "layout.leftRail.tabUsage" })}
              </SidebarItem>}
              <SidebarItem
                active={location.pathname === `${pathBase}/members/graph`}
                onClick={openMembersGraph}
                className={`${sidebarItemClass(location.pathname === `${pathBase}/members/graph`)} text-left`}
              >
                <SidebarItemIcon><GitBranch /></SidebarItemIcon>
                {formatMessage({ id: "layout.sidebar.graph" })}
              </SidebarItem>

              {/* Agents */}
              <RaftSidebarSectionHeader>
                <SidebarSectionToggle
                  sectionKey="agents"
                  onToggleSection={toggleSection}
                  aria-expanded={!collapsed.agents}
                >
                  <SidebarSectionChevronIcon open={!collapsed.agents} />
                  {formatMessage({ id: "layout.sidebar.agents" })}
                  <SidebarSectionCount>{agents.length}</SidebarSectionCount>
                </SidebarSectionToggle>
                {renderAgentActionMenu()}
              </RaftSidebarSectionHeader>

              {!collapsed.agents && (
                <>
                  {agents.length === 0 ? (
                    agentsLoading ? (
                      <SidebarRowsSkeleton rows={3} />
                    ) : (
                      <SidebarSectionDescription>{formatMessage({ id: "layout.sidebar.noAgentsYet" })}</SidebarSectionDescription>
                    )
                  ) : (
                    (() => {
                      // Group agents by computer, preserving the order in which
                      // each computer first appears in the agents list.
                      const groups: { key: string; machineName: string; agents: typeof agents }[] = [];
                      const indexByKey = new Map<string, number>();
                      for (const agent of agents) {
                        // A cloud agent has no computer by design; it gets its own group
                        // instead of "no computer". `hostedRuntime` reaches managers only,
                        // so other viewers still see it in the no-computer group.
                        const cloud = !agent.machineId && Boolean(agent.hostedRuntime);
                        const key = agent.machineId ?? (cloud ? "__cloud__" : "__no_machine__");
                        let idx = indexByKey.get(key);
                        if (idx === undefined) {
                          idx = groups.length;
                          indexByKey.set(key, idx);
                          const machineName = agent.machineId ? machineNames[agent.machineId] : null;
                          groups.push({
                            key,
                            machineName: machineName ?? formatMessage({ id: cloud ? "layout.sidebar.cloudAgentGroupLabel" : "layout.sidebar.noMachineGroupLabel" }),
                            agents: [],
                          });
                        }
                        groups[idx].agents.push(agent);
                      }
                      // Stryker disable all: grouped member-row projection is browser-smoke verified.
                      return groups.map((group) => {
                        const groupCollapsed = collapsedAgentMachineGroups[group.key] === true;
                        return (
                          <div key={group.key}>
                            <button
                              type="button"
                              onClick={() => toggleAgentMachineGroup(group.key)}
                              aria-expanded={!groupCollapsed}
                              data-testid={`sidebar-agent-machine-group-toggle-${group.key}`}
                              className="mt-1.5 mb-0.5 flex w-full items-center gap-1.5 rounded-sticker px-2 text-left font-mono text-mono-meta text-foreground-hint outline-none select-none transition-colors hover:text-foreground-muted focus-visible:shadow-focus"
                            >
                              <ChevronRight
                                size={12}
                                className={`shrink-0 transition-transform ${groupCollapsed ? "" : "rotate-90"}`}
                              />
                              <Monitor size={12} className="shrink-0" />
                              <span className="truncate">{group.machineName}</span>
                              <span>{group.agents.length}</span>
                            </button>
                            {!groupCollapsed && group.agents.map((agent) => renderAgentItem(agent))}
                          </div>
                        );
                      });
                      // Stryker restore all
                    })()
                  )}
                </>
              )}

              {/* Humans */}
              {/* Stryker disable all: rail composition is browser-smoke verified. */}
              {!hideHumansFromMembers && (
                <>
                  <RaftSidebarSectionHeader>
                    <SidebarSectionToggle
                      sectionKey="humans"
                      onToggleSection={toggleSection}
                      aria-expanded={!collapsed.humans}
                      data-testid="sidebar-section-toggle-humans"
                    >
                      <SidebarSectionChevronIcon open={!collapsed.humans} />
                      {formatMessage({ id: "layout.sidebar.humans" })}
                      <SidebarSectionCount>{members.length}</SidebarSectionCount>
                    </SidebarSectionToggle>
                    {canInviteMembers && (
                      <div className="relative">
                        <Tooltip content={formatMessage({ id: "layout.sidebar.inviteHuman" })}>
                        <SidebarSectionControl
                          type="button"
                          aria-label={formatMessage({ id: "layout.sidebar.inviteHuman" })}
                          onClick={openInviteHumanDialog}
                        >
                          <Plus size={16} />
                        </SidebarSectionControl>
                        </Tooltip>
                      </div>
                    )}
                  </RaftSidebarSectionHeader>

                  {!collapsed.humans && (
                    <>
                      {membersLoadError ? (
                        <div className="px-2 font-sans text-footnote font-semibold text-warning-strong">{formatMessage({ id: "layout.sidebar.humansFailedToLoad" })}</div>
                      ) : members.length === 0 ? (
                        <SidebarSectionDescription>{formatMessage({ id: "layout.sidebar.noHumans" })}</SidebarSectionDescription>
                      ) : (
                        <>
                          {members.map((human) => (
                            <MemberHumanRow
                              key={human.userId}
                              human={human}
                              isSelf={human.userId === user?.id}
                              selected={isHumanSelected(human.userId)}
                              menuOpen={ctxMenu?.type === "member-human" && ctxMenu.id === human.userId}
                              onSelect={handleSelectHuman}
                              onOpenDm={handleOpenHumanDm}
                              onContextMenu={openCtxMenu}
                              makeLongPress={makeLongPressHandlers}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              {/* Stryker restore all */}

              {/* Computers are not listed here: on mobile they are reached
                  through the Settings sub-nav (→ /computers), and the desktop
                  rail owns the dedicated Computers surface. */}
            </>
          )}
            </div>
          </div>
        </div>

        {/* Nothing below the list: the live-activity bar moved to the head
            (WorkingNowSummary, DS AgentActivity), and account info, Settings,
            Release Notes and Logout live in the LeftRail's account-menu
            flyout (desktop) and the MobileTabBar's Settings tab (mobile). */}
      </SidebarRoot>

      {showCreateChannel && (
        <CreateChannelDialog
          onClose={closeCreateChannelDialog}
        />
      )}

      {showCreateJointChannel && canCreateJointChannel && (
        <CreateJointChannelDialog onClose={closeCreateJointChannelDialog} />
      )}

      {showInviteHuman && (
        <InviteHumanDialog onClose={closeInviteHumanDialog} />
      )}

      {showCreateExternalAgent && (
        <CreateAgentDialog
          external
          onClose={closeCreateExternalAgentDialog}
        />
      )}

      {showHandoff && (
        <HandoffDialog onClose={closeHandoffDialog} />
      )}

      {deleteConfirm?.type === "agent" && (() => {
        const agent = allAgents.find((candidate) => candidate.id === deleteConfirm.id);
        return agent ? <AgentArchiveDialog agent={agent} onClose={closeDeleteConfirm} /> : null;
      })()}
      {deleteConfirm?.type === "channel" && (() => {
        const label = {
          title: formatMessage({ id: "layout.sidebar.deleteChannelTitle" }),
          confirmLabel: formatMessage({ id: "layout.sidebar.deleteChannelTitle" }),
          message: formatMessage({ id: "layout.sidebar.deleteChannelMessage" }, { name: deleteConfirm.name }),
        };
        return (
          <ConfirmDialog
            chromeLocale="active"
            title={label.title}
            message={label.message}
            confirmLabel={label.confirmLabel}
            loadingLabel={formatMessage({ id: "layout.sidebar.deletingLabel" })}
            onConfirm={confirmDelete}
            onClose={closeDeleteConfirm}
          />
        );
      })()}

      {stopAgentConfirm && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "layout.sidebar.stopAgentTitle" })}
          message={formatMessage({ id: "layout.sidebar.stopAgentMessage" }, { name: stopAgentConfirm.name })}
          confirmLabel={formatMessage({ id: "layout.sidebar.stopAgentTitle" })}
          loadingLabel={formatMessage({ id: "layout.sidebar.stoppingLabel" })}
          confirmVariant="warning"
          onConfirm={confirmStopAgent}
          onClose={closeStopAgentConfirm}
        />
      )}

      {resetAgentTarget && (
        <ResetAgentDialog
          agentId={resetAgentTarget.id}
          agentName={resetAgentTarget.name}
          canFullReset={capabilities.resetAgentWorkspace}
          memberRuntimeOnly={currentRole === "member"}
          onClose={closeResetAgentDialog}
        />
      )}

      {archiveConfirm && (
        <ConfirmDialog
          chromeLocale="active"
          title={formatMessage({ id: "layout.sidebar.archiveChannelTitle" })}
          message={formatMessage({ id: "layout.sidebar.archiveChannelMessage" }, { name: archiveConfirm.name })}
          confirmLabel={formatMessage({ id: "layout.sidebar.archiveChannelTitle" })}
          loadingLabel={formatMessage({ id: "layout.sidebar.archivingLabel" })}
          confirmVariant="warning"
          onConfirm={confirmArchive}
          onClose={closeArchiveConfirm}
        />
      )}

      {sectionDialog?.mode === "create" && (
        <SidebarSectionDialog
          title={formatMessage({ id: "layout.sidebar.newSectionTitle" })}
          submitLabel={formatMessage({ id: "layout.sidebar.createSection" })}
          onSubmit={submitCreateSection}
          onClose={closeSectionDialog}
        />
      )}

      {sectionDialog?.mode === "edit" && (
        <SidebarSectionDialog
          title={formatMessage({ id: "layout.sidebar.editSectionTitle" })}
          initialName={sectionDialog.section.name}
          initialEmoji={sectionDialog.section.emoji ?? ""}
          submitLabel={formatMessage({ id: "layout.sidebar.saveSection" })}
          onSubmit={submitEditSection}
          onClose={closeSectionDialog}
        />
      )}

      {deleteSectionConfirm && (
        <ConfirmDialog
          title={formatMessage({ id: "layout.sidebar.deleteSection" })}
          message={formatMessage(
            { id: "layout.sidebar.deleteSectionMessage" },
            { name: deleteSectionConfirm.name },
          )}
          confirmLabel={formatMessage({ id: "layout.sidebar.deleteSection" })}
          loadingLabel={formatMessage({ id: "layout.sidebar.deletingLabel" })}
          onConfirm={confirmDeleteSection}
          onClose={closeDeleteSectionConfirm}
        />
      )}

      {sectionCtxMenu && createPortal(
        <>
          <DismissBackdrop onDismiss={closeSectionCtx} trapContextMenu />
          <ContextMenuPopup
            ref={sectionCtxMenuRef}
            role="menu"
            aria-label={formatMessage(
              { id: "layout.sidebar.sectionOptionsAria" },
              { section: sectionContextLabel },
            )}
            data-testid={`sidebar-section-context-menu-${sectionCtxMenu.section}`}
            className="fixed z-50 w-60 select-none"
            style={getSidebarContextMenuStyle(sectionCtxMenu)}
            onMouseDown={stopSidebarContextMenuPropagation}
          >
            {sectionCtxMenu.section === "channels" && canCreateChannel && (
              <>
                <MenuItem
                  icon={<Plus size={14} />}
                  onClick={openCreateChannelDialog}
                >
                  {formatMessage({ id: "layout.sidebar.createChannel" })}
                </MenuItem>
                <ContextMenuDivider />
              </>
            )}
            {sectionCtxMenu.section === "jointChannels" && canCreateJointChannel && (
              <>
                <MenuItem
                  icon={<GitBranch size={14} />}
                  onClick={openCreateJointChannelDialog}
                >
                  {formatMessage({ id: "layout.sidebar.createJointChannel" })}
                </MenuItem>
                <ContextMenuDivider />
              </>
            )}
            <ContextMenuLabel>
              {formatMessage({ id: "layout.sidebar.sortMenuTitle" })}
            </ContextMenuLabel>
            {SIDEBAR_SORT_MODES.map((mode) => {
              const currentMode = contextCustomSection?.sortMode ?? (sectionCtxMenu.section === "pinned" ? pinnedSortMode
                : sectionCtxMenu.section === "jointChannels" ? jointChannelSortMode
                  : sectionCtxMenu.section === "channels" ? channelSortMode
                    : dmSortMode);
              return (
                <SectionSortModeMenuItem
                  key={mode}
                  mode={mode}
                  checked={mode === currentMode}
                  onSelect={selectSectionSortMode}
                />
              );
            })}
            <ContextMenuDivider />
            <ContextMenuLabel>
              {formatMessage({ id: "layout.sidebar.displaySection" })}
            </ContextMenuLabel>
            {sectionCtxMenu.section === "channels" && (
              <MenuItem
                role="menuitemcheckbox"
                aria-checked={joinedChannelsOnly}
                trailing={joinedChannelsOnly ? <Check size={16} /> : null}
                className={joinedChannelsOnly ? "font-bold" : ""}
                onClick={toggleJoinedChannelsOnlyFromMenu}
              >
                {formatMessage({ id: "layout.sidebar.showJoinedChannelsOnly" })}
              </MenuItem>
            )}
            <MenuItem
              role="menuitemcheckbox"
              aria-checked={hideEmptySections}
              trailing={hideEmptySections ? <Check size={16} /> : null}
              className={hideEmptySections ? "font-bold" : ""}
              onClick={toggleHideEmptySectionsFromMenu}
            >
              {formatMessage({ id: "layout.sidebar.hideEmptySections" })}
            </MenuItem>
            <ContextMenuDivider />
            {contextCustomSection && (
              <>
                <MenuItem
                  icon={<Pencil size={14} />}
                  onClick={renameContextSection}
                >
                  {formatMessage({ id: "layout.sidebar.renameSection" })}
                </MenuItem>
              </>
            )}
            <MenuItem
              icon={<FolderPlus size={14} />}
              onClick={createSectionFromSectionMenu}
            >
              {formatMessage({ id: "layout.sidebar.newSectionMenu" })}
            </MenuItem>
            {contextCustomSection && (
              <>
                <ContextMenuDivider />
                <MenuItem
                  icon={<Trash2 size={14} />}
                  className="text-danger-strong"
                  onClick={deleteContextSection}
                >
                  {formatMessage({ id: "layout.sidebar.deleteSection" })}
                </MenuItem>
              </>
            )}
          </ContextMenuPopup>
        </>,
        document.body,
      )}

      {sidebarSurfaceCtxMenu && createPortal(
        <>
          <DismissBackdrop onDismiss={closeSidebarSurfaceCtx} trapContextMenu />
          <ContextMenuPopup
            ref={sidebarSurfaceCtxMenuRef}
            role="menu"
            aria-label={formatMessage({ id: "layout.sidebar.sidebarOptionsAria" })}
            data-testid="sidebar-surface-context-menu"
            className="fixed z-50 w-60 select-none"
            style={getSidebarContextMenuStyle(sidebarSurfaceCtxMenu)}
            onMouseDown={stopSidebarContextMenuPropagation}
          >
            {canManageServer && (
              <MenuItem
                icon={<Plus size={14} />}
                onClick={createChannelFromSurfaceMenu}
              >
                {formatMessage({ id: "layout.sidebar.createChannel" })}
              </MenuItem>
            )}
            {canCreateJointChannel && (
              <MenuItem
                icon={<GitBranch size={14} />}
                onClick={createJointChannelFromSurfaceMenu}
              >
                {formatMessage({ id: "layout.sidebar.createJointChannel" })}
              </MenuItem>
            )}
            {(canManageServer || canCreateJointChannel) && <ContextMenuDivider />}
            <MenuItem
              icon={<FolderPlus size={14} />}
              onClick={createSectionFromSurfaceMenu}
            >
              {formatMessage({ id: "layout.sidebar.newSectionMenu" })}
            </MenuItem>
          </ContextMenuPopup>
        </>,
        document.body,
      )}

      {/* Context menu — portal to body to escape sidebar transform containment */}
      {ctxMenu && createPortal(
        <>
          {/* Outside-click overlay. onClick (not onMouseDown) so the synthetic
              mousedown after a long-press touchend doesn't close it instantly.
              Same pattern as MessageItem context menu. */}
          <DismissBackdrop onDismiss={closeCtx} trapContextMenu />
          {/* Phantom-click shield for iOS PWA. See ctxMenuClickShielded. */}
          {ctxMenuClickShielded && (
            <DismissBackdrop onDismiss={closeCtx} zIndex={60} stopPropagation />
          )}
          <ContextMenuPopup
            ref={ctxMenuRef}
            className="fixed z-50 max-h-[calc(100vh-16px)] w-60 overflow-y-auto select-none"
            style={getSidebarContextMenuStyle(ctxMenu)}
            onMouseDown={stopSidebarContextMenuPropagation}
            onTouchStart={stopSidebarContextMenuPropagation}
            onMouseOver={closeMoveToSectionMenuFromHover}
            onFocus={closeMoveToSectionMenuFromFocus}
          >
          {contextMovableItem && (
            <>
              <div ref={moveToSectionTriggerRef}>
                <MenuItem
                  icon={<FolderInput size={14} />}
                  aria-haspopup="menu"
                  aria-expanded={moveToSectionMenuOpen}
                  trailing={<ChevronRight size={14} />}
                  onMouseEnter={openMoveToSectionMenu}
                  onClick={openMoveToSectionMenu}
                >
                  {formatMessage({ id: "layout.sidebar.moveToSection" })}
                </MenuItem>
              </div>
              <ContextMenuDivider />
            </>
          )}
          {ctxMenu.type === "channel" && (() => {
            const channel = ctxChannel;
            const canToggleChannelMute = canToggleActivityMute(channel);
            // Stryker disable all: unsupported and stale rows are covered by DOM tests; mutating this narrowing enters an invalid undefined-channel click path that the React oracle cannot terminate.
            const activityMuteAction = canToggleChannelMute && channel ? (
              <MenuItem
                icon={channel.activityMuted === true ? <Bell size={14} /> : <BellOff size={14} />}
                onClick={toggleContextChannelMute}
              >
                {channel.activityMuted === true
                  ? formatMessage({ id: "layout.sidebar.unmute" })
                  : formatMessage({ id: "layout.sidebar.mute" })}
              </MenuItem>
            ) : null;
            // Stryker restore all
            const isProtected = channel?.name === "all";
            const hasUnread = (useMessageStore.getState().unreadCounts[ctxMenu.id] || 0) > 0;
            const isPinned = hasSidebarPinnedRef(pinnedRefs, { kind: "channel", id: ctxMenu.id });
            // Stryker disable all: joint-channel archive suppression is pinned by a DOM context-menu test; generated JSX branch mutants time out under the command runner.
            const canArchiveChannel = !!channel
              && (channel.channelCapabilities?.archiveChannels ?? capabilities.archiveChannels)
              && !isProtected
              && channel.type !== "joint"
              && !channel.archivedAt;
            // Stryker restore all
            return (
              <>
                {renderReadToggleAction(ctxMenu.id, hasUnread, channel?.joined === true)}
                <ChannelPinMenuItem
                  isPinned={isPinned}
                  onToggle={toggleContextChannelPin}
                  pinLabel={formatMessage({ id: "layout.sidebar.pin" })}
                  unpinLabel={formatMessage({ id: "layout.sidebar.unpin" })}
                />
                {activityMuteAction}
                {canArchiveChannel && (
                  // Stryker disable all: archive action is pre-existing context-menu behavior; this slice only changes pinned row wrapping and drag transform.
                  <>
                    <ContextMenuDivider />
                    <MenuItem
                      icon={<Archive size={14} />}
                      onClick={archiveContextChannel}
                    >
                      {formatMessage({ id: "layout.sidebar.archive" })}
                    </MenuItem>
                  </>
                  // Stryker restore all
                )}
              </>
            );
          })()}

          {(() => {
            // Stryker disable all: human pin menu portal branch is covered by focused DOM/manual preview; generated portal mutants are equivalent to inaccessible menu states in this corpus.
            const humanMenu = ctxMenu.type === "human" ? (() => {
            // Resolve this menu's identity from the id it was opened with, not
            // from the member row. Every action below needs the DM entity and
            // that id; the member row is only where the id used to come from.
            // Keying on `members` meant a background refresh that evicts the
            // peer unmounted the whole open menu, detaching the item the user
            // was mid-click on — measured as the cause of the
            // removed-dm-menu-actions flake. A remaining DM may outlive the
            // membership row, so only its absence should close the menu.
            const humanDmChannel = ctxHumanDmChannel;
            if (!humanDmChannel) return null;
            const hasUnread = (useMessageStore.getState().unreadCounts[humanDmChannel.id] || 0) > 0;
            const isPinned = hasSidebarPinnedRef(pinnedRefs, { kind: "human", id: ctxMenu.id });
            return (
              <>
                {renderReadToggleAction(humanDmChannel.id, hasUnread)}
                <MenuItem
                  icon={isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  onClick={toggleContextHumanPin}
                >
                  {isPinned ? formatMessage({ id: "layout.sidebar.unpin" }) : formatMessage({ id: "layout.sidebar.pin" })}
                </MenuItem>
                <ContextMenuDivider />
                <MenuItem
                  icon={<X size={14} />}
                  onClick={closeContextDm}
                >
                  {formatMessage({ id: "layout.sidebar.closeChat" })}
                </MenuItem>
              </>
            );
            })() : null;
            // Stryker restore all
            return humanMenu;
          })()}

          {(() => {
            // Stryker disable all: DM pin menu portal branch is covered by focused DOM/manual preview; generated portal mutants are equivalent to inaccessible menu states in this corpus.
            const directMessageMenu = ctxMenu.type === "dm" ? (() => {
            const dmChannel = ctxDmChannel;
            if (!dmChannel) return null;
            const hasUnread = (useMessageStore.getState().unreadCounts[dmChannel.id] || 0) > 0;
            const dmPinnedRef = pinnedRefForDmChannel(dmChannel);
            const isPinned = dmPinnedRef ? hasSidebarPinnedRef(pinnedRefs, dmPinnedRef) : false;
            const dmMenu = (
              <>
                {renderReadToggleAction(dmChannel.id, hasUnread)}
                {dmPinnedRef && (
                  <MenuItem
                    icon={isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                    onClick={toggleContextDmPin}
                  >
                    {isPinned ? formatMessage({ id: "layout.sidebar.unpin" }) : formatMessage({ id: "layout.sidebar.pin" })}
                  </MenuItem>
                )}
                <ContextMenuDivider />
                <MenuItem
                  icon={<X size={14} />}
                  onClick={closeContextDm}
                >
                  {formatMessage({ id: "layout.sidebar.closeChat" })}
                </MenuItem>
              </>
            );
            return dmMenu;
            })() : null;
            // Stryker restore all
            return directMessageMenu;
          })()}
          {/* Stryker restore all */}

          {ctxMenu.type === "member-human" && (() => {
            const human = members.find((m) => m.userId === ctxMenu.id);
            if (!human) return null;
            return (
              <MenuItem
                icon={<DirectMessageIcon width={14} height={14} />}
                onClick={messageContextHuman}
              >
                {formatMessage({ id: "layout.sidebar.message" })}
              </MenuItem>
            );
          })()}

          {ctxMenu.type === "member-agent" && (() => {
            const agent = ctxAgent;
            if (!agent) return null;
            const isOnline = ctxAgentIsOnline;
            // External agents have no managed runtime: no Start/Stop/Reset.
            const isExternalAgent = agent.external === true || isExternalAgentRuntime(agent.runtime);
            return (
              <>
                <MenuItem
                  icon={<DirectMessageIcon width={14} height={14} />}
                  onClick={messageContextAgent}
                >
                  {formatMessage({ id: "layout.sidebar.message" })}
                </MenuItem>
                {capabilities.controlAgentRuntime && !isExternalAgent && (
                  <>
                    <ContextMenuDivider />
                    <MenuItem
                      icon={isOnline ? <Square size={14} /> : <Play size={14} />}
                      onClick={toggleContextAgentRuntime}
                    >
                      {isOnline ? formatMessage({ id: "layout.sidebar.stop" }) : formatMessage({ id: "layout.sidebar.start" })}
                    </MenuItem>
                    <MenuItem
                      icon={<RotateCcw size={14} />}
                      onClick={resetContextAgent}
                    >
                      {formatMessage({ id: "layout.sidebar.restartReset" })}
                    </MenuItem>
                  </>
                )}
              </>
            );
          })()}

          {ctxMenu.type === "agent" && (() => {
            const agent = ctxAgent;
            if (!agent) return null;
            const dmChannelId = ctxAgentDmChannelId;
            const hasUnread = dmChannelId ? (useMessageStore.getState().unreadCounts[dmChannelId] || 0) > 0 : false;
            const isPinned = pinnedAgentIds.includes(ctxMenu.id);
            return (
              <>
                {dmChannelId && renderReadToggleAction(dmChannelId, hasUnread)}
                <MenuItem
                  icon={isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  onClick={toggleContextAgentPin}
                >
                  {isPinned ? formatMessage({ id: "layout.sidebar.unpin" }) : formatMessage({ id: "layout.sidebar.pin" })}
                </MenuItem>
                {dmChannelId && (
                  <>
                    <ContextMenuDivider />
                    <MenuItem
                      icon={<X size={14} />}
                      onClick={closeContextDm}
                    >
                      {formatMessage({ id: "layout.sidebar.closeChat" })}
                    </MenuItem>
                  </>
                )}
              </>
            );
          })()}
          </ContextMenuPopup>
          {contextMovableItem && moveToSectionMenuOpen && (
            <ContextMenuPopup
              ref={setMoveToSectionMenuNode}
              role="menu"
              aria-label={formatMessage({ id: "layout.sidebar.moveToSection" })}
              className="fixed z-[51] max-h-[calc(100vh-16px)] w-60 overflow-y-auto select-none"
              style={moveToSectionMenuStyle}
              onMouseDown={stopSidebarContextMenuPropagation}
              onTouchStart={stopSidebarContextMenuPropagation}
            >
              <MenuItem
                icon={<Pin size={14} />}
                disabled={contextItemPinned}
                trailing={contextItemPinned ? <Check size={16} /> : null}
                onClick={moveContextItemToPinned}
              >
                {formatMessage({ id: "layout.sidebar.pinned" })}
              </MenuItem>
              {customSections.map((section) => (
                <MoveToSectionMenuItem
                  key={section.id}
                  section={section}
                  current={contextPlacement?.sectionId === section.id}
                  onMove={moveContextItemToSection}
                />
              ))}
              <ContextMenuDivider />
              <MenuItem
                icon={<FolderPlus size={14} />}
                onClick={createSectionWithContextItem}
              >
                {formatMessage({ id: "layout.sidebar.newSectionMenu" })}
              </MenuItem>
              {contextPlacement && (
                <MenuItem
                  icon={<X size={14} />}
                  onClick={removeContextItemFromSection}
                >
                  {formatMessage({ id: "layout.sidebar.removeFromSection" })}
                </MenuItem>
              )}
            </ContextMenuPopup>
          )}
        </>,
        document.body
      )}
    </>
  );
}
