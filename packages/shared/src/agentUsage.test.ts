import { expect, test } from "vitest";
import { agentUsageBatchSchema, agentUsageRecordSchema } from "./agentUsage";

const sample = {
  id: "00000000-0000-4000-8000-000000000001",
  serverId: "00000000-0000-4000-8000-000000000002",
  computerId: "00000000-0000-4000-8000-000000000003",
  agentId: "00000000-0000-4000-8000-000000000004",
  runtime: "codex",
  endedAt: "2026-11-08T10:00:00.000Z",
  complete: true,
  input: 10,
  output: 5,
  cacheRead: 3,
  cacheWrite: null,
  reasoning: null,
};

test("usage records reject extra data, invalid counts and unobserved complete records", () => {
  expect(agentUsageRecordSchema.safeParse(sample).success).toBe(true);
  expect(
    agentUsageRecordSchema.safeParse({ ...sample, prompt: "not usage" })
      .success,
  ).toBe(false);
  expect(
    agentUsageRecordSchema.safeParse({ ...sample, input: -1 }).success,
  ).toBe(false);
  expect(
    agentUsageRecordSchema.safeParse({
      ...sample,
      output: Number.MAX_SAFE_INTEGER + 1,
    }).success,
  ).toBe(false);
  expect(
    agentUsageRecordSchema.safeParse({
      ...sample,
      input: null,
      output: null,
      cacheRead: null,
    }).success,
  ).toBe(false);
  expect(
    agentUsageRecordSchema.safeParse({ ...sample, endedAt: "not-a-date" })
      .success,
  ).toBe(false);
});

test("usage batches are bounded and gap ranges must be ordered", () => {
  expect(agentUsageBatchSchema.safeParse({ records: [] }).success).toBe(false);
  expect(
    agentUsageBatchSchema.safeParse({ records: Array(101).fill(sample) })
      .success,
  ).toBe(false);
  const gap = {
    id: sample.id,
    firstEndedAt: "2026-11-09T00:00:00Z",
    lastEndedAt: "2026-11-08T00:00:00Z",
    failedAttempts: 1,
  };
  expect(agentUsageBatchSchema.safeParse({ records: [], gap }).success).toBe(
    false,
  );
  expect(agentUsageBatchSchema.safeParse({ records: [sample] }).success).toBe(
    true,
  );
});
