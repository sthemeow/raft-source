import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { AgentUsageOutbox, type AgentUsageRecord } from "./agentUsageOutbox";
import { syncAgentUsageOnce } from "./agentUsageSync";

const record: AgentUsageRecord = { id: "00000000-0000-4000-8000-000000000001", serverId: "00000000-0000-4000-8000-000000000002", computerId: "00000000-0000-4000-8000-000000000003", agentId: "00000000-0000-4000-8000-000000000004", runtime: "codex", endedAt: "2026-11-08T10:00:00.000Z", complete: true, input: 2, output: 1, cacheRead: null, cacheWrite: null, reasoning: null };

test("sync retains data on errors and accepts only an exact acknowledgment", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const outbox = AgentUsageOutbox.open(path.join(root, "queue.db"), 1);
  try {
    outbox.append(record);
    assert.throws(() => outbox.append({ ...record, id: "00000000-0000-4000-8000-000000000005" }));
    const identity = { outbox, serverId: record.serverId, computerId: record.computerId };
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => { throw new Error("offline"); } }), "retry");
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => ({ ok: true, json: async () => ({ recordIds: [], gapId: null }) }) }), "retry");
    assert.equal(outbox.pending().length, 1);
    assert.ok(outbox.gap());
    const snapshot = outbox.gap()!;
    assert.equal(await syncAgentUsageOnce({ ...identity, gapOnly: true, send: async () => ({ ok: true, json: async () => ({ recordIds: [], gapId: snapshot.id }) }) }), "delivered");
    outbox.noteGap(record.endedAt);
    assert.equal(await syncAgentUsageOnce({ ...identity, computerId: record.agentId, send: async () => { throw new Error("must not send"); } }), "retry");
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async (body) => {
      const batch = body as { records: AgentUsageRecord[] };
      return { ok: true, json: async () => ({ recordIds: batch.records.map((item) => item.id), gapId: null }) };
    } }), "delivered");
    assert.equal(outbox.pending().length, 0);
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async (body) => {
      const batch = body as { gap: { id: string } };
      outbox.noteGap(record.endedAt);
      return { ok: true, json: async () => ({ recordIds: [], gapId: batch.gap.id }) };
    } }), "delivered");
    assert.equal(outbox.gap()?.failedAttempts, 2);
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a conflicting warning is re-keyed without losing the gap", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const outbox = AgentUsageOutbox.open(path.join(root, "queue.db"));
  try {
    outbox.noteGap(record.endedAt);
    const old = outbox.gap()!;
    const identity = { outbox, serverId: record.serverId, computerId: record.computerId };
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => ({ ok: false, json: async () => ({ error: "gap_conflict", recordId: old.id }) }) }), "retry");
    const current = outbox.gap()!;
    assert.notEqual(current.id, old.id);
    assert.equal(current.failedAttempts, old.failedAttempts);
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => ({ ok: true, json: async () => ({ recordIds: [], gapId: current.id }) }) }), "delivered");
    assert.equal(outbox.gap(), null);
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a confirmed conflicting record is retained in quarantine", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const outbox = AgentUsageOutbox.open(path.join(root, "queue.db"));
  try {
    outbox.append(record);
    assert.equal(await syncAgentUsageOnce({ outbox, serverId: record.serverId, computerId: record.computerId, send: async () => ({ ok: false, json: async () => ({ error: "record_conflict", recordId: record.id }) }) }), "retry");
    assert.equal(outbox.pending().length, 0);
    assert.deepEqual(outbox.quarantined().map((entry) => entry.record.id), [record.id]);
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});

test("an ownership rejection does not block other queued agents", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const outbox = AgentUsageOutbox.open(path.join(root, "queue.db"));
  try {
    const second = { ...record, id: "00000000-0000-4000-8000-000000000005" };
    outbox.append(record); outbox.append(second);
    const identity = { outbox, serverId: record.serverId, computerId: record.computerId };
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => ({ ok: false, json: async () => ({ error: "agent_not_authorized", recordId: record.id }) }) }), "retry");
    assert.equal(outbox.quarantined()[0]?.reason, "authorization_rejected");
    assert.equal(await syncAgentUsageOnce({ ...identity, send: async () => ({ ok: true, json: async () => ({ recordIds: [second.id], gapId: null }) }) }), "delivered");
    outbox.retryQuarantined(record.id);
    assert.deepEqual(outbox.pending().map((item) => item.id), [record.id]);
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a future timestamp is deferred without a permanent gap and can be retried", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const outbox = AgentUsageOutbox.open(path.join(root, "queue.db"));
  try {
    outbox.append(record);
    assert.equal(await syncAgentUsageOnce({ outbox, serverId: record.serverId, computerId: record.computerId, send: async () => ({ ok: false, json: async () => ({ error: "timestamp_in_future", recordId: record.id, serverTime: "2026-11-08T09:00:00.000Z" }) }) }), "retry");
    assert.equal(outbox.quarantined()[0]?.reason, "clock_skew_deferred");
    assert.equal(outbox.gap(), null);
    outbox.retryQuarantined(record.id);
    assert.equal(outbox.pending().length, 1);
    await syncAgentUsageOnce({ outbox, serverId: record.serverId, computerId: record.computerId, send: async () => ({ ok: false, json: async () => ({ error: "timestamp_in_future", recordId: record.id, serverTime: "2026-11-08T09:00:00.000Z" }) }) });
    assert.equal(outbox.gap(), null, "repeated small skew stays a deferral");
    outbox.retryQuarantined(record.id);
    assert.equal(await syncAgentUsageOnce({ outbox, serverId: record.serverId, computerId: record.computerId, send: async () => ({ ok: true, json: async () => ({ recordIds: [record.id], gapId: null }) }) }), "delivered");
    assert.equal(outbox.gap(), null);
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a persistent extreme clock skew warns once across a restart", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-sync-"));
  const file = path.join(root, "queue.db");
  let outbox = AgentUsageOutbox.open(file);
  const far = { ...record, endedAt: "2026-11-10T10:00:00.000Z" };
  const reject = async () => ({ ok: false, json: async () => ({ error: "timestamp_in_future", recordId: far.id, serverTime: "2026-11-08T09:00:00.000Z" }) });
  try {
    outbox.append(far);
    await syncAgentUsageOnce({ outbox, serverId: far.serverId, computerId: far.computerId, send: reject });
    assert.equal(outbox.gap(), null);
    outbox.close();
    outbox = AgentUsageOutbox.open(file);
    outbox.retryQuarantined(far.id);
    await syncAgentUsageOnce({ outbox, serverId: far.serverId, computerId: far.computerId, send: reject });
    const warning = outbox.gap();
    assert.ok(warning);
    assert.equal(warning.failedAttempts, 1);
    outbox.acknowledgeGap(warning);
    outbox.retryQuarantined(far.id);
    await syncAgentUsageOnce({ outbox, serverId: far.serverId, computerId: far.computerId, send: reject });
    assert.equal(outbox.gap(), null, "a repeated rejection does not reissue the same warning");
  } finally { outbox.close(); rmSync(root, { recursive: true, force: true }); }
});
