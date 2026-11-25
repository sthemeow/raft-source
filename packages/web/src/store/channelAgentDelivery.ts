import { useEffect } from "react";
import { create } from "zustand";
import {
  supportsChannelAgentDelivery,
  type ChannelAgentDeliveryChange,
  type ChannelAgentDeliveryMember,
  type ChannelAgentDeliveryState,
} from "@botiverse/raft-shared";
import api from "../api/client";
import { getSocket } from "../api/socket";
import { useAuthStore } from "./authStore";
import { subscribeChannelMembersChanged } from "./channelMemberEvents";
import { useServerStore } from "./serverStore";
import { useLoungeAgentId, useStoredChannel } from "./useStoredChannel";

interface DeliveryTarget {
  channelId: string;
  serverId: string;
  key: string;
}

interface DeliveryEntry {
  state?: ChannelAgentDeliveryState;
  saving?: boolean;
}

const useDeliveryStore = create<{ entries: Record<string, DeliveryEntry> }>(() => ({ entries: {} }));
const reads = new Map<string, Promise<void>>();
const refreshAfterSave = new Set<string>();

function setEntry(key: string, entry: DeliveryEntry) {
  useDeliveryStore.setState(({ entries }) => ({
    entries: { ...entries, [key]: entry },
  }));
}

function refresh(target: DeliveryTarget): Promise<void> {
  const { key, channelId, serverId } = target;
  if (useDeliveryStore.getState().entries[key]?.saving) {
    refreshAfterSave.add(key);
    return Promise.resolve();
  }
  const pending = reads.get(key);
  if (pending) return pending;

  const request = api.get<ChannelAgentDeliveryState>(`/channels/${channelId}/agent-delivery`, {
    headers: { "X-Server-Id": serverId },
  }).then(({ data }) => {
    if (reads.get(key) === request) setEntry(key, { state: data });
  }).catch((error: { response?: { status?: number } } | undefined) => {
    const status = error?.response?.status;
    if (reads.get(key) === request && (status === 403 || status === 404)) setEntry(key, {});
  }).finally(() => {
    if (reads.get(key) === request) reads.delete(key);
  });
  reads.set(key, request);
  return request;
}

async function save(target: DeliveryTarget, change: ChannelAgentDeliveryChange) {
  const { key, channelId, serverId } = target;
  const entry = useDeliveryStore.getState().entries[key];
  if (!entry?.state?.canManage || entry.saving) throw new Error("Agent delivery settings are unavailable");
  reads.delete(key);
  setEntry(key, { ...entry, saving: true });
  try {
    const { data } = await api.patch<ChannelAgentDeliveryState>(`/channels/${channelId}/agent-delivery`, change, {
      headers: { "X-Server-Id": serverId },
    });
    setEntry(key, { state: data });
  } catch (error) {
    refreshAfterSave.add(key);
    setEntry(key, entry);
    throw error;
  } finally {
    if (refreshAfterSave.delete(key)) void refresh(target);
  }
}

function useDeliveryTarget(channelId: string | null | undefined) {
  const serverId = useServerStore(s => s.current?.id);
  const userId = useAuthStore(s => s.user?.id);
  const channel = useStoredChannel(channelId ?? "");
  const loungeAgentId = useLoungeAgentId(channelId);
  const key = channelId && serverId && userId && channel && !channel.archivedAt
    && !loungeAgentId && supportsChannelAgentDelivery(channel)
    ? `${userId}:${serverId}:${channelId}`
    : undefined;
  return key && channelId && serverId ? { key, channelId, serverId } : undefined;
}

export function useLoadChannelAgentDelivery(channelId: string | null | undefined) {
  const { key, serverId } = useDeliveryTarget(channelId) ?? {};
  useEffect(() => {
    if (!key || !channelId || !serverId) return;
    const target = { key, channelId, serverId };
    void refresh(target);
    const reload = () => {
      const pending = reads.get(key);
      if (pending) void pending.then(() => refresh(target));
      else void refresh(target);
    };
    const socket = getSocket();
    const onMembersUpdated = ({ channelId: changedId }: { channelId: string }) => {
      if (changedId === channelId) reload();
    };
    socket.on("channel:members-updated", onMembersUpdated);
    socket.on("connect", reload);
    const unsubscribe = subscribeChannelMembersChanged(changedId => {
      if (changedId === null || changedId === channelId) reload();
    });
    return () => {
      socket.off("channel:members-updated", onMembersUpdated);
      socket.off("connect", reload);
      unsubscribe();
    };
  }, [channelId, key, serverId]);
}

export function useChannelAgentDelivery(channelId: string | null | undefined) {
  const target = useDeliveryTarget(channelId);
  const entry = useDeliveryStore(s => target ? s.entries[target.key] : undefined);
  return {
    state: entry?.state,
    saving: entry?.saving === true,
    save: (change: ChannelAgentDeliveryChange) => target ? save(target, change) : Promise.reject(new Error("Agent delivery settings are unavailable")),
  };
}

export function useChannelAgentMuted(channelId: string | null, agentId: string | null) {
  const target = useDeliveryTarget(channelId);
  return useDeliveryStore(s => Boolean(target && agentId
    && s.entries[target.key]?.state?.members.some(member => member.agentId === agentId && member.muted)));
}

export function toggleChannelAgentDelivery(member: ChannelAgentDeliveryMember): ChannelAgentDeliveryChange {
  const { agentId, muted, individualPrefsVersion } = member;
  return { kind: "individual", agentId, enabled: !muted, individualPrefsVersion };
}
