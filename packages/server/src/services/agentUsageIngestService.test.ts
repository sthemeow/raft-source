import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { dbTest as test } from "../test/integration/dbTest";
import { agentArchives, agentUsagePlacements, agentUsageGaps, agentUsageRecords, agents } from "../db/schema";
import { createAgent } from "./agentService";
import { registerMachine } from "./machineService";
import { AgentUsageIngestError, ingestAgentUsageBatch } from "./agentUsageIngestService";
import type { AgentUsageRecord } from "@botiverse/raft-shared";

test("usage ingest authenticates provenance, commits idempotently, and preserves coverage warnings", async ({ db, seed }) => {
  const owner = await seed.human();
  const server = await seed.server({ owner });
  const { machine } = await registerMachine(server.id, owner.id, "usage-a");
  const { machine: other } = await registerMachine(server.id, owner.id, "usage-b");
  const agent = await createAgent(server.id, "UsageAgent", { runtime: "codex", model: "test", machineId: machine.id });
  await db.update(agents).set({ createdAt: new Date("2026-11-08T09:00:00.000Z") }).where(eq(agents.id, agent.id));
  await db.update(agentUsagePlacements).set({ startedAt: new Date("2026-11-08T09:00:00.000Z") }).where(eq(agentUsagePlacements.agentId, agent.id));
  const computerId = randomUUID();
  const record: AgentUsageRecord = { id: randomUUID(), serverId: server.id, computerId, agentId: agent.id, runtime: "codex", endedAt: "2026-11-08T10:00:00.000Z", complete: true, input: 100, output: 10, cacheRead: 20, cacheWrite: null, reasoning: 2 };
  const ingest = (records: AgentUsageRecord[], machineId = machine.id, gap?: { id: string; firstEndedAt: string; lastEndedAt: string; failedAttempts: number }) => ingestAgentUsageBatch({ serverId: server.id, computerId, machineId, batch: { records, ...(gap ? { gap } : {}) } });

  assert.deepEqual(await ingest([record]), { recordIds: [record.id], gapId: null });
  assert.deepEqual(await ingest([record]), { recordIds: [record.id], gapId: null });
  assert.equal((await db.select().from(agentUsageRecords)).length, 1);
  await assert.rejects(ingest([{ ...record, input: 999 }]), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "record_conflict");
  await assert.rejects(ingest([{ ...record, id: randomUUID() }], other.id), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "agent_not_authorized");
  await assert.rejects(ingest([{ ...record, id: randomUUID(), computerId: randomUUID() }]), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "identity_mismatch");
  await assert.rejects(ingest([{ ...record, id: randomUUID(), endedAt: new Date(Date.now() + 10 * 60_000).toISOString() }]), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "timestamp_in_future");

  const gap = { id: randomUUID(), firstEndedAt: "2026-11-08T10:00:00.000Z", lastEndedAt: "2026-11-08T10:01:00.000Z", failedAttempts: 1 };
  await ingest([], machine.id, gap);
  const wider = { ...gap, lastEndedAt: "2026-11-08T10:02:00.000Z", failedAttempts: 2 };
  await ingest([], machine.id, wider);
  await ingest([], machine.id, gap); // an old retry is acknowledged but cannot narrow the warning
  const [storedGap] = await db.select().from(agentUsageGaps).where(eq(agentUsageGaps.id, gap.id));
  assert.equal(storedGap.failedAttempts, 2);
  assert.equal(storedGap.lastEndedAt.toISOString(), wider.lastEndedAt);
  await assert.rejects(ingest([], machine.id, { ...wider, lastEndedAt: gap.lastEndedAt }), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "gap_conflict");
  const rolledBack = { ...record, id: randomUUID() };
  await assert.rejects(ingest([rolledBack], machine.id, { ...wider, lastEndedAt: gap.lastEndedAt }), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "gap_conflict");
  assert.equal((await db.select().from(agentUsageRecords).where(eq(agentUsageRecords.id, rolledBack.id))).length, 0);
  await assert.rejects(ingest([], machine.id, { ...gap, firstEndedAt: "2026-11-08T09:00:00.000Z" }), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "gap_conflict");

  const moved = await createAgent(server.id, "MovedAgent", { runtime: "codex", model: "test", machineId: other.id });
  await db.update(agents).set({ createdAt: new Date("2026-11-08T09:00:00Z") }).where(eq(agents.id, moved.id));
  await db.delete(agentUsagePlacements).where(eq(agentUsagePlacements.agentId, moved.id));
  await db.insert(agentUsagePlacements).values([
    { serverId: server.id, agentId: moved.id, machineId: machine.id, startedAt: new Date("2026-11-08T09:00:00Z"), endedAt: new Date("2026-11-08T10:30:00Z") },
    { serverId: server.id, agentId: moved.id, machineId: other.id, startedAt: new Date("2026-11-08T10:31:00Z") },
  ]);
  const oldTurn = { ...record, id: randomUUID(), agentId: moved.id };
  await ingest([oldTurn]);
  await assert.rejects(ingest([{ ...oldTurn, id: randomUUID(), endedAt: "2026-11-08T10:31:30.000Z" }]), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "agent_not_authorized");
  await assert.rejects(ingest([{ ...oldTurn, id: randomUUID(), endedAt: "2026-11-08T10:30:30.000Z" }], other.id), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "agent_not_authorized");
  await ingest([{ ...oldTurn, id: randomUUID(), endedAt: "2026-11-08T10:31:30.000Z" }], other.id);

  // A delayed record from before archival remains attributable to the machine
  // whose identity was captured in the archive, even after current assignment clears.
  await db.insert(agentArchives).values({ agentId: agent.id, serverId: server.id, machineId: machine.id, archivedAt: new Date("2026-11-08T11:00:00.000Z"), workspaceState: "on_computer" });
  await db.update(agents).set({ deletedAt: new Date("2026-11-08T11:00:00.000Z"), machineId: null }).where(eq(agents.id, agent.id));
  await db.update(agentUsagePlacements).set({ endedAt: new Date("2026-11-08T11:00:00.000Z") }).where(eq(agentUsagePlacements.agentId, agent.id));
  const delayed = { ...record, id: randomUUID() };
  assert.deepEqual(await ingest([delayed]), { recordIds: [delayed.id], gapId: null });
  await assert.rejects(ingest([{ ...delayed, id: randomUUID(), endedAt: "2026-11-08T12:00:00.000Z" }]), (e: unknown) => e instanceof AgentUsageIngestError && e.code === "agent_not_authorized");
}, 60_000);
