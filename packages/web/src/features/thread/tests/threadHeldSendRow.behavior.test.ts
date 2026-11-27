// Send hold: the open thread panel renders from its own list
// and only takes a store update when sameMessageList says the rows changed. A
// sending row that turns held (message:held) must count as a change, or the
// sender never sees the Withdraw ring in a thread or a task conversation.
import assert from "node:assert/strict";

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), configurable: true });

const { mergeThreadMessages, sameMessageList } = await import("../threadMessages");
type Message = Parameters<typeof mergeThreadMessages>[0][number];

const sending = {
  id: "optimistic-1",
  channelId: "thread-1",
  randomId: "random-1",
  senderType: "user",
  senderId: "user-1",
  senderName: "User",
  messageType: "chat",
  content: "hello",
  createdAt: "2026-11-27T11:20:00.000Z",
} as Message;
const held = { ...sending, held: { createdAt: "2026-11-27T11:20:00.000Z", releaseAt: "2026-11-27T11:20:05.000Z" } } as Message;

test("a sending row turning held is a change", () => {
  assert.equal(sameMessageList([sending], [held]), false);
  assert.equal(sameMessageList([held], [held]), true);
});

test("merging the held row into the open thread takes it", () => {
  const next = mergeThreadMessages([sending], [held]);
  assert.notEqual(next, [sending]);
  assert.deepEqual(next.map((m) => m.held), [held.held]);
});

test("a withdrawn send's row leaves the open thread; persisted rows stay", async () => {
  const { dropOptimisticRowsGoneFromBucket } = await import("../threadMessages");
  const persisted = { ...sending, id: "message-1", seq: 7 } as Message;
  const preview = { ...held, id: "optimistic-held-random-2", randomId: "random-2" } as Message;
  const existing = [persisted, held, preview];
  assert.deepEqual(dropOptimisticRowsGoneFromBucket(existing, [held]).map((m) => m.id), ["message-1", "optimistic-1"]);
  assert.deepEqual(dropOptimisticRowsGoneFromBucket(existing, []).map((m) => m.id), ["message-1"]);
  assert.equal(dropOptimisticRowsGoneFromBucket(existing, [held, preview]), existing, "unchanged list keeps its identity");
});

test("someone else's held preview joins the open thread beside its replies", async () => {
  const { mergeThreadBucketWithinWindow } = await import("../threadMessages");
  const persisted = { ...sending, id: "message-1", seq: 7, senderId: "user-1" } as Message;
  const preview = { ...held, id: "optimistic-held-random-3", randomId: "random-3", senderId: "user-2", senderName: "Bob" } as Message;
  const next = mergeThreadBucketWithinWindow([persisted], [preview], false);
  assert.deepEqual(next.map((m) => m.id), ["message-1", "optimistic-held-random-3"]);
});
