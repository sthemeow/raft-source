import type { AgentUsageRecord } from "@botiverse/raft-shared";

export const usageMetrics = ["total", "input", "output", "cachedInput", "uncachedInput", "reasoningOutput", "completionOutput"] as const;
type Metric = (typeof usageMetrics)[number];
type Values = Record<Metric, number | null>;

function add(...values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  const sum = values.reduce<number>((a, b) => a + b!, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}

/** Counts in records are normalised to uncached input, cache read, cache write,
 * and output including reasoning. Codex includes its cached reads in its
 * reported input and has no separate cache-write counter in that input. */
export function usageValues(record: Pick<AgentUsageRecord, "runtime" | "input" | "output" | "cacheRead" | "cacheWrite" | "reasoning">): Values {
  const cached = record.runtime === "codex" ? record.cacheRead : add(record.cacheRead, record.cacheWrite);
  const input = add(record.input, cached);
  const completion = record.output !== null && record.reasoning !== null && record.reasoning <= record.output
    ? record.output - record.reasoning : null;
  return { total: add(input, record.output), input, output: record.output, cachedInput: cached, uncachedInput: record.input, reasoningOutput: record.reasoning, completionOutput: completion };
}

/** Sum the observations that exist. Missing fields contribute nothing to the
 * observed subtotal; a field with no observations stays null. Callers must
 * present the subtotal with an incomplete-coverage notice. */
export function summarizeUsageWithCounts(records: readonly AgentUsageRecord[]): { values: Values; observations: Record<Metric, number> } {
  const values = records.map(usageValues);
  const result = {} as Values;
  const observations = {} as Record<Metric, number>;
  for (const metric of usageMetrics) {
    let total: number | null = null;
    let count = 0;
    for (const value of values) {
      if (value[metric] === null) continue;
      count++;
      total = (total ?? 0) + value[metric]!;
      if (!Number.isSafeInteger(total)) { total = null; break; }
    }
    result[metric] = total;
    observations[metric] = count;
  }
  return { values: result, observations };
}

export function summarizeUsageRecords(records: readonly AgentUsageRecord[]): Values { return summarizeUsageWithCounts(records).values; }
