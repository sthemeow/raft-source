import assert from "node:assert/strict";
import { test } from "vitest";
import type { ParsedEvent } from "./drivers/index";
import { createTurnTokenAccumulator, noteTurnTokenUsage, turnTokenTraceAttrs } from "./runtimeTurnTokens";

type TelemetryEvent = Extract<ParsedEvent, { kind: "telemetry" }>;
const usage = (source: string, attrs: TelemetryEvent["attrs"]): TelemetryEvent => ({ kind: "telemetry", name: "token_usage", source, attrs });

test("Claude's per-turn result usage maps to the four turn fields", () => {
  const acc = createTurnTokenAccumulator();
  noteTurnTokenUsage(acc, usage("claude_result_usage", { inputTokens: 12, outputTokens: 900, cachedInputTokens: 80_000, cacheCreationInputTokens: 3_000, totalCostUsd: 0.4 }));
  assert.deepEqual(turnTokenTraceAttrs(acc), { input_tokens: 12, output_tokens: 900, cache_read_tokens: 80_000, cache_write_tokens: 3_000 });
});

test("per-call reports (pi messages, Kimi steps) add up over the turn", () => {
  const acc = createTurnTokenAccumulator();
  noteTurnTokenUsage(acc, usage("pi_message_end_usage", { input_tokens: 100, output_tokens: 10, cached_read_tokens: 1_000 }));
  noteTurnTokenUsage(acc, usage("pi_message_end_usage", { input_tokens: 50, output_tokens: 5, cached_read_tokens: 1_100 }));
  // pi never reported cache writes, so the field stays off rather than 0.
  assert.deepEqual(turnTokenTraceAttrs(acc), { input_tokens: 150, output_tokens: 15, cache_read_tokens: 2_100 });

  const kimi = createTurnTokenAccumulator();
  noteTurnTokenUsage(kimi, usage("kimi_turn_step_completed_usage", { input_tokens: 7, output_tokens: 3, cached_read_tokens: 0, cache_write_tokens: 40 }));
  assert.deepEqual(turnTokenTraceAttrs(kimi), { input_tokens: 7, output_tokens: 3, cache_read_tokens: 0, cache_write_tokens: 40 });
});

test("Codex session totals become this turn's usage, with cached input split out", () => {
  const acc = createTurnTokenAccumulator();
  // The thread had used 10,000 input (8,000 cached) and 500 output before
  // this turn; the turn's first call adds 3,000 input (2,500 cached) and 100 output.
  noteTurnTokenUsage(acc, usage("codex_thread_token_usage_updated", {
    inputTokens: 13_000, cachedInputTokens: 10_500, outputTokens: 600,
    lastInputTokens: 3_000, lastCachedInputTokens: 2_500, lastOutputTokens: 100,
  }));
  noteTurnTokenUsage(acc, usage("codex_thread_token_usage_updated", {
    inputTokens: 17_000, cachedInputTokens: 13_500, outputTokens: 800,
    lastInputTokens: 4_000, lastCachedInputTokens: 3_000, lastOutputTokens: 200,
  }));
  assert.deepEqual(turnTokenTraceAttrs(acc), { input_tokens: 1_500, output_tokens: 300, cache_read_tokens: 5_500 });
});

test("unusable reports leave the fields off", () => {
  const noLast = createTurnTokenAccumulator();
  noteTurnTokenUsage(noLast, usage("codex_thread_token_usage_updated", { inputTokens: 13_000, cachedInputTokens: 10_500, outputTokens: 600 }));
  assert.deepEqual(turnTokenTraceAttrs(noLast), {});

  const reset = createTurnTokenAccumulator();
  noteTurnTokenUsage(reset, usage("codex_thread_token_usage_updated", {
    inputTokens: 13_000, cachedInputTokens: 10_500, outputTokens: 600, lastInputTokens: 3_000, lastCachedInputTokens: 2_500, lastOutputTokens: 100,
  }));
  noteTurnTokenUsage(reset, usage("codex_thread_token_usage_updated", {
    inputTokens: 900, cachedInputTokens: 0, outputTokens: 20, lastInputTokens: 900, lastCachedInputTokens: 0, lastOutputTokens: 20,
  }));
  assert.deepEqual(turnTokenTraceAttrs(reset), {}, "totals that went backwards give no number");

  const gemini = createTurnTokenAccumulator();
  noteTurnTokenUsage(gemini, usage("gemini_result_stats", { total_tokens: 5_000 }));
  noteTurnTokenUsage(gemini, { kind: "telemetry", name: "rate_limits", source: "claude_result_usage", attrs: { inputTokens: 1 } });
  assert.deepEqual(turnTokenTraceAttrs(gemini), {});
});

test("Codex reasoning is counted per turn only when both baseline and current usage exist", () => {
  const acc = createTurnTokenAccumulator();
  noteTurnTokenUsage(acc, usage("codex_thread_token_usage_updated", {
    inputTokens: 130, cachedInputTokens: 50, outputTokens: 60, reasoningOutputTokens: 20,
    lastInputTokens: 30, lastCachedInputTokens: 10, lastOutputTokens: 10, lastReasoningOutputTokens: 4,
  }));
  noteTurnTokenUsage(acc, usage("codex_thread_token_usage_updated", {
    inputTokens: 150, cachedInputTokens: 60, outputTokens: 70, reasoningOutputTokens: 25,
    lastInputTokens: 20, lastCachedInputTokens: 10, lastOutputTokens: 10, lastReasoningOutputTokens: 5,
  }));
  assert.deepEqual(turnTokenTraceAttrs(acc), { input_tokens: 30, output_tokens: 20, cache_read_tokens: 20, reasoning_output_tokens: 9 });

  const missingBaseline = createTurnTokenAccumulator();
  noteTurnTokenUsage(missingBaseline, usage("codex_thread_token_usage_updated", {
    inputTokens: 130, cachedInputTokens: 50, outputTokens: 60, reasoningOutputTokens: 20,
    lastInputTokens: 30, lastCachedInputTokens: 10, lastOutputTokens: 10,
  }));
  assert.deepEqual(turnTokenTraceAttrs(missingBaseline), { input_tokens: 20, output_tokens: 10, cache_read_tokens: 10 });
});
