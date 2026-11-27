// Send hold (shared sendHold.ts): a message waiting to be
// delivered is no message yet (no seq, no unread). The server tells the room
// (socket message:held): on the sender's own sending row (its optimistic
// send in this tab) that marks it held; anywhere else it adds a preview row
// (id `optimistic-held-<randomId>`), which the delivered message replaces by
// randomId like any optimistic row. message:held_removed (withdrawn) takes
// the preview away; the sender's own row is settled by its send.
import type { HeldMessagePreview, HeldMessageRemoved } from "@botiverse/raft-shared";
import { useEffect } from "react";
import api from "../api/client";
import { useMessageStore } from "./messageStore";

export const HELD_PREVIEW_ID_PREFIX = "optimistic-held-";

export function applyHeldPreview(preview: HeldMessagePreview): void {
  const store = useMessageStore.getState();
  const held = { createdAt: preview.createdAt, releaseAt: preview.releaseAt };
  const own = (store.channelMessages[preview.channelId] ?? []).find((m) => m.randomId === preview.randomId);
  if (own) {
    if (typeof own.seq === "number") return; // already delivered
    useMessageStore.setState((current) => {
      const rows = (current.channelMessages[preview.channelId] ?? []).map((m) =>
        m.randomId === preview.randomId && typeof m.seq !== "number" ? { ...m, held } : m);
      return {
        channelMessages: { ...current.channelMessages, [preview.channelId]: rows },
        messages: preview.channelId === current.currentChannelId ? rows : current.messages,
      };
    });
    return;
  }
  store.addOptimisticMessage({
    id: `${HELD_PREVIEW_ID_PREFIX}${preview.randomId}`,
    channelId: preview.channelId,
    randomId: preview.randomId,
    senderType: "user",
    senderId: preview.senderId,
    senderName: preview.senderName,
    messageType: "chat",
    content: preview.content,
    createdAt: preview.createdAt,
    held,
  });
}

export function removeHeldPreview(removed: HeldMessageRemoved): void {
  useMessageStore.getState().removeOptimisticMessage(`${HELD_PREVIEW_ID_PREFIX}${removed.randomId}`, removed.channelId);
}

function isHeldEvent(payload: unknown): payload is HeldMessageRemoved {
  const value = payload as Partial<HeldMessageRemoved> | null;
  return !!value && typeof value.randomId === "string" && typeof value.channelId === "string";
}

// Live events win over a snapshot read before them (GET /held can answer
// after a message:held_removed it predates, or miss a message:held that came
// meanwhile): each live event for a send stamps it with a running number, and
// a snapshot leaves alone every send stamped after it was asked for.
let liveClock = 0;
const liveStamps = new Map<string, number>();
const LIVE_STAMPS_MAX = 500;

function liveKey(channelId: string, randomId: string) {
  return `${channelId}\u0000${randomId}`;
}

function stampLive(channelId: string, randomId: string) {
  liveClock += 1;
  const key = liveKey(channelId, randomId);
  liveStamps.delete(key);
  liveStamps.set(key, liveClock);
  if (liveStamps.size > LIVE_STAMPS_MAX) {
    const oldest = liveStamps.keys().next().value;
    if (oldest !== undefined) liveStamps.delete(oldest);
  }
}

function changedLiveSince(channelId: string, randomId: string, since: number) {
  return (liveStamps.get(liveKey(channelId, randomId)) ?? 0) > since;
}

/**
 * A page opened or reconnected during the wait missed message:held: read the
 * sends still waiting in the conversation (GET /v2/messages/held) and show
 * them. A preview row the server no longer lists (withdrawn or sent while this
 * page was away) is taken away; a sent one comes back as its message. A send
 * a live event touched after the read was asked for is left as that event
 * left it.
 */
const latestRead = new Map<string, number>();
let readCount = 0;

export async function hydrateHeldPreviews(channelId: string): Promise<void> {
  const askedAt = liveClock;
  readCount += 1;
  const thisRead = readCount;
  latestRead.set(channelId, thisRead); // an older read answering later is dropped
  let held: HeldMessagePreview[];
  try {
    const { data } = await api.get("/v2/messages/held", { params: { channelId } });
    held = Array.isArray(data?.held) ? data.held as HeldMessagePreview[] : [];
  } catch {
    return; // best effort: the live events still arrive
  }
  if (latestRead.get(channelId) !== thisRead) return;
  const listed = new Set(held.map((preview) => preview.randomId));
  for (const row of useMessageStore.getState().channelMessages[channelId] ?? []) {
    if (row.id.startsWith(HELD_PREVIEW_ID_PREFIX) && row.randomId && !listed.has(row.randomId)
      && !changedLiveSince(channelId, row.randomId, askedAt)) {
      removeHeldPreview({ randomId: row.randomId, channelId });
    }
  }
  for (const preview of held) {
    if (preview.channelId === channelId && !changedLiveSince(channelId, preview.randomId, askedAt)) {
      applyHeldPreview(preview);
    }
  }
}

/** Every live message:new also settles a send: a snapshot must not bring its preview back. */
export function noteDeliveredSend(channelId: string, randomId: string | null | undefined): void {
  if (randomId) stampLive(channelId, randomId);
}

// The conversations on screen (main list, open thread or task): read again
// once a reconnect has joined the rooms.
const watched = new Map<string, number>();

/** Show the sends waiting in this conversation now and after every reconnect. Off: does nothing. */
export function useHeldPreviewHydration(channelId: string | null | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !channelId) return;
    watched.set(channelId, (watched.get(channelId) ?? 0) + 1);
    void hydrateHeldPreviews(channelId);
    return () => {
      const count = (watched.get(channelId) ?? 1) - 1;
      if (count > 0) watched.set(channelId, count);
      else watched.delete(channelId);
    };
  }, [channelId, enabled]);
}

/** After a reconnect has joined the rooms (socketBridge roomsJoined). */
export function rehydrateWatchedHeldPreviews(): void {
  for (const channelId of watched.keys()) void hydrateHeldPreviews(channelId);
}

/** The main layout's socket bindings for the two events (store/socketBridge.ts). */
export const HELD_PREVIEW_SOCKET_BINDINGS = [
  { event: "message:held" as const, handler: (payload: unknown) => {
    if (!isHeldEvent(payload)) return;
    stampLive(payload.channelId, payload.randomId);
    applyHeldPreview(payload as HeldMessagePreview);
  } },
  { event: "message:held_removed" as const, handler: (payload: unknown) => {
    if (!isHeldEvent(payload)) return;
    stampLive(payload.channelId, payload.randomId);
    removeHeldPreview(payload);
  } },
];
