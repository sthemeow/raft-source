import { describe, expect, it } from "vitest";
import { usageBucketStart, usageMovingAverage, usagePresetRange } from "./usageTime";

describe("usage date ranges and charts", () => {
  it("ends presets at the requested instant and keeps total's start unspecified", () => {
    const now = new Date("2026-11-08T12:34:56.000Z");
    expect(usagePresetRange("week", now)).toEqual({ from: new Date("2026-11-01T12:34:56.000Z"), to: now });
    expect(usagePresetRange("total", now)).toEqual({ from: null, to: now });
  });
  it("clamps a calendar month when the previous month is shorter", () => {
    const now = new Date(2026, 2, 31, 12, 30);
    const result = usagePresetRange("month", now).from!;
    expect([result.getFullYear(), result.getMonth(), result.getDate(), result.getHours()]).toEqual([2026, 1, 28, 12]);
  });
  it("aligns buckets and never turns a coverage gap into a zero in an average", () => {
    expect(usageBucketStart(1_250_000, "10m")).toBe(1_200_000);
    expect(usageMovingAverage([4, 0, null, 6, 2], 2)).toEqual([null, 2, null, null, 4]);
    expect(() => usageMovingAverage([1], 0)).toThrow(RangeError);
  });
});
