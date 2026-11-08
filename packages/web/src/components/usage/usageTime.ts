/** Intervals requested by the usage page. The server reports incomplete buckets
 * as null; these must not be filled with zero by the chart. */
export type UsageInterval = "1m" | "10m" | "1h";
export type UsagePreset = "hour" | "day" | "week" | "month" | "total";

const INTERVAL_MS: Record<UsageInterval, number> = { "1m": 60_000, "10m": 600_000, "1h": 3_600_000 };

/** A month is the previous calendar month, clamped when the destination month
 * has fewer days. Total has no implicit beginning: coverage varies by agent. */
export function usagePresetRange(preset: UsagePreset, now: Date): { from: Date | null; to: Date } {
  const to = new Date(now);
  if (preset === "total") return { from: null, to };
  if (preset === "month") {
    const from = new Date(now);
    const day = from.getDate();
    from.setDate(1);
    from.setMonth(from.getMonth() - 1);
    const last = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    from.setDate(Math.min(day, last));
    return { from, to };
  }
  const duration = preset === "hour" ? 3_600_000 : preset === "day" ? 86_400_000 : 7 * 86_400_000;
  return { from: new Date(to.getTime() - duration), to };
}

export function usageBucketStart(timestampMs: number, interval: UsageInterval): number {
  return Math.floor(timestampMs / INTERVAL_MS[interval]) * INTERVAL_MS[interval];
}

/** Missing data breaks the average: it must never be treated as free usage. */
export function usageMovingAverage(values: ReadonlyArray<number | null>, window: number): Array<number | null> {
  if (!Number.isInteger(window) || window < 1) throw new RangeError("window must be a positive integer");
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const segment = values.slice(i + 1 - window, i + 1);
    if (segment.some((value) => value === null || !Number.isFinite(value))) return null;
    return (segment as number[]).reduce((sum, value) => sum + value, 0) / window;
  });
}
