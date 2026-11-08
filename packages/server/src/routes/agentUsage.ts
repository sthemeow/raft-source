import type { Request, Response } from "express";
import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { AgentUsageRecord } from "@botiverse/raft-shared";
import { getDb } from "../db/index";
import { agents, agentUsageGaps, agentUsagePlacements, agentUsageRecords, computers } from "../db/schema";
import { getActorServerRoleInServer } from "../lib/actorPermissions";
import { summarizeUsageWithCounts } from "../services/agentUsageSummary";
import { scopeUsageGaps } from "../services/agentUsageGapScope";
import { sendJsonServerError } from "./errorResponse";

const intervals: Record<string, number> = { "1m": 60_000, "10m": 600_000, "1h": 3_600_000 };
const rowLimit = 50_000;
const pointLimit = 100_000;

/** Counts are server-scoped and incomplete history is never filled with zero. */
export async function getAgentUsageSummary(req: Request, res: Response) {
  try {
    const role = await getActorServerRoleInServer(req.serverId!, "user", req.userId!);
    if (!role || role === "guest") return res.status(403).json({ error: "usage_forbidden" });
    const fromText = typeof req.query.from === "string" ? req.query.from : null;
    const toText = typeof req.query.to === "string" ? req.query.to : null;
    const interval = typeof req.query.interval === "string" ? intervals[req.query.interval] : undefined;
    const from = fromText ? new Date(fromText) : null;
    const to = toText ? new Date(toText) : null;
    if (!interval || !to || !Number.isFinite(to.getTime()) || (from && (!Number.isFinite(from.getTime()) || from >= to))) return res.status(400).json({ error: "invalid_usage_range" });
    const db = getDb();
    const members = await db.select({ id: agents.id, name: agents.name, runtime: agents.runtime, deletedAt: agents.deletedAt }).from(agents).where(eq(agents.serverId, req.serverId!));
    if (!members.length) return res.json({ agents: [] });
    const rows = await db.select().from(agentUsageRecords).where(and(eq(agentUsageRecords.serverId, req.serverId!), inArray(agentUsageRecords.agentId, members.map((agent) => agent.id)), ...(from ? [gte(agentUsageRecords.endedAt, from)] : []), lt(agentUsageRecords.endedAt, to))).limit(rowLimit + 1);
    if (rows.length > rowLimit) return res.status(422).json({ error: "usage_range_too_large" });
    const gaps = await db.select({ computerId: agentUsageGaps.computerId, firstEndedAt: agentUsageGaps.firstEndedAt, lastEndedAt: agentUsageGaps.lastEndedAt }).from(agentUsageGaps).where(and(eq(agentUsageGaps.serverId, req.serverId!), lt(agentUsageGaps.firstEndedAt, to), ...(from ? [gte(agentUsageGaps.lastEndedAt, from)] : []))).limit(1001);
    const gapIds = [...new Set(gaps.map((gap) => gap.computerId))];
    const computerRows = gapIds.length ? await db.select({ id: computers.id, machineId: computers.machineId }).from(computers).where(and(eq(computers.serverId, req.serverId!), inArray(computers.id, gapIds))) : [];
    const candidates = [...new Set([...gapIds, ...computerRows.flatMap((computer) => computer.machineId ? [computer.machineId] : [])])];
    const earliestGap = gaps.reduce((earliest, gap) => Math.min(earliest, gap.firstEndedAt.getTime()), Infinity);
    const latestGap = gaps.reduce((latest, gap) => Math.max(latest, gap.lastEndedAt.getTime()), -Infinity);
    const placements = candidates.length ? await db.select({ agentId: agentUsagePlacements.agentId, machineId: agentUsagePlacements.machineId, startedAt: agentUsagePlacements.startedAt, endedAt: agentUsagePlacements.endedAt }).from(agentUsagePlacements).where(and(eq(agentUsagePlacements.serverId, req.serverId!), inArray(agentUsagePlacements.machineId, candidates), lte(agentUsagePlacements.startedAt, new Date(latestGap)), or(isNull(agentUsagePlacements.endedAt), gt(agentUsagePlacements.endedAt, new Date(earliestGap))))).limit(10001) : [];
    const gapScope = scopeUsageGaps({ gaps, computerMachines: new Map(computerRows.map((row) => [row.id, row.machineId])), placements, overflow: gaps.length > 1000 || placements.length > 10000 });
    const start = from?.getTime() ?? rows.reduce((earliest, row) => Math.min(earliest, row.endedAt.getTime()), to.getTime());
    const first = Math.floor(start / interval) * interval;
    const last = Math.floor((to.getTime() - 1) / interval) * interval;
    const bucketCount = Math.max(0, Math.floor((last - first) / interval) + 1);
    const grouped = new Map<string, AgentUsageRecord[]>();
    const received = await db.select({ agentId: agentUsageRecords.agentId, receivedAt: sql<Date>`max(${agentUsageRecords.receivedAt})`.mapWith(agentUsageRecords.receivedAt) }).from(agentUsageRecords).where(and(eq(agentUsageRecords.serverId, req.serverId!), inArray(agentUsageRecords.agentId, members.map((agent) => agent.id)), lt(agentUsageRecords.receivedAt, to))).groupBy(agentUsageRecords.agentId);
    const lastReceived = new Map(received.map((row) => [row.agentId, row.receivedAt.getTime()]));
    for (const row of rows) {
      const list = grouped.get(row.agentId) ?? [];
      list.push({ ...row, runtime: row.runtime as AgentUsageRecord["runtime"], endedAt: row.endedAt.toISOString() });
      grouped.set(row.agentId, list);
    }
    const visibleMembers = members.filter((agent) => !agent.deletedAt || grouped.has(agent.id));
    if (bucketCount * visibleMembers.length > pointLimit) return res.status(422).json({ error: "usage_interval_too_fine" });
    return res.json({ agents: visibleMembers.map((agent) => {
      const records = grouped.get(agent.id) ?? [];
      const buckets = new Map<number, AgentUsageRecord[]>();
      for (const record of records) {
        const time = Math.floor(Date.parse(record.endedAt) / interval) * interval;
        const bucket = buckets.get(time) ?? [];
        bucket.push(record); buckets.set(time, bucket);
      }
      const openCode = agent.runtime === "opencode" || records.some((record) => record.runtime === "opencode");
      const gap = gapScope.all || gapScope.agents.has(agent.id);
      const totals = summarizeUsageWithCounts(records);
      return { id: agent.id, name: agent.name, archived: !!agent.deletedAt, lastReceivedAt: lastReceived.has(agent.id) ? new Date(lastReceived.get(agent.id)!).toISOString() : null, totals: totals.values, totalObservations: totals.observations, coverage: openCode ? (gap ? "opencode_gap" : "opencode_unavailable") : (gap ? "partial_gap" : "partial"), points: Array.from({ length: bucketCount }, (_, index) => {
        const time = first + index * interval;
        const summary = summarizeUsageWithCounts(buckets.get(time) ?? []);
        return { time, values: summary.values, observations: summary.observations };
      }) };
    }) });
  } catch (error) {
    return sendJsonServerError(req, res, { error: "Failed to load usage", logPrefix: "[Agent usage]", err: error });
  }
}
