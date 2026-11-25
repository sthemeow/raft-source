import {
  currentDate,
  supportsChannelAgentDelivery,
  type ChannelAgentDeliveryChange,
  type ChannelAgentDeliveryState,
} from "@botiverse/raft-shared";
import { and, asc, count, eq, gte, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { getDb, type DatabaseExecutor } from "../db/index";
import { agents, agentChannelReadCursors, channels, channelAgents, CHANNEL_MUTE_SYSTEM_APP, inboxTargetMuteStates, messageMentions, messages, thirdPartyAgentEvents } from "../db/schema";
import { channelActorHasCapability, resolveChannelActorContext } from "../lib/channelActorPermissions";
import { RefusalError } from "../lib/refusal";
import { isAgentLoungeChannel } from "./agentLoungeService";
import { resolveConversionReadChannelIds, resolvedConversionReadChannelPredicate } from "./channelConversionReadScope";
import { withChannelWriterFence } from "./channelConversionFenceService";
import { setInboxTargetActivityMuteState } from "./channelService";
import { createSystemAppAgentEvent, type SystemAppAgentEvent } from "./systemAppAgentEvents";

interface Viewer {
  serverId: string;
  userId: string;
  channelId: string;
}

async function readDeliveryState({ serverId, userId, channelId }: Viewer, executor: DatabaseExecutor) {
  const actor = await resolveChannelActorContext(serverId, channelId, "user", userId, executor);
  if (!actor?.canAccessChannel || actor.channelDeletedAt) {
    throw new RefusalError(404, { error: "Channel not found", code: "channel_not_found" });
  }
  if (!supportsChannelAgentDelivery({ type: actor.channelType, name: actor.channelName })
    || await isAgentLoungeChannel(channelId, executor)) {
    throw new RefusalError(404, { error: "Agent delivery settings are unavailable for this channel", code: "channel_agent_delivery_unsupported" });
  }

  const rows = await executor.select({
    muteAll: channels.muteNewAgents,
    channelName: channels.name,
    agentId: agents.id,
    name: agents.name,
    displayName: agents.displayName,
    avatarUrl: agents.avatarUrl,
    individual: inboxTargetMuteStates.activityMuted,
    muteFromSeq: inboxTargetMuteStates.muteFromSeq,
    individualPrefsVersion: inboxTargetMuteStates.prefsVersion,
  }).from(channels)
    .leftJoin(channelAgents, eq(channelAgents.channelId, channels.id))
    .leftJoin(agents, and(eq(agents.id, channelAgents.agentId), isNull(agents.deletedAt)))
    .leftJoin(inboxTargetMuteStates, and(
      eq(inboxTargetMuteStates.sourceChannelId, channels.id),
      eq(inboxTargetMuteStates.receiverType, "agent"),
      eq(inboxTargetMuteStates.receiverId, agents.id),
    ))
    .where(and(eq(channels.id, channelId), eq(channels.serverId, serverId), isNull(channels.deletedAt)))
    .orderBy(asc(agents.name), asc(agents.id));
  const first = rows[0];
  if (!first) throw new RefusalError(404, { error: "Channel not found", code: "channel_not_found" });

  const members = rows.flatMap(row => {
    if (!row.agentId || row.name == null) return [];
    const muted = row.individual === true && row.muteFromSeq != null;
    return [{
      agentId: row.agentId,
      name: row.displayName ?? row.name,
      avatarUrl: row.avatarUrl,
      individualPrefsVersion: row.individualPrefsVersion ?? 0,
      muteFromSeq: row.muteFromSeq,
      muted,
    }];
  });
  return {
    channelName: first.channelName,
    state: {
      muteAll: first.muteAll,
      canManage: actor.channelArchivedAt === null && channelActorHasCapability(actor, "editChannelMetadata"),
      members: members.map(({ muteFromSeq: _muteFromSeq, ...member }) => member),
    } satisfies ChannelAgentDeliveryState,
    members,
  };
}

export async function getChannelAgentDelivery(viewer: Viewer) {
  return (await readDeliveryState(viewer, getDb())).state;
}

async function countUnreadMutedMessages(
  tx: DatabaseExecutor,
  channelId: string,
  readChannelIds: string[],
  agentId: string,
  muteFromSeq: number,
) {
  const [cursor] = await tx.select({
    seq: sql<number>`COALESCE(${agentChannelReadCursors.lastReadSeq8}, ${agentChannelReadCursors.lastReadSeq})`,
  }).from(agentChannelReadCursors).where(and(
    eq(agentChannelReadCursors.channelId, channelId),
    eq(agentChannelReadCursors.agentId, agentId),
  ));
  const [row] = await tx.select({ count: count() }).from(messages).where(and(
    resolvedConversionReadChannelPredicate(messages.channelId, readChannelIds),
    gt(messages.seq, cursor?.seq ?? 0),
    gte(messages.seq, muteFromSeq),
    sql`${messages.messageType} IS DISTINCT FROM 'system'`,
    sql`NOT COALESCE(${messages.senderType} = 'agent' AND ${messages.senderId} = ${agentId}, FALSE)`,
    sql`NOT COALESCE(${messages.senderType} <> 'external_projection'
      AND ${messages.taskAssigneeType} = 'agent' AND ${messages.taskAssigneeId} = ${agentId}, FALSE)`,
    notExists(tx.select({ id: messageMentions.messageId }).from(messageMentions).where(and(
      eq(messageMentions.messageId, messages.id),
      eq(messageMentions.targetType, "agent"),
      eq(messageMentions.targetId, agentId),
      sql`(${messageMentions.notifiableAtSend} OR ${messageMentions.notifiedAt} IS NOT NULL)`,
    ))),
  ));
  return row?.count ?? 0;
}

const UNMUTE_NOTICE_TTL_MS = 7 * 24 * 60 * 60_000;

async function queueUnmuteNotice(
  tx: DatabaseExecutor,
  viewer: Viewer,
  channelName: string,
  readChannelIds: string[],
  agentId: string,
  muteFromSeq: number,
) {
  const now = currentDate();
  const objectRef = `channel/${viewer.channelId}`;
  const [pending] = await tx.select({ id: thirdPartyAgentEvents.id }).from(thirdPartyAgentEvents)
    .where(and(
      eq(thirdPartyAgentEvents.agentId, agentId),
      eq(thirdPartyAgentEvents.systemApp, CHANNEL_MUTE_SYSTEM_APP),
      eq(thirdPartyAgentEvents.objectRef, objectRef),
      inArray(thirdPartyAgentEvents.status, ["queued", "delivering"]),
      gt(thirdPartyAgentEvents.expiresAt, now),
    )).limit(1);
  if (pending) return null;

  const unread = await countUnreadMutedMessages(tx, viewer.channelId, readChannelIds, agentId, muteFromSeq);
  if (unread === 0) return null;

  return createSystemAppAgentEvent({
    executor: tx,
    serverId: viewer.serverId,
    agentId,
    systemApp: CHANNEL_MUTE_SYSTEM_APP,
    kind: "notification",
    summary: `A channel administrator turned off your mute in #${channelName}. `
      + (unread === 1
        ? "1 ordinary message posted there while you were muted is still unread."
        : `${unread} ordinary messages posted there while you were muted are still unread.`)
      + " Only messages that @mention you directly or assign you a task still need a response."
      + (unread === 1
        ? " This notice and that ordinary message need no reply."
        : " This notice and those ordinary messages need no reply."),
    payload: {},
    ttlMs: UNMUTE_NOTICE_TTL_MS,
    now,
    objectRef,
    relatedChannelId: viewer.channelId,
  });
}

function rejectOutdatedSettings(): never {
  throw new RefusalError(409, {
    error: "Agent delivery settings changed. Refresh and try again.",
    code: "channel_agent_delivery_changed",
  });
}

export function updateChannelAgentDelivery(viewer: Viewer, change: ChannelAgentDeliveryChange) {
  return withChannelWriterFence(viewer.channelId, async tx => {
    // Joins and self-mute use the same channel row lock, so member changes
    // cannot race the switch or invalidate an individual prefsVersion check.
    await tx.select({ id: channels.id }).from(channels)
      .where(eq(channels.id, viewer.channelId)).for("no key update");
    const { state, members, channelName } = await readDeliveryState(viewer, tx);
    if (!state.canManage) {
      throw new RefusalError(403, { error: "You cannot manage Agent delivery in this channel", code: "channel_agent_delivery_forbidden" });
    }

    const selected = change.kind === "channel" ? members : members.filter(member => member.agentId === change.agentId);
    if (change.kind === "individual") {
      if (!selected[0]) throw new RefusalError(404, { error: "Agent is not a channel member", code: "channel_agent_not_found" });
      if (selected[0].individualPrefsVersion !== change.individualPrefsVersion) rejectOutdatedSettings();
    }

    const defaultChanged = change.kind === "channel" && state.muteAll !== change.enabled;
    const changed = selected.filter(member => member.muted !== change.enabled);
    const notices: SystemAppAgentEvent[] = [];
    if (!defaultChanged && changed.length === 0) return { state, changed: false, notices };

    if (defaultChanged) {
      await tx.update(channels).set({ muteNewAgents: change.enabled }).where(eq(channels.id, viewer.channelId));
    }

    const readChannelIds = !change.enabled && changed.length > 0
      ? await resolveConversionReadChannelIds(tx, viewer.channelId)
      : [];
    for (const member of changed) {
      if (!change.enabled && member.muteFromSeq != null) {
        const event = await queueUnmuteNotice(tx, viewer, channelName, readChannelIds, member.agentId, member.muteFromSeq);
        if (event) notices.push(event);
      }
      await setInboxTargetActivityMuteState({
        receiverType: "agent",
        receiverId: member.agentId,
        serverId: viewer.serverId,
        sourceChannelId: viewer.channelId,
        activityMuted: change.enabled,
      }, tx);
    }
    return { state: (await readDeliveryState(viewer, tx)).state, changed: true, notices };
  });
}
