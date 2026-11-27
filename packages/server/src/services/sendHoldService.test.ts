// Send hold: a held send is not a message until released;
// withdraw takes it back; a new send releases the previous one first; the
// sweep releases what no timer will.
import { dbTest as test } from "../test/integration/dbTest";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { channels, messages, pendingHumanSends } from "../db/schema";
import { drainSenderReadReceiptsForTests } from "./messageService";
import { withChannelDelivery } from "../test/orchestratorStub";
import {
  __resetNotificationDispatchRuntimeForTests,
  __setNotificationDispatchRuntimeForTests,
  registerNotificationSocketServer,
} from "./notifications/dispatcher";
import {
  __resetSendHoldForTests,
  holdAndAwaitSend,
  listHeldPreviews,
  sendHeldNow,
  SendWithdrawnError,
  startSendHold,
  sweepHeldSends,
  withdrawHeldSend,
  type HeldSendPayload,
} from "./sendHoldService";

type Emitted = { room: string; event: string; payload: any };
let emitted: Emitted[] = [];
const io = {
  to(room: string) { return { emit(event: string, payload: unknown) { emitted.push({ room, event, payload }); } }; },
  in() { return { in() { return { socketsJoin() {} }; }, socketsJoin() {}, emit() {} }; },
  emit() {},
} as any;
const delivered: string[] = [];
const orchestrator = withChannelDelivery({
  deliverMessage: async (_agentId: string, message: { content?: string }) => {
    delivered.push(String(message?.content ?? ""));
    return { status: "queued" };
  },
}) as any;

let stopHold: { stop(): void } | null = null;
beforeEach(() => {
  emitted = [];
  delivered.length = 0;
  registerNotificationSocketServer(null);
  __setNotificationDispatchRuntimeForTests({ schedule: () => {} });
  stopHold = startSendHold(io, orchestrator);
});

afterEach(async () => {
  stopHold?.stop();
  __resetSendHoldForTests();
  __resetNotificationDispatchRuntimeForTests();
  await drainSenderReadReceiptsForTests();
});

async function setup(seed: any) {
  const pat = await seed.human({ name: "pat" });
  const bob = await seed.human({ name: "bob" });
  const server = await seed.server({ owner: pat, members: [bob] });
  const channel = await seed.channel({ server, members: [pat, bob], name: "eng" });
  return { pat, bob, server, channel };
}

function payload(channelId: string, sender: { id: string; name: string }, content: string, randomId: string): HeldSendPayload {
  return { channelId, senderType: "user", senderId: sender.id, senderName: sender.name, content, randomId, mentionContract: "v2" };
}

async function messagesIn(channelId: string) {
  return getDb().select({ content: messages.content, seq: messages.seq, randomId: messages.randomId })
    .from(messages).where(eq(messages.channelId, channelId)).orderBy(messages.seq);
}

async function pendingRows(senderId: string) {
  return getDb().select().from(pendingHumanSends).where(eq(pendingHumanSends.senderUserId, senderId));
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a held send is no message until its time, then is sent once", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 0.4, payload: payload(channel.id, pat, "hello", "r-1") });
  await tick(100);
  assert.equal((await messagesIn(channel.id)).length, 0, "nothing stored while held");
  assert.equal((await pendingRows(pat.id)).length, 1);
  const preview = emitted.find((e) => e.event === "message:held");
  assert.ok(preview, "a preview goes to the room");
  assert.equal(preview.room, `channel:${channel.id}`);
  assert.equal(preview.payload.randomId, "r-1");
  assert.equal(preview.payload.content, "hello");

  const enriched = await sending;
  assert.equal(enriched.content, "hello");
  const stored = await messagesIn(channel.id);
  assert.deepEqual(stored.map((m) => m.content), ["hello"]);
  assert.equal(stored[0]!.randomId, "r-1");
  assert.equal((await pendingRows(pat.id)).length, 0, "the row goes on release");
});

test("withdraw takes the send back: nothing stored, the request answers withdrawn", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 5, payload: payload(channel.id, pat, "oops", "r-2") });
  const outcome = sending.then(() => "sent", (err) => err);
  await tick(100);
  assert.deepEqual(await withdrawHeldSend(pat.id, "r-2"), { withdrawn: true });
  assert.ok((await outcome) instanceof SendWithdrawnError);
  assert.equal((await messagesIn(channel.id)).length, 0);
  assert.equal((await pendingRows(pat.id)).length, 0);
  const removed = emitted.find((e) => e.event === "message:held_removed");
  assert.deepEqual(removed?.payload, { randomId: "r-2", channelId: channel.id });
});

test("withdraw after release changes nothing", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  await holdAndAwaitSend({ serverId: server.id, seconds: 0.1, payload: payload(channel.id, pat, "done", "r-3") });
  assert.deepEqual(await withdrawHeldSend(pat.id, "r-3"), { withdrawn: false });
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["done"]);
});

test("only the sender can withdraw", async ({ seed }) => {
  const { pat, bob, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 0.4, payload: payload(channel.id, pat, "mine", "r-4") });
  await tick(50);
  assert.deepEqual(await withdrawHeldSend(bob.id, "r-4"), { withdrawn: false });
  await sending;
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["mine"]);
});

test("a new send in the same conversation releases the waiting one first", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const first = holdAndAwaitSend({ serverId: server.id, seconds: 10, payload: payload(channel.id, pat, "first", "r-5") });
  await tick(50);
  const second = holdAndAwaitSend({ serverId: server.id, seconds: 0.3, payload: payload(channel.id, pat, "second", "r-6") });
  const firstSent = await first; // released by the second send, long before its 10 s
  assert.equal(firstSent.content, "first");
  await tick(50);
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["first"], "the second still waits");
  await second;
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["first", "second"]);
});

test("sends in different conversations wait independently", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const other = await seed.channel({ server, members: [pat], name: "other" });
  const a = holdAndAwaitSend({ serverId: server.id, seconds: 0.5, payload: payload(channel.id, pat, "a", "r-7") });
  await tick(50);
  const b = holdAndAwaitSend({ serverId: server.id, seconds: 0.1, payload: payload(other.id, pat, "b", "r-8") });
  await b;
  assert.equal((await messagesIn(channel.id)).length, 0, "a still waits");
  await a;
  assert.equal((await messagesIn(channel.id)).length, 1);
});

test("the sweep releases a row no timer holds (a restart)", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  await getDb().insert(pendingHumanSends).values({
    serverId: server.id,
    channelId: channel.id,
    senderUserId: pat.id,
    randomId: "r-9",
    payload: payload(channel.id, pat, "left behind", "r-9"),
    releaseAt: new Date(Date.now() - 1000),
  });
  await sweepHeldSends();
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["left behind"]);
  assert.equal((await pendingRows(pat.id)).length, 0);
});

test("the sweep retries a release that died midway, without sending twice", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  // Sent once already (the crash came after the message, before the row went).
  await holdAndAwaitSend({ serverId: server.id, seconds: 0.05, payload: payload(channel.id, pat, "once", "r-10") });
  await getDb().insert(pendingHumanSends).values({
    serverId: server.id,
    channelId: channel.id,
    senderUserId: pat.id,
    randomId: "r-10",
    payload: payload(channel.id, pat, "once", "r-10"),
    releasing: true,
    releaseAt: new Date(Date.now() - 120_000),
  });
  await sweepHeldSends();
  assert.deepEqual((await messagesIn(channel.id)).map((m) => m.content), ["once"]);
  assert.equal((await pendingRows(pat.id)).length, 0);
});

test("a release the send refuses goes back to the sender as the error", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 0.2, payload: payload("00000000-0000-4000-8000-000000000000", pat, "nowhere", "r-11") })
    .then(() => "sent", (err) => err);
  void channel;
  const outcome = await sending;
  // A missing channel cannot even be held (foreign key), or is refused on release.
  assert.notEqual(outcome, "sent");
  assert.equal((await pendingRows(pat.id)).length, 0);
});

test("a retried request for the same send joins it", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const one = holdAndAwaitSend({ serverId: server.id, seconds: 0.3, payload: payload(channel.id, pat, "same", "r-12") });
  await tick(30);
  const two = holdAndAwaitSend({ serverId: server.id, seconds: 0.3, payload: payload(channel.id, pat, "same", "r-12") });
  const [a, b] = await Promise.all([one, two]);
  assert.equal(a.id, b.id);
  const stored = await getDb().select().from(messages).where(and(eq(messages.channelId, channel.id), eq(messages.randomId, "r-12")));
  assert.equal(stored.length, 1);
});

test("a page opened during the wait reads the waiting sends of that conversation", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const other = await seed.channel({ server, members: [pat], name: "other" });
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 0.4, payload: payload(channel.id, pat, "hello", "r-list") });
  await tick(100);
  const listed = await listHeldPreviews(channel.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.randomId, "r-list");
  assert.equal(listed[0]!.senderId, pat.id);
  assert.equal(listed[0]!.content, "hello");
  assert.ok(Date.parse(listed[0]!.releaseAt) > Date.parse(listed[0]!.createdAt));
  assert.deepEqual(await listHeldPreviews(other.id), [], "only that conversation");
  await sending;
  assert.deepEqual(await listHeldPreviews(channel.id), [], "gone once released");
});

test("send now delivers the waiting message at once, once; the request answers as usual", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 30, payload: payload(channel.id, pat, "now please", "r-now") });
  await tick(100);
  assert.equal((await messagesIn(channel.id)).length, 0);
  assert.deepEqual(await sendHeldNow(pat.id, "r-now"), { sent: true });
  const enriched = await sending;
  assert.equal(enriched.content, "now please");
  assert.equal((await messagesIn(channel.id)).length, 1);
  assert.equal((await pendingRows(pat.id)).length, 0);
  assert.deepEqual(await sendHeldNow(pat.id, "r-now"), { sent: false }, "nothing left to send");
  assert.deepEqual(await withdrawHeldSend(pat.id, "r-now"), { withdrawn: false }, "too late to withdraw");
  await tick(50);
  assert.equal((await messagesIn(channel.id)).length, 1, "sent once");
});

test("only the sender can send it now", async ({ seed }) => {
  const { pat, bob, server, channel } = await setup(seed);
  const sending = holdAndAwaitSend({ serverId: server.id, seconds: 0.4, payload: payload(channel.id, pat, "mine", "r-mine") });
  await tick(100);
  assert.deepEqual(await sendHeldNow(bob.id, "r-mine"), { sent: false });
  assert.equal((await messagesIn(channel.id)).length, 0);
  await sending;
});

test("send now on a send from before a restart says so truthfully when the send refuses", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  // A row a restart left behind: stored, no timer and no waiter in this process.
  await getDb().insert(pendingHumanSends).values({
    serverId: server.id,
    channelId: channel.id,
    senderUserId: pat.id,
    randomId: "r-orphan",
    payload: payload(channel.id, pat, "from before", "r-orphan"),
    releaseAt: new Date(Date.now() + 60_000),
  });
  await getDb().update(channels).set({ archivedAt: new Date() }).where(eq(channels.id, channel.id));
  assert.deepEqual(await sendHeldNow(pat.id, "r-orphan"), { sent: false });
  assert.equal((await messagesIn(channel.id)).length, 0);
  assert.equal((await pendingRows(pat.id)).length, 0, "the refused row goes");
});

test("send now on a send from before a restart delivers it", async ({ seed }) => {
  const { pat, server, channel } = await setup(seed);
  await getDb().insert(pendingHumanSends).values({
    serverId: server.id,
    channelId: channel.id,
    senderUserId: pat.id,
    randomId: "r-orphan-ok",
    payload: payload(channel.id, pat, "from before", "r-orphan-ok"),
    releaseAt: new Date(Date.now() + 60_000),
  });
  assert.deepEqual(await sendHeldNow(pat.id, "r-orphan-ok"), { sent: true });
  assert.equal((await messagesIn(channel.id)).length, 1);
});
