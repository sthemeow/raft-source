// Send hold: a waiting message's preview (socket message:held)
// marks the sender's own optimistic row, or adds a preview row for anyone
// else; the persisted message replaces the preview by randomId; a withdrawal
// (message:held_removed) takes the preview away.
import assert from "node:assert/strict";

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });

const { useMessageStore } = await import("../src/store/messageStore");
const { HELD_PREVIEW_ID_PREFIX, HELD_PREVIEW_SOCKET_BINDINGS, applyHeldPreview, hydrateHeldPreviews, noteDeliveredSend, removeHeldPreview } = await import("../src/store/heldPreviews");
const { default: api } = await import("../src/api/client");

const CHANNEL = "channel-1";
const preview = {
  randomId: "rand-1",
  channelId: CHANNEL,
  senderId: "user-2",
  senderName: "bob",
  content: "hello",
  createdAt: "2026-11-27T08:00:00.000Z",
  releaseAt: "2026-11-27T08:00:05.000Z",
  attachmentCount: 0,
};

function reset() {
  useMessageStore.setState({
    channelMessages: {},
    messages: [],
    currentChannelId: CHANNEL,
    currentUserId: "user-1",
    unreadCounts: {},
    lastSeq: 100,
  } as never);
}

function rows() {
  return useMessageStore.getState().channelMessages[CHANNEL] ?? [];
}

beforeEach(reset);

test("someone else's waiting message shows as a preview row", () => {
  applyHeldPreview(preview);
  const [row] = rows();
  assert.ok(row);
  assert.equal(row.id, `${HELD_PREVIEW_ID_PREFIX}rand-1`);
  assert.equal(row.content, "hello");
  assert.equal(row.randomId, "rand-1");
  assert.deepEqual(row.held, { createdAt: preview.createdAt, releaseAt: preview.releaseAt });
  assert.equal(useMessageStore.getState().messages.length, 1, "the open channel shows it");
  assert.equal(useMessageStore.getState().unreadCounts[CHANNEL] ?? 0, 0, "a preview is not unread");
});

test("the delivered message replaces the preview in place", () => {
  applyHeldPreview(preview);
  useMessageStore.getState().addMessage({
    id: "msg-1",
    seq: 101,
    channelId: CHANNEL,
    randomId: "rand-1",
    senderType: "user",
    senderId: "user-2",
    senderName: "bob",
    messageType: "chat",
    content: "hello",
    createdAt: "2026-11-27T08:00:05.100Z",
  });
  assert.deepEqual(rows().map((m) => [m.id, m.held]), [["msg-1", undefined]]);
});

test("a withdrawal takes the preview away", () => {
  applyHeldPreview(preview);
  removeHeldPreview({ randomId: "rand-1", channelId: CHANNEL });
  assert.equal(rows().length, 0);
});

test("the sender's own optimistic row is marked held, not duplicated", () => {
  useMessageStore.getState().addOptimisticMessage({
    id: "optimistic-abc",
    channelId: CHANNEL,
    randomId: "rand-2",
    senderType: "user",
    senderId: "user-1",
    senderName: "me",
    messageType: "chat",
    content: "mine",
    createdAt: "2026-11-27T08:00:00.000Z",
  });
  applyHeldPreview({ ...preview, randomId: "rand-2", senderId: "user-1", content: "mine" });
  assert.equal(rows().length, 1);
  assert.equal(rows()[0]!.id, "optimistic-abc");
  assert.deepEqual(rows()[0]!.held, { createdAt: preview.createdAt, releaseAt: preview.releaseAt });
  // A withdrawal elsewhere never removes the sender's own row (its send settles it).
  removeHeldPreview({ randomId: "rand-2", channelId: CHANNEL });
  assert.equal(rows().length, 1);
});

test("a preview arriving after the message was delivered changes nothing", () => {
  useMessageStore.getState().addMessage({
    id: "msg-3",
    seq: 101,
    channelId: CHANNEL,
    randomId: "rand-3",
    senderType: "user",
    senderId: "user-2",
    senderName: "bob",
    messageType: "chat",
    content: "late",
    createdAt: "2026-11-27T08:00:05.000Z",
  });
  applyHeldPreview({ ...preview, randomId: "rand-3", content: "late" });
  assert.deepEqual(rows().map((m) => [m.id, m.held]), [["msg-3", undefined]]);
});

test("a reloaded page reads the waiting sends: shows the listed, drops previews no longer listed", async () => {
  reset();
  applyHeldPreview({ ...preview, randomId: "gone", content: "withdrawn while away" });
  const originalGet = api.get;
  const asked: unknown[] = [];
  api.get = (async (url: string, config?: unknown) => {
    asked.push([url, config]);
    return { data: { held: [preview] } };
  }) as typeof api.get;
  try {
    await hydrateHeldPreviews(CHANNEL);
  } finally {
    api.get = originalGet;
  }
  assert.deepEqual(asked, [["/v2/messages/held", { params: { channelId: CHANNEL } }]]);
  const rows = useMessageStore.getState().channelMessages[CHANNEL] ?? [];
  assert.deepEqual(rows.map((m) => m.id), [`${HELD_PREVIEW_ID_PREFIX}rand-1`]);
  assert.equal(rows[0]!.held?.releaseAt, preview.releaseAt);
});

test("reading the waiting sends twice adds no second row", async () => {
  reset();
  const originalGet = api.get;
  api.get = (async () => ({ data: { held: [preview] } })) as typeof api.get;
  try {
    await hydrateHeldPreviews(CHANNEL);
    await hydrateHeldPreviews(CHANNEL);
  } finally {
    api.get = originalGet;
  }
  assert.equal((useMessageStore.getState().channelMessages[CHANNEL] ?? []).length, 1);
});

function live(event: string, payload: unknown) {
  for (const binding of HELD_PREVIEW_SOCKET_BINDINGS) if (binding.event === event) binding.handler(payload);
}

async function withSlowSnapshot(held: unknown[], during: () => void) {
  const originalGet = api.get;
  let answer!: () => void;
  api.get = (() => new Promise((resolve) => { answer = () => resolve({ data: { held } }); })) as typeof api.get;
  try {
    const reading = hydrateHeldPreviews(CHANNEL);
    during();
    answer();
    await reading;
  } finally {
    api.get = originalGet;
  }
}

const ids = () => (useMessageStore.getState().channelMessages[CHANNEL] ?? []).map((m) => m.id);

test("a snapshot read before a withdrawal does not bring the withdrawn preview back", async () => {
  reset();
  live("message:held", preview);
  await withSlowSnapshot([preview], () => live("message:held_removed", { randomId: preview.randomId, channelId: CHANNEL }));
  assert.deepEqual(ids(), []);
});

test("a snapshot read before a new held send does not take its preview away", async () => {
  reset();
  const fresh = { ...preview, randomId: "rand-new", content: "new" };
  await withSlowSnapshot([], () => live("message:held", fresh));
  assert.deepEqual(ids(), [`${HELD_PREVIEW_ID_PREFIX}rand-new`]);
});

test("a snapshot read before the send was delivered does not bring its preview back", async () => {
  reset();
  live("message:held", preview);
  await withSlowSnapshot([preview], () => {
    noteDeliveredSend(CHANNEL, preview.randomId); // socketBridge messageNew
    removeHeldPreview({ randomId: preview.randomId, channelId: CHANNEL }); // the delivered message replaces the preview
  });
  assert.deepEqual(ids(), []);
});

test("sends no live event touched still follow the snapshot", async () => {
  reset();
  live("message:held", { ...preview, randomId: "stale" });
  await withSlowSnapshot([preview], () => {});
  assert.deepEqual(ids(), [`${HELD_PREVIEW_ID_PREFIX}rand-1`]);
});

test("of two reads, an older one answering last changes nothing", async () => {
  reset();
  const originalGet = api.get;
  const answers: Array<(held: unknown[]) => void> = [];
  api.get = (() => new Promise((resolve) => { answers.push((held) => resolve({ data: { held } })); })) as typeof api.get;
  try {
    const older = hydrateHeldPreviews(CHANNEL);
    const newer = hydrateHeldPreviews(CHANNEL);
    answers[1]!([]);
    await newer;
    answers[0]!([preview]);
    await older;
  } finally {
    api.get = originalGet;
  }
  assert.deepEqual(ids(), []);
});
