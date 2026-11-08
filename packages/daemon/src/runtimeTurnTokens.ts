import type { ParsedEvent } from "./drivers/index";

type TelemetryEvent = Extract<ParsedEvent, { kind: "telemetry" }>;

/**
 * Tokens one turn used, split the way providers bill them: `input` is uncached
 * input only, `cacheRead` and `cacheWrite` are the cached parts, and `output`
 * includes reasoning. A field a runtime does not report stays undefined, never
 * 0, so a missing number is not mistaken for a free turn.
 */
export interface TurnTokenCounts {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const TOKEN_FIELDS = ["input", "output", "reasoning", "cacheRead", "cacheWrite"] as const;

export interface TurnTokenAccumulator {
  /** Sum of per-call or per-turn reports. */
  added: TurnTokenCounts;
  /** Codex reports running session totals: the totals just before this turn's
   * first model call, and the latest totals. */
  sessionBase?: TurnTokenCounts;
  sessionLatest?: TurnTokenCounts;
}

export function createTurnTokenAccumulator(): TurnTokenAccumulator {
  return { added: {} };
}

function num(attrs: TelemetryEvent["attrs"], key: string): number | undefined {
  const value = attrs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function counts(input: number | undefined, output: number | undefined, cacheRead: number | undefined, cacheWrite: number | undefined): TurnTokenCounts {
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
  };
}

// Codex counts cached input inside `inputTokens`; split it out.
function codexCounts(attrs: TelemetryEvent["attrs"], prefix: "" | "last"): TurnTokenCounts | null {
  const key = (name: string) => (prefix ? `${prefix}${name[0]!.toUpperCase()}${name.slice(1)}` : name);
  const input = num(attrs, key("inputTokens"));
  const cached = num(attrs, key("cachedInputTokens"));
  const output = num(attrs, key("outputTokens"));
  if (input === undefined || cached === undefined || output === undefined) return null;
  const reasoning = num(attrs, key("reasoningOutputTokens"));
  return { ...counts(input - cached, output, cached, undefined), ...(reasoning !== undefined ? { reasoning } : {}) };
}

function addCounts(into: TurnTokenCounts, next: TurnTokenCounts): void {
  for (const field of TOKEN_FIELDS) {
    const value = next[field];
    if (value !== undefined) into[field] = (into[field] ?? 0) + value;
  }
}

/** Folds one `token_usage` report into the open turn. Sources whose numbers
 * are not known to mean the same thing (gemini reports only a total) are
 * skipped rather than guessed. */
export function noteTurnTokenUsage(acc: TurnTokenAccumulator, event: TelemetryEvent): void {
  if (event.name !== "token_usage") return;
  const { attrs } = event;
  switch (event.source) {
    case "claude_result_usage":
      addCounts(acc.added, counts(num(attrs, "inputTokens"), num(attrs, "outputTokens"), num(attrs, "cachedInputTokens"), num(attrs, "cacheCreationInputTokens")));
      return;
    case "pi_message_end_usage":
    case "kimi_turn_step_completed_usage":
      addCounts(acc.added, counts(num(attrs, "input_tokens"), num(attrs, "output_tokens"), num(attrs, "cached_read_tokens"), num(attrs, "cache_write_tokens")));
      return;
    case "codex_thread_token_usage_updated": {
      const total = codexCounts(attrs, "");
      if (!total) return;
      if (!acc.sessionBase) {
        // Totals before this report = totals minus the call it reports, so the
        // first turn after a resume needs no earlier state.
        const last = codexCounts(attrs, "last");
        if (!last) return;
        acc.sessionBase = {};
        for (const field of TOKEN_FIELDS) {
          if (total[field] !== undefined && last[field] !== undefined) acc.sessionBase[field] = total[field]! - last[field]!;
        }
      }
      acc.sessionLatest = total;
      return;
    }
  }
}

export function turnTokenCounts(acc: TurnTokenAccumulator): TurnTokenCounts {
  const result: TurnTokenCounts = { ...acc.added };
  if (acc.sessionBase && acc.sessionLatest) {
    const delta: TurnTokenCounts = {};
    for (const field of TOKEN_FIELDS) {
      const base = acc.sessionBase[field];
      const latest = acc.sessionLatest[field];
      if (base === undefined || latest === undefined) continue;
      // Totals that went backwards (a reset session) give no usable number.
      if (latest < base) return { ...acc.added };
      delta[field] = latest - base;
    }
    addCounts(result, delta);
  }
  return result;
}

export function turnTokenTraceAttrs(acc: TurnTokenAccumulator): Record<string, number> {
  const tokens = turnTokenCounts(acc);
  return {
    ...(tokens.input !== undefined ? { input_tokens: tokens.input } : {}),
    ...(tokens.output !== undefined ? { output_tokens: tokens.output } : {}),
    ...(tokens.reasoning !== undefined ? { reasoning_output_tokens: tokens.reasoning } : {}),
    ...(tokens.cacheRead !== undefined ? { cache_read_tokens: tokens.cacheRead } : {}),
    ...(tokens.cacheWrite !== undefined ? { cache_write_tokens: tokens.cacheWrite } : {}),
  };
}
