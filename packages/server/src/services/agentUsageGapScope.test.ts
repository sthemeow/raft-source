import assert from "node:assert/strict";
import { test } from "vitest";
import { scopeUsageGaps } from "./agentUsageGapScope";
const time = (value: string) => new Date(`2026-11-08T${value}:00Z`);
const gap = { computerId: "c1", firstEndedAt: time("10:00"), lastEndedAt: time("10:05") };
const placement = { agentId: "a1", machineId: "m1", startedAt: time("09:00"), endedAt: time("11:00") };
test("resolved gap affects only overlapping placements", () => {
  const result = scopeUsageGaps({ gaps: [gap], computerMachines: new Map([["c1", "m1"]]), placements: [placement, { ...placement, agentId: "a2", machineId: "m2" }] });
  assert.equal(result.all, false); assert.deepEqual([...result.agents], ["a1"]);
});
test("unresolved, pre-snapshot, or oversized gaps remain server-wide", () => {
  assert.equal(scopeUsageGaps({ gaps: [gap], computerMachines: new Map(), placements: [] }).all, true);
  assert.equal(scopeUsageGaps({ gaps: [gap], computerMachines: new Map([["c1", "m1"]]), placements: [{ ...placement, startedAt: time("11:30"), endedAt: null }] }).all, true);
  assert.equal(scopeUsageGaps({ gaps: [gap], computerMachines: new Map(), placements: [placement], overflow: true }).all, true);
});
test("legacy machine IDs resolve without a computer row", () => {
  const result = scopeUsageGaps({ gaps: [{ ...gap, computerId: "m1" }], computerMachines: new Map(), placements: [placement] });
  assert.equal(result.all, false); assert.deepEqual([...result.agents], ["a1"]);
});
