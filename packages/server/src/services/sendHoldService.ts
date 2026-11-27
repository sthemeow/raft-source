/**
 * Send hold (shared sendHold.ts).
 *
 * A person's message from the web composer waits a few seconds before it is
 * delivered, and can be withdrawn back into the composer meanwhile. While it
 * waits it is NOT a message: it lives in `pending_human_sends`, has no seq,
 * moves no read cursor, sends no notice and no agent can read it. The people
 * in the conversation see a preview through the socket room only
 * (`message:held`); agents never connect to socket rooms, they read messages
 * from the database.
 *
 * Release hands the stored send to broadcastAndDeliver with the same
 * randomId, so from there on everything is the ordinary send. Withdraw
 * deletes the row. Both race on one row: release first marks it `releasing`
 * (an UPDATE ... WHERE releasing = false), withdraw deletes only a row not
 * yet releasing, so exactly one wins.
 *
 * The send request itself waits for the outcome: released → the ordinary
 * send response; withdrawn → 409 `send_withdrawn`, which the composer treats
 * as a failed send without an error (the text, mentions and files go back).
 *
 * Timers live in this process; a sweep every few seconds releases what a
 * restart or another instance left behind, and retries a release that never
 * finished (randomId makes broadcastAndDeliver idempotent).
 */
import type { Server as SocketServer } from "socket.io";
import { and, eq, lte, or } from "drizzle-orm";
import {
  SEND_HOLD_HELD_EVENT,
  SEND_HOLD_REMOVED_EVENT,
  isSubConversationType,
  type HeldMessagePreview,
  type HeldMessageRemoved,
} from "@botiverse/raft-shared";
import { getDb } from "../db/index";
import { messages, pendingHumanSends } from "../db/schema";
import type { AgentOrchestrator } from "./agentOrchestrator";
import * as messageService from "./messageService";
import * as channelService from "./channelService";
import { socketUserServerRoom } from "../socket/platformScope";

/** The ordinary send, stored as is and handed to broadcastAndDeliver on release. */
export type HeldSendPayload = {
  channelId: string;
  senderType: "user";
  senderId: string;
  senderName: string;
  content: string;
  mentions?: Parameters<typeof messageService.broadcastAndDeliver>[2]["mentions"];
  attachmentIds?: string[];
  randomId: string;
  asTask?: boolean;
  mentionContract?: "v1" | "v2";
  senderTimezone?: string | null;
};

type Enriched = Awaited<ReturnType<typeof messageService.broadcastAndDeliver>>;

export type HeldSendOutcome =
  | { kind: "released"; enriched: Enriched }
  | { kind: "withdrawn" }
  | { kind: "failed"; error: unknown };

export class SendWithdrawnError extends Error {
  readonly status = 409;
  constructor() {
    super("The message was withdrawn before it was delivered");
  }
}

type Waiter = {
  promise: Promise<HeldSendOutcome>;
  resolve: (outcome: HeldSendOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

const SWEEP_INTERVAL_MS = 5_000;
/** A row still `releasing` this long after its release time is a release that died; retry it. */
const STUCK_RELEASE_MS = 60_000;
/** How long past its release time the send request waits for an outcome from elsewhere before settling it itself. */
const WAIT_GRACE_MS = 15_000;

let runtime: { io: SocketServer; orchestrator: AgentOrchestrator } | null = null;
const waiters = new Map<string, Waiter>();

function waiterFor(id: string): Waiter {
  let waiter = waiters.get(id);
  if (!waiter) {
    let resolve!: (outcome: HeldSendOutcome) => void;
    const promise = new Promise<HeldSendOutcome>((r) => { resolve = r; });
    waiter = { promise, resolve, timer: null };
    waiters.set(id, waiter);
  }
  return waiter;
}

function settle(id: string, outcome: HeldSendOutcome) {
  const waiter = waiters.get(id);
  if (!waiter) return;
  if (waiter.timer) clearTimeout(waiter.timer);
  waiters.delete(id);
  waiter.resolve(outcome);
}

function requireRuntime() {
  if (!runtime) throw new Error("send hold is not started");
  return runtime;
}

/**
 * Join the people of a DM or thread to its room before the preview, as the
 * ordinary send does before message:new (a new DM or thread room may be empty).
 */
async function joinPreviewAudience(io: SocketServer, channelId: string) {
  const channel = await channelService.getChannel(channelId);
  if (!channel) return;
  if (channel.type === "dm") {
    await messageService.joinDmHumanSocketsToRoom(io, channel);
  } else if (isSubConversationType(channel.type)) {
    const followerIds = await messageService.getHumanThreadFollowerIds(channelId);
    for (const userId of followerIds) {
      io.in(socketUserServerRoom(userId, channel.serverId)).socketsJoin(`channel:${channelId}`);
    }
  }
}

/**
 * Release the row: claim it, run the ordinary send, delete it. Safe to call
 * from anywhere, any number of times. The outcome of this call's release;
 * null when it claimed nothing (withdrawn, or someone else is releasing it).
 */
export async function releaseHeldSend(id: string, opts: { retryStuck?: boolean } = {}): Promise<HeldSendOutcome | null> {
  const { io, orchestrator } = requireRuntime();
  const db = getDb();
  const claim = opts.retryStuck
    ? and(eq(pendingHumanSends.id, id), eq(pendingHumanSends.releasing, true))
    : and(eq(pendingHumanSends.id, id), eq(pendingHumanSends.releasing, false));
  const [row] = await db
    .update(pendingHumanSends)
    .set({ releasing: true, ...(opts.retryStuck ? { releaseAt: new Date() } : {}) })
    .where(claim)
    .returning();
  if (!row) return null; // withdrawn, or someone else is releasing it
  let outcome: HeldSendOutcome;
  try {
    const enriched = await messageService.broadcastAndDeliver(io, orchestrator, row.payload as HeldSendPayload);
    outcome = { kind: "released", enriched };
  } catch (error) {
    // The send itself refused (archived channel, removed member, …): it will
    // refuse again, so the row goes and the sender's request gets the error.
    outcome = { kind: "failed", error };
    io.to(`channel:${row.channelId}`).emit(SEND_HOLD_REMOVED_EVENT, {
      randomId: row.randomId,
      channelId: row.channelId,
    } satisfies HeldMessageRemoved);
  }
  await db.delete(pendingHumanSends).where(eq(pendingHumanSends.id, id));
  settle(id, outcome);
  return outcome;
}

/** Release the sender's message still waiting in this conversation, if any (a new send goes after it). */
async function releasePrevious(senderId: string, channelId: string) {
  const rows = await getDb()
    .select({ id: pendingHumanSends.id, releasing: pendingHumanSends.releasing })
    .from(pendingHumanSends)
    .where(and(eq(pendingHumanSends.senderUserId, senderId), eq(pendingHumanSends.channelId, channelId)));
  for (const row of rows) {
    if (row.releasing) {
      // Someone else is releasing it; wait until the row is gone, so order holds.
      const waiter = waiters.get(row.id);
      if (waiter) await waiter.promise;
    } else {
      await releaseHeldSend(row.id);
    }
  }
}

/**
 * Hold the send and wait for its outcome. Returns the ordinary send's result
 * once released; throws SendWithdrawnError if the sender withdrew it, or the
 * send's own error if the release refused.
 */
export async function holdAndAwaitSend(input: {
  serverId: string;
  seconds: number;
  payload: HeldSendPayload;
}): Promise<Enriched> {
  const { io } = requireRuntime();
  const { payload } = input;
  const db = getDb();

  // A retried request for a send already waiting joins it.
  const [existing] = await db
    .select()
    .from(pendingHumanSends)
    .where(and(eq(pendingHumanSends.senderUserId, payload.senderId), eq(pendingHumanSends.randomId, payload.randomId)));
  let rowId: string;
  let releaseAt: Date;
  if (existing) {
    rowId = existing.id;
    releaseAt = existing.releaseAt;
  } else {
    await releasePrevious(payload.senderId, payload.channelId);
    releaseAt = new Date(Date.now() + input.seconds * 1000);
    const inserted = await db
      .insert(pendingHumanSends)
      .values({
        serverId: input.serverId,
        channelId: payload.channelId,
        senderUserId: payload.senderId,
        randomId: payload.randomId,
        payload,
        releaseAt,
      })
      .onConflictDoNothing()
      .returning({ id: pendingHumanSends.id, createdAt: pendingHumanSends.createdAt });
    if (inserted.length === 0) {
      // Two sends raced in one conversation: send this one at once rather than hold it.
      return messageService.broadcastAndDeliver(io, requireRuntime().orchestrator, payload);
    }
    rowId = inserted[0]!.id;
    await joinPreviewAudience(io, payload.channelId).catch((err) =>
      console.error("[send-hold] joining the preview audience failed:", err instanceof Error ? err.message : err));
    io.to(`channel:${payload.channelId}`).emit(SEND_HOLD_HELD_EVENT, {
      randomId: payload.randomId,
      channelId: payload.channelId,
      senderId: payload.senderId,
      senderName: payload.senderName,
      content: payload.content,
      createdAt: inserted[0]!.createdAt.toISOString(),
      releaseAt: releaseAt.toISOString(),
      attachmentCount: payload.attachmentIds?.length ?? 0,
    } satisfies HeldMessagePreview);
  }

  const waiter = waiterFor(rowId);
  if (!waiter.timer) {
    const delay = Math.max(0, releaseAt.getTime() - Date.now());
    waiter.timer = setTimeout(() => {
      waiter.timer = null;
      void releaseHeldSend(rowId).catch((err) =>
        console.error("[send-hold] release failed:", err instanceof Error ? err.message : err));
    }, delay);
    waiter.timer.unref?.();
  }

  // Released by another instance (or this one's sweep after a lost timer):
  // after the grace, settle it here. Replaying the send by its randomId
  // answers the message it became without sending it twice.
  const grace = new Promise<HeldSendOutcome>((resolve) => {
    const t = setTimeout(() => {
      void settleFromDatabase(rowId, payload).then(resolve, (error) => resolve({ kind: "failed", error }));
    }, Math.max(0, releaseAt.getTime() - Date.now()) + WAIT_GRACE_MS);
    t.unref?.();
    void waiter.promise.finally(() => clearTimeout(t));
  });

  const outcome = await Promise.race([waiter.promise, grace]);
  if (outcome.kind === "released") return outcome.enriched;
  if (outcome.kind === "withdrawn") throw new SendWithdrawnError();
  throw outcome.error;
}

async function settleFromDatabase(rowId: string, payload: HeldSendPayload): Promise<HeldSendOutcome> {
  const [row] = await getDb().select({ id: pendingHumanSends.id }).from(pendingHumanSends).where(eq(pendingHumanSends.id, rowId));
  if (row) {
    await releaseHeldSend(rowId);
    const waiter = waiters.get(rowId);
    if (waiter) return waiter.promise;
  }
  const [message] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.senderType, "user"), eq(messages.senderId, payload.senderId), eq(messages.randomId, payload.randomId)))
    .limit(1);
  if (!message) return { kind: "withdrawn" };
  const { io, orchestrator } = requireRuntime();
  return { kind: "released", enriched: await messageService.broadcastAndDeliver(io, orchestrator, payload) };
}

/**
 * The sender takes back their waiting message. `withdrawn: false` when it is
 * already on its way (or was never held): the message stays sent.
 */
/**
 * The sends still waiting in a conversation, as the previews message:held
 * carried: for a page opened or reconnected during the wait, which missed the
 * live event. A row already releasing is left out (its message is on its way).
 */
export async function listHeldPreviews(channelId: string): Promise<HeldMessagePreview[]> {
  const rows = await getDb()
    .select()
    .from(pendingHumanSends)
    .where(and(eq(pendingHumanSends.channelId, channelId), eq(pendingHumanSends.releasing, false)));
  return rows.map((row) => {
    const payload = row.payload as HeldSendPayload;
    return {
      randomId: row.randomId,
      channelId: row.channelId,
      senderId: row.senderUserId,
      senderName: payload.senderName,
      content: payload.content,
      createdAt: row.createdAt.toISOString(),
      releaseAt: row.releaseAt.toISOString(),
      attachmentCount: payload.attachmentIds?.length ?? 0,
    };
  });
}

export async function withdrawHeldSend(senderId: string, randomId: string): Promise<{ withdrawn: boolean }> {
  const { io } = requireRuntime();
  const [row] = await getDb()
    .delete(pendingHumanSends)
    .where(and(
      eq(pendingHumanSends.senderUserId, senderId),
      eq(pendingHumanSends.randomId, randomId),
      eq(pendingHumanSends.releasing, false),
    ))
    .returning({ id: pendingHumanSends.id, channelId: pendingHumanSends.channelId });
  if (!row) return { withdrawn: false };
  io.to(`channel:${row.channelId}`).emit(SEND_HOLD_REMOVED_EVENT, { randomId, channelId: row.channelId } satisfies HeldMessageRemoved);
  settle(row.id, { kind: "withdrawn" });
  return { withdrawn: true };
}

/**
 * The sender sends their waiting message now instead of at its time ("Send
 * now"). Released here as on its timer; the waiting send request answers as
 * usual. False when there is nothing of theirs waiting by that randomId (it is
 * already on its way, or withdrawn).
 */
export async function sendHeldNow(senderId: string, randomId: string): Promise<{ sent: boolean }> {
  const [row] = await getDb()
    .select({ id: pendingHumanSends.id })
    .from(pendingHumanSends)
    .where(and(
      eq(pendingHumanSends.senderUserId, senderId),
      eq(pendingHumanSends.randomId, randomId),
      eq(pendingHumanSends.releasing, false),
    ));
  if (!row) return { sent: false };
  const waiter = waiters.get(row.id);
  // This call's own release answers for itself (also with no waiter here: a
  // send from before a restart). One somebody else claimed first: wait for it
  // here if it is ours to wait on, else ask whether the message got stored.
  const outcome = (await releaseHeldSend(row.id)) ?? (waiter ? await waiter.promise : null);
  if (outcome) return { sent: outcome.kind === "released" };
  const [stored] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.senderType, "user"), eq(messages.senderId, senderId), eq(messages.randomId, randomId)));
  return { sent: !!stored };
}

export async function sweepHeldSends() {
  const now = Date.now();
  const due = await getDb()
    .select({ id: pendingHumanSends.id, releasing: pendingHumanSends.releasing })
    .from(pendingHumanSends)
    .where(or(
      and(eq(pendingHumanSends.releasing, false), lte(pendingHumanSends.releaseAt, new Date(now))),
      and(eq(pendingHumanSends.releasing, true), lte(pendingHumanSends.releaseAt, new Date(now - STUCK_RELEASE_MS))),
    ))
    .orderBy(pendingHumanSends.releaseAt)
    .limit(50);
  for (const row of due) {
    await releaseHeldSend(row.id, { retryStuck: row.releasing }).catch((err) =>
      console.error("[send-hold] sweep release failed:", err instanceof Error ? err.message : err));
  }
}

export function startSendHold(io: SocketServer, orchestrator: AgentOrchestrator): { stop(): void } {
  runtime = { io, orchestrator };
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    void sweepHeldSends()
      .catch((err) => console.error("[send-hold] sweep failed:", err instanceof Error ? err.message : err))
      .finally(() => { running = false; });
  };
  const interval = setInterval(tick, SWEEP_INTERVAL_MS);
  interval.unref?.();
  return {
    stop() {
      clearInterval(interval);
    },
  };
}

/** Test seam. */
export function __resetSendHoldForTests() {
  for (const waiter of waiters.values()) if (waiter.timer) clearTimeout(waiter.timer);
  waiters.clear();
  runtime = null;
}
