import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { agentUsageRecordSchema } from "@botiverse/raft-shared";
import { AGENT_USAGE_OUTBOX_DIR, AgentUsageOutbox } from "./agentUsageOutbox";
import { syncAgentUsageOnce } from "./agentUsageSync";
import { daemonFetch } from "./daemonFetch";
import type { TurnTokenCounts } from "./runtimeTurnTokens";
import { logger } from "./logger";

interface Owner { serverId: string; machineId: string }
interface Identity extends Owner { computerId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One server attachment per queue. Identity is authenticated by the server
 * and checked against the daemon's own connected context before any upload. */
export class AgentUsageReporter {
  private identity: Identity | null = null;
  private outbox: AgentUsageOutbox | null = null;
  private unboundOutbox: AgentUsageOutbox | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private legacyGapLogged = false;
  private lastDeferredRetryAt = Date.now();
  constructor(private readonly options: { serverUrl: string; apiKey: string; dataDir: string; expectedServerId?: string; owner: () => Owner | null; fetch?: typeof daemonFetch }) {}
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, 30_000);
    this.timer.unref?.();
  }
  private sameOwner(identity: Identity): boolean {
    const owner = this.options.owner();
    return !!owner && owner.serverId === identity.serverId && owner.machineId === identity.machineId && (!this.options.expectedServerId || this.options.expectedServerId === identity.serverId);
  }
  private unboundPath(): string {
    // Managed Computer launches have a stable server ID before check-in.
    // A legacy standalone daemon has no such identity, so isolate by its
    // credential rather than risk reporting a warning on another server.
    const partition = this.options.expectedServerId ?? `legacy:${this.options.apiKey}`;
    const key = createHash("sha256").update(new URL(this.options.serverUrl).origin).update("\0").update(partition).digest("hex");
    return path.join(this.options.dataDir, AGENT_USAGE_OUTBOX_DIR, `unbound-${key}.sqlite`);
  }
  private unbound(): AgentUsageOutbox {
    if (!this.unboundOutbox) this.unboundOutbox = AgentUsageOutbox.open(this.unboundPath());
    return this.unboundOutbox;
  }
  private logLegacyGapLocation(): void {
    if (!this.options.expectedServerId && !this.legacyGapLogged) {
      this.legacyGapLogged = true;
      logger.warn(`[Usage] Standalone pre-check-in warning stored at ${this.unboundPath()}`);
    }
  }
  tick(): Promise<void> {
    if (this.running || this.stopped) return this.running ?? Promise.resolve();
    this.running = this.run().catch(() => {}).finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<void> {
    const owner = this.options.owner();
    if (!owner || !uuid.test(owner.serverId) || !uuid.test(owner.machineId)) return;
    const fetcher = this.options.fetch ?? daemonFetch;
    if (!this.identity) {
      const response = await fetcher(new URL("/internal/computer/agent-usage/context", this.options.serverUrl), { headers: { Authorization: `Bearer ${this.options.apiKey}` }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return;
      const value = await response.json() as Partial<Identity>;
      if (!value || ![value.serverId, value.computerId, value.machineId].every((v) => typeof v === "string" && uuid.test(v))) return;
      const identity = value as Identity;
      if (this.stopped || !this.sameOwner(identity)) return;
      this.outbox = AgentUsageOutbox.open(path.join(this.options.dataDir, AGENT_USAGE_OUTBOX_DIR, identity.serverId, `${identity.computerId}.sqlite`));
      this.identity = identity;
    }
    if (!this.outbox || !this.sameOwner(this.identity)) return;
    if (Date.now() - this.lastDeferredRetryAt >= 60 * 60_000) {
      this.lastDeferredRetryAt = Date.now();
      for (const entry of this.outbox.quarantined()) if (entry.reason === "authorization_rejected" || entry.reason === "clock_skew_deferred") this.outbox.retryQuarantined(entry.record.id);
    }
    const identity = this.identity;
    const send = async (body: unknown) => {
      if (!this.sameOwner(identity) || this.stopped) throw new Error("usage attachment changed");
      return fetcher(new URL("/internal/computer/agent-usage", this.options.serverUrl), { method: "POST", headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    };
    await syncAgentUsageOnce({ outbox: this.outbox, serverId: identity.serverId, computerId: identity.computerId, send });
    await syncAgentUsageOnce({ outbox: this.outbox, serverId: identity.serverId, computerId: identity.computerId, gapOnly: true, send });
    await syncAgentUsageOnce({ outbox: this.unbound(), serverId: identity.serverId, computerId: identity.computerId, send });
  }
  record(turn: { agentId: string; runtime: string; counts: TurnTokenCounts; status: "ok" | "error" | "cancelled" }): void {
    if (this.stopped) {
      // A late runtime callback after shutdown still leaves a durable warning;
      // do not keep a SQLite connection or network timer alive after stop.
      const queue = AgentUsageOutbox.open(this.unboundPath());
      try { queue.noteGap(new Date().toISOString()); this.logLegacyGapLocation(); }
      finally { queue.close(); }
      return;
    }
    if (!this.identity || !this.outbox || !this.sameOwner(this.identity)) {
      this.unbound().noteGap(new Date().toISOString());
      this.logLegacyGapLocation();
      return;
    }
    if (turn.runtime !== "claude" && turn.runtime !== "codex" && turn.runtime !== "opencode") {
      this.outbox.noteGap(new Date().toISOString());
      void this.tick();
      return;
    }
    // OpenCode's shared-session events cannot yet be tied to a particular
    // runner. Keep an explicit unknown observation; never assign its counts.
    const counts: TurnTokenCounts = turn.runtime === "opencode" ? {} : turn.counts;
    const parsed = agentUsageRecordSchema.safeParse({ id: randomUUID(), serverId: this.identity.serverId, computerId: this.identity.computerId, agentId: turn.agentId, runtime: turn.runtime, endedAt: new Date().toISOString(), complete: false, input: counts.input ?? null, output: counts.output ?? null, cacheRead: counts.cacheRead ?? null, cacheWrite: counts.cacheWrite ?? null, reasoning: counts.reasoning ?? null });
    if (!parsed.success) {
      this.outbox.noteGap(new Date().toISOString());
      void this.tick();
      return;
    }
    this.outbox.append(parsed.data);
    void this.tick();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
    this.outbox?.close();
    this.outbox = null;
    this.unboundOutbox?.close();
    this.unboundOutbox = null;
    this.identity = null;
  }
}
