import { agentUsageBatchSchema } from "@botiverse/raft-shared";
import type { AgentUsageOutbox } from "./agentUsageOutbox";

/** Send one bounded batch; the caller serializes invocations and schedules retries.
 * The attachment identity is fixed for a queue's lifetime. Never discard data
 * on network errors, malformed replies or permanent server rejections. */
export async function syncAgentUsageOnce(input: {
  outbox: AgentUsageOutbox;
  serverId: string;
  computerId: string;
  gapOnly?: boolean;
  send: (batch: unknown) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}): Promise<"idle" | "delivered" | "retry"> {
  const records = input.gapOnly ? [] : input.outbox.pending(100);
  // A conflicting warning must never block delivery of independent records.
  const gap = records.length ? null : input.outbox.gap();
  if (!records.length && !gap) return "idle";
  if (records.some((record) => record.serverId !== input.serverId || record.computerId !== input.computerId)) return "retry";
  const body = agentUsageBatchSchema.parse({ records, ...(gap ? { gap } : {}) });
  let response: { ok: boolean; json: () => Promise<unknown> };
  let acknowledgment: unknown;
  try {
    response = await input.send(body);
    if (!response.ok) {
      const rejected = await response.json().catch(() => null) as { error?: unknown; recordId?: unknown; serverTime?: unknown } | null;
      // A proven conflicting identifier cannot succeed on retry. Preserve it
      // locally for diagnosis while allowing unrelated queued turns to move.
      if (rejected?.error === "record_conflict" && typeof rejected.recordId === "string" && records.some((record) => record.id === rejected.recordId)) {
        input.outbox.quarantine(rejected.recordId, "invalid_record");
      } else if ((rejected?.error === "agent_not_authorized" || rejected?.error === "timestamp_in_future") && typeof rejected.recordId === "string" && records.some((record) => record.id === rejected.recordId)) {
        // Placement history can arrive later, and a future timestamp can
        // become eligible with time. Retain either for retry without stalling
        // unrelated agents; only uncertain ownership creates a gap warning.
        const serverTime = typeof rejected.serverTime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rejected.serverTime) && Number.isFinite(Date.parse(rejected.serverTime)) && new Date(rejected.serverTime).toISOString() === rejected.serverTime ? rejected.serverTime : undefined;
        input.outbox.quarantine(rejected.recordId, rejected.error === "timestamp_in_future" ? "clock_skew_deferred" : "authorization_rejected", serverTime);
      } else if (rejected?.error === "gap_conflict" && gap && rejected.recordId === gap.id) {
        input.outbox.rekeyGap(gap);
      }
      return "retry";
    }
    acknowledgment = await response.json();
  } catch {
    return "retry";
  }
  if (!acknowledgment || typeof acknowledgment !== "object") return "retry";
  const reply = acknowledgment as { recordIds?: unknown; gapId?: unknown };
  const expected = new Set(records.map((record) => record.id));
  if (!Array.isArray(reply.recordIds) || reply.recordIds.length !== expected.size ||
      new Set(reply.recordIds).size !== expected.size ||
      !reply.recordIds.every((id: unknown) => typeof id === "string" && expected.has(id)) ||
      reply.gapId !== (gap?.id ?? null)) return "retry";
  // Both operations are individually durable. A crash between them only
  // causes a safe replay: the server accepts exact repeats idempotently.
  input.outbox.acknowledge(reply.recordIds);
  if (gap) input.outbox.acknowledgeGap(gap);
  return "delivered";
}
