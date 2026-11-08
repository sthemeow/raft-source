import assert from "node:assert/strict";
import { test } from "vitest";
import type { AgentUsageRecord } from "@botiverse/raft-shared";
import { summarizeUsageRecords, summarizeUsageWithCounts, usageValues } from "./agentUsageSummary";

const record: AgentUsageRecord = { id: "00000000-0000-4000-8000-000000000001", serverId: "00000000-0000-4000-8000-000000000002", computerId: "00000000-0000-4000-8000-000000000003", agentId: "00000000-0000-4000-8000-000000000004", runtime: "codex", endedAt: "2026-11-08T10:00:00.000Z", complete: true, input: 20, cacheRead: 80, cacheWrite: null, output: 50, reasoning: 10 };

test("normalized Codex input does not double count cache reads or reasoning", () => {
  assert.deepEqual(usageValues(record), { total: 150, input: 100, output: 50, cachedInput: 80, uncachedInput: 20, reasoningOutput: 10, completionOutput: 40 });
});
test("Claude adds cache creation, and missing fields remain unknown", () => {
  const claude = { ...record, runtime: "claude" as const, cacheWrite: 30 };
  assert.equal(usageValues(claude).total, 180);
  const result = summarizeUsageRecords([claude, { ...claude, output: null }]);
  assert.equal(result.total, 180);
  assert.equal(result.input, 260);
  assert.equal(result.output, 50);
  assert.equal(summarizeUsageWithCounts([claude, { ...claude, output: null }]).observations.input, 2);
  assert.equal(summarizeUsageWithCounts([claude, { ...claude, output: null }]).observations.output, 1);
  assert.equal(summarizeUsageRecords([]).total, null);
  assert.equal(usageValues({ ...record, reasoning: 60 }).completionOutput, null);
});
