import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { AgentUsageReporter } from "./agentUsageReporter";
import { AGENT_USAGE_OUTBOX_DIR, AgentUsageOutbox } from "./agentUsageOutbox";
import type { daemonFetch } from "./daemonFetch";

const serverId = "00000000-0000-4000-8000-000000000001";
const computerId = "00000000-0000-4000-8000-000000000002";
const machineId = "00000000-0000-4000-8000-000000000003";
const agentId = "00000000-0000-4000-8000-000000000004";

test("reporter persists offline turns and never assigns shared OpenCode counts", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-reporter-"));
  const owner = { serverId, machineId };
  const fetcher = (async (url: URL | string) => String(url).endsWith("/context") ? Response.json({ serverId, computerId, machineId }) : new Response(null, { status: 503 })) as typeof daemonFetch;
  const reporter = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "test-only", dataDir: root, owner: () => owner, fetch: fetcher });
  try {
    await reporter.tick();
    reporter.record({ agentId, runtime: "codex", status: "ok", counts: { input: 2, output: 3, cacheRead: 4 } });
    await reporter.tick();
    reporter.record({ agentId, runtime: "opencode", status: "ok", counts: { input: 999, output: 999 } });
    await reporter.tick();
    await reporter.stop();
    const queue = AgentUsageOutbox.open(path.join(root, AGENT_USAGE_OUTBOX_DIR, serverId, `${computerId}.sqlite`));
    const rows = queue.pending();
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.input, 2);
    assert.equal(rows[0]!.complete, false);
    assert.equal(rows[1]!.input, null);
    assert.equal(rows[1]!.output, null);
    queue.close();
    let sent: unknown[] = [];
    const reconnectFetch = (async (url: URL | string, init?: RequestInit) => {
      if (String(url).endsWith("/context")) return Response.json({ serverId, computerId, machineId });
      const batch = JSON.parse(String(init?.body)) as { records: Array<{ id: string }>; gap?: { id: string } };
      sent = batch.records;
      return Response.json({ recordIds: batch.records.map((row) => row.id), gapId: batch.gap?.id ?? null });
    }) as typeof daemonFetch;
    const restarted = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "test-only", dataDir: root, owner: () => owner, fetch: reconnectFetch });
    await restarted.tick();
    assert.equal(sent.length, 2);
    await restarted.stop();
    const reopened = AgentUsageOutbox.open(path.join(root, AGENT_USAGE_OUTBOX_DIR, serverId, `${computerId}.sqlite`));
    assert.equal(reopened.pending().length, 0);
    reopened.close();
  } finally { await reporter.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("reporter does not assign a turn to a different authenticated machine", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-reporter-"));
  const fetcher = (async () => Response.json({ serverId, computerId, machineId })) as typeof daemonFetch;
  const reporter = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "test-only", dataDir: root, owner: () => ({ serverId, machineId: agentId }), fetch: fetcher });
  try {
    await reporter.tick();
    reporter.record({ agentId, runtime: "codex", status: "ok", counts: { input: 2 } });
    await reporter.stop();
    const files = readdirSync(path.join(root, AGENT_USAGE_OUTBOX_DIR));
    const queue = AgentUsageOutbox.open(path.join(root, AGENT_USAGE_OUTBOX_DIR, files.find((name) => name.endsWith(".sqlite"))!));
    assert.equal(queue.pending().length, 0);
    assert.equal(queue.gap()?.failedAttempts, 1);
    queue.close();
  } finally { await reporter.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("a turn before the first check-in leaves a durable warning delivered after restart", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-reporter-"));
  const first = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "test-only", expectedServerId: serverId, dataDir: root, owner: () => null });
  let deliveredGap = false;
  const fetcher = (async (url: URL | string, init?: RequestInit) => {
    if (String(url).endsWith("/context")) return Response.json({ serverId, computerId, machineId });
    const batch = JSON.parse(String(init?.body)) as { records: unknown[]; gap?: { id: string; failedAttempts: number } };
    deliveredGap = batch.records.length === 0 && batch.gap?.failedAttempts === 2;
    return Response.json({ recordIds: [], gapId: batch.gap?.id ?? null });
  }) as typeof daemonFetch;
  const restarted = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "rotated-test-key", expectedServerId: serverId, dataDir: root, owner: () => ({ serverId, machineId }), fetch: fetcher });
  try {
    first.record({ agentId, runtime: "codex", status: "ok", counts: { input: 2 } });
    await first.stop();
    first.record({ agentId, runtime: "codex", status: "cancelled", counts: {} });
    await restarted.tick();
    assert.equal(deliveredGap, true);
  } finally { await first.stop(); await restarted.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("same-origin servers cannot consume each other's pre-identity warnings", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-reporter-"));
  const otherServer = "00000000-0000-4000-8000-000000000005";
  const first = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "first-key", expectedServerId: serverId, dataDir: root, owner: () => null });
  let otherUploads = 0;
  const fetcher = (async (url: URL | string) => {
    if (String(url).endsWith("/context")) return Response.json({ serverId: otherServer, computerId, machineId });
    otherUploads++;
    return Response.json({ recordIds: [], gapId: null });
  }) as typeof daemonFetch;
  const second = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "second-key", expectedServerId: otherServer, dataDir: root, owner: () => ({ serverId: otherServer, machineId }), fetch: fetcher });
  try {
    first.record({ agentId, runtime: "codex", status: "ok", counts: { input: 2 } });
    await first.stop();
    await second.tick();
    assert.equal(otherUploads, 0);
    const files = readdirSync(path.join(root, AGENT_USAGE_OUTBOX_DIR)).filter((name) => name.startsWith("unbound-") && name.endsWith(".sqlite"));
    assert.equal(files.length, 2);
    const queues = files.map((name) => AgentUsageOutbox.open(path.join(root, AGENT_USAGE_OUTBOX_DIR, name)));
    try { assert.deepEqual(queues.map((queue) => queue.gap()?.failedAttempts ?? 0).sort(), [0, 1]); }
    finally { for (const queue of queues) queue.close(); }
  } finally { await first.stop(); await second.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("unsupported runtimes and invalid counts leave warnings rather than silent drops", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-reporter-"));
  const fetcher = (async (url: URL | string) => String(url).endsWith("/context") ? Response.json({ serverId, computerId, machineId }) : new Response(null, { status: 503 })) as typeof daemonFetch;
  const reporter = new AgentUsageReporter({ serverUrl: "http://localhost", apiKey: "test-only", dataDir: root, owner: () => ({ serverId, machineId }), fetch: fetcher });
  try {
    await reporter.tick();
    reporter.record({ agentId, runtime: "other", status: "ok", counts: {} });
    await reporter.tick();
    reporter.record({ agentId, runtime: "codex", status: "ok", counts: { input: -1 } });
    await reporter.tick();
    await reporter.stop();
    const queue = AgentUsageOutbox.open(path.join(root, AGENT_USAGE_OUTBOX_DIR, serverId, `${computerId}.sqlite`));
    assert.equal(queue.gap()?.failedAttempts, 2);
    queue.close();
  } finally { await reporter.stop(); rmSync(root, { recursive: true, force: true }); }
});
