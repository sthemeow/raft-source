import { z } from "zod";

const usageCount = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .nullable();
const timestamp = z.string().datetime({ offset: true });

/** Provider counts for one attributable observation. Null is unavailable.
 * `complete` means the producer has proven this observation covers the whole
 * turn, not that every provider offers every field. Current daemon sources
 * cannot prove that and therefore always set it to false. */
export const agentUsageRecordSchema = z
  .object({
    id: z.string().uuid(),
    serverId: z.string().uuid(),
    computerId: z.string().uuid(),
    agentId: z.string().uuid(),
    runtime: z.enum(["claude", "codex", "opencode"]),
    endedAt: timestamp,
    complete: z.boolean(),
    input: usageCount,
    output: usageCount,
    cacheRead: usageCount,
    cacheWrite: usageCount,
    reasoning: usageCount,
  })
  .strict()
  .superRefine((record, ctx) => {
    if (
      record.complete &&
      [
        record.input,
        record.output,
        record.cacheRead,
        record.cacheWrite,
        record.reasoning,
      ].every((count) => count === null)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A complete observation needs a count",
      });
    }
  });
export type AgentUsageRecord = z.infer<typeof agentUsageRecordSchema>;

/** A computer-wide warning: failed attempts are not a count of lost turns. */
export const agentUsageGapSchema = z
  .object({
    id: z.string().uuid(),
    firstEndedAt: timestamp,
    lastEndedAt: timestamp,
    failedAttempts: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    (gap) => Date.parse(gap.firstEndedAt) <= Date.parse(gap.lastEndedAt),
    { message: "Invalid usage gap range" },
  );
export type AgentUsageGap = z.infer<typeof agentUsageGapSchema>;

export const agentUsageBatchSchema = z
  .object({
    records: z.array(agentUsageRecordSchema).max(100),
    gap: agentUsageGapSchema.optional(),
  })
  .strict()
  .refine((batch) => batch.records.length > 0 || batch.gap !== undefined, {
    message: "Empty usage batch",
  });
export type AgentUsageBatch = z.infer<typeof agentUsageBatchSchema>;
