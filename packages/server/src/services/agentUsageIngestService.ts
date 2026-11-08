import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { AgentUsageBatch, AgentUsageRecord } from "@botiverse/raft-shared";
import { getDb } from "../db/index";
import { agentUsageGaps, agentUsagePlacements, agentUsageRecords, agents } from "../db/schema";

export class AgentUsageIngestError extends Error {
  constructor(readonly code: "identity_mismatch" | "agent_not_authorized" | "timestamp_in_future" | "record_conflict" | "gap_conflict", readonly recordId?: string) {
    super(code);
  }
}

function sameRecord(stored: typeof agentUsageRecords.$inferSelect, incoming: AgentUsageRecord): boolean {
  return stored.id === incoming.id.toLowerCase() && stored.serverId === incoming.serverId.toLowerCase() &&
    stored.computerId === incoming.computerId.toLowerCase() && stored.agentId === incoming.agentId.toLowerCase() &&
    stored.runtime === incoming.runtime && stored.endedAt.toISOString() === new Date(incoming.endedAt).toISOString() &&
    stored.complete === incoming.complete && stored.input === incoming.input && stored.output === incoming.output &&
    stored.cacheRead === incoming.cacheRead && stored.cacheWrite === incoming.cacheWrite && stored.reasoning === incoming.reasoning;
}

/** All acknowledgments are returned only after the transaction commits. A
 * computer can submit its current agent's observations, or observations from
 * before a recorded migration/archival boundary. Rejected unknown history is
 * kept at the sender, not silently counted or acknowledged. These checks are
 * operational provenance controls, not proof against a compromised computer. */
export async function ingestAgentUsageBatch(input: { serverId: string; computerId: string; machineId: string; batch: AgentUsageBatch }): Promise<{ recordIds: string[]; gapId: string | null }> {
  const { serverId, computerId, machineId, batch } = input;
  for (const record of batch.records) {
    if (record.serverId.toLowerCase() !== serverId.toLowerCase() || record.computerId.toLowerCase() !== computerId.toLowerCase()) {
      throw new AgentUsageIngestError("identity_mismatch", record.id);
    }
  }
  const recordIds = await getDb().transaction(async (tx) => {
    // A stable lock order avoids deadlocks with two overlapping uploads.
    const ordered = [...batch.records].sort((a, b) => a.agentId.localeCompare(b.agentId) || a.id.localeCompare(b.id));
    const ack = new Set<string>();
    for (const record of ordered) {
      const id = record.id.toLowerCase();
      const [already] = await tx.select().from(agentUsageRecords).where(eq(agentUsageRecords.id, id));
      if (already) {
        if (!sameRecord(already, record)) throw new AgentUsageIngestError("record_conflict", id);
        ack.add(id);
        continue;
      }
      const [agent] = await tx.select({ id: agents.id }).from(agents)
        .where(and(eq(agents.id, record.agentId), eq(agents.serverId, serverId))).for("update");
      if (!agent) throw new AgentUsageIngestError("agent_not_authorized", id);
      const endedAt = new Date(record.endedAt);
      if (endedAt.getTime() > Date.now() + 5 * 60_000) throw new AgentUsageIngestError("timestamp_in_future", id);
      const [placement] = await tx.select({ id: agentUsagePlacements.id }).from(agentUsagePlacements).where(and(
        eq(agentUsagePlacements.serverId, serverId), eq(agentUsagePlacements.agentId, record.agentId),
        eq(agentUsagePlacements.machineId, machineId), lte(agentUsagePlacements.startedAt, endedAt),
        or(isNull(agentUsagePlacements.endedAt), gt(agentUsagePlacements.endedAt, endedAt)),
      )).limit(1);
      if (!placement) throw new AgentUsageIngestError("agent_not_authorized", id);
      const inserted = await tx.insert(agentUsageRecords).values({
        id, serverId, computerId, agentId: record.agentId, runtime: record.runtime, endedAt,
        complete: record.complete, input: record.input, output: record.output, cacheRead: record.cacheRead,
        cacheWrite: record.cacheWrite, reasoning: record.reasoning,
      }).onConflictDoNothing().returning({ id: agentUsageRecords.id });
      if (!inserted.length) {
        const [existing] = await tx.select().from(agentUsageRecords).where(eq(agentUsageRecords.id, id));
        if (!existing || !sameRecord(existing, record)) throw new AgentUsageIngestError("record_conflict", id);
      }
      ack.add(id);
    }
    if (batch.gap) {
      const gap = batch.gap;
      const id = gap.id.toLowerCase();
      const first = new Date(gap.firstEndedAt), last = new Date(gap.lastEndedAt);
      const inserted = await tx.insert(agentUsageGaps).values({ id, serverId, computerId, firstEndedAt: first, lastEndedAt: last, failedAttempts: gap.failedAttempts }).onConflictDoNothing().returning({ id: agentUsageGaps.id });
      if (!inserted.length) {
        const [stored] = await tx.select().from(agentUsageGaps).where(eq(agentUsageGaps.id, id)).for("update");
        if (!stored || stored.serverId !== serverId || stored.computerId !== computerId) throw new AgentUsageIngestError("gap_conflict", id);
        if (gap.failedAttempts === stored.failedAttempts) {
          if (first.getTime() !== stored.firstEndedAt.getTime() || last.getTime() !== stored.lastEndedAt.getTime()) throw new AgentUsageIngestError("gap_conflict", id);
        } else if (gap.failedAttempts < stored.failedAttempts) {
          if (first < stored.firstEndedAt || last > stored.lastEndedAt) throw new AgentUsageIngestError("gap_conflict", id);
        } else {
          if (first > stored.firstEndedAt || last < stored.lastEndedAt) throw new AgentUsageIngestError("gap_conflict", id);
          await tx.update(agentUsageGaps).set({ firstEndedAt: first, lastEndedAt: last, failedAttempts: gap.failedAttempts }).where(eq(agentUsageGaps.id, id));
        }
      }
    }
    return [...ack];
  });
  return { recordIds, gapId: batch.gap?.id.toLowerCase() ?? null };
}
