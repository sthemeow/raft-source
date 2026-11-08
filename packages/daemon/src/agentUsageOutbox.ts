import { chmodSync, closeSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Counts must be attributable to this agent, not merely observed in a shared
 * session. Null means unavailable, never zero. `complete` describes coverage,
 * not support for every metric. Output includes reasoning. */
export interface AgentUsageRecord {
  id: string;
  serverId: string;
  computerId: string;
  agentId: string;
  runtime: "claude" | "codex" | "opencode";
  endedAt: string;
  complete: boolean;
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
}

interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
type SqliteModule = { DatabaseSync: new (file: string) => SqliteDatabase };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_USAGE_OUTBOX_MAX_RECORDS = 10_000;
export const AGENT_USAGE_OUTBOX_DIR = ".usage-outbox";
export class AgentUsageOutboxFullError extends Error {
  constructor() {
    super("Usage outbox is full; coverage may be incomplete");
    this.name = "AgentUsageOutboxFullError";
  }
}
export interface AgentUsageOutboxGap {
  id: string;
  firstEndedAt: string;
  lastEndedAt: string;
  /** Failed append attempts, not a count of lost or distinct turns. */
  failedAttempts: number;
}
export type AgentUsageQuarantineReason =
  | "invalid_record"
  | "agent_unavailable"
  | "authorization_rejected"
  | "clock_skew_deferred";
const QUARANTINE_REASONS: readonly string[] = [
  "invalid_record",
  "agent_unavailable",
  "authorization_rejected",
  "clock_skew_deferred",
];
const counts = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "reasoning",
] as const;

function isCanonicalTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function validateGap(gap: AgentUsageOutboxGap): void {
  if (
    typeof gap.id !== "string" ||
    !UUID.test(gap.id) ||
    !isCanonicalTimestamp(gap.firstEndedAt) ||
    !isCanonicalTimestamp(gap.lastEndedAt) ||
    Date.parse(gap.firstEndedAt) > Date.parse(gap.lastEndedAt) ||
    !Number.isSafeInteger(gap.failedAttempts) ||
    gap.failedAttempts < 1
  )
    throw new Error("Invalid persisted usage gap");
}

function canonicalRecord(record: AgentUsageRecord): AgentUsageRecord {
  if (
    ![record.id, record.serverId, record.computerId, record.agentId].every(
      (id) => typeof id === "string" && UUID.test(id),
    )
  )
    throw new Error("Invalid usage record identity");
  if (
    !(
      record.runtime === "claude" ||
      record.runtime === "codex" ||
      record.runtime === "opencode"
    )
  )
    throw new Error("Invalid usage runtime");
  if (
    typeof record.complete !== "boolean" ||
    !isCanonicalTimestamp(record.endedAt)
  )
    throw new Error("Invalid usage record metadata");
  for (const field of counts) {
    const value = record[field];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new Error(`Invalid usage count: ${field}`);
  }
  if (record.complete && counts.every((field) => record[field] === null))
    throw new Error("Complete usage record has no observations");
  // Explicit projection prevents credentials, prompts or other caller data from
  // being persisted or sent if a wider object is passed at runtime.
  return {
    id: record.id.toLowerCase(),
    serverId: record.serverId.toLowerCase(),
    computerId: record.computerId.toLowerCase(),
    agentId: record.agentId.toLowerCase(),
    runtime: record.runtime,
    endedAt: new Date(record.endedAt).toISOString(),
    complete: record.complete,
    input: record.input,
    output: record.output,
    cacheRead: record.cacheRead,
    cacheWrite: record.cacheWrite,
    reasoning: record.reasoning,
  };
}

/** A computer-local, durable queue. Callers must only acknowledge IDs after
 * the server commits them. File permissions do not isolate processes sharing
 * the daemon's OS user. A write failure must be surfaced as missing coverage. */
export class AgentUsageOutbox {
  private constructor(
    private readonly db: SqliteDatabase,
    private readonly maxRecords: number,
  ) {}

  static open(
    file: string,
    maxRecords = DEFAULT_USAGE_OUTBOX_MAX_RECORDS,
  ): AgentUsageOutbox {
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1)
      throw new RangeError("Invalid usage outbox capacity");
    const sqlite = (
      process as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule?.("node:sqlite") as SqliteModule | undefined;
    if (!sqlite) throw new Error("Usage outbox requires node:sqlite");
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      closeSync(openSync(file, "wx", 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!lstatSync(file).isFile())
        throw new Error("Invalid usage outbox file");
    }
    const db = new sqlite.DatabaseSync(file);
    try {
      chmodSync(file, 0o600);
      const version = db.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (version.user_version > 1)
        throw new Error("Unsupported usage outbox schema version");
      db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;",
      );
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(
          "CREATE TABLE IF NOT EXISTS usage_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, seq INTEGER NOT NULL, quarantine_reason TEXT); CREATE INDEX IF NOT EXISTS usage_outbox_seq ON usage_outbox(seq); CREATE TABLE IF NOT EXISTS usage_outbox_gap (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), gap_id TEXT NOT NULL, first_ended_at TEXT NOT NULL, last_ended_at TEXT NOT NULL, failed_attempts INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS usage_outbox_clock_retries (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, gap_flagged INTEGER NOT NULL DEFAULT 0);",
        );
        const columns = db
          .prepare("PRAGMA table_info(usage_outbox)")
          .all() as Array<{ name: string }>;
        if (!columns.some((column) => column.name === "quarantine_reason")) {
          if (version.user_version !== 0)
            throw new Error("Invalid usage outbox schema");
          db.exec("ALTER TABLE usage_outbox ADD COLUMN quarantine_reason TEXT");
        }
        // Older compatible readers may have acknowledged a record without
        // knowing about the additive clock-retry table.
        db.exec("DELETE FROM usage_outbox_clock_retries WHERE id NOT IN (SELECT id FROM usage_outbox)");
        db.exec("PRAGMA user_version=1; COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return new AgentUsageOutbox(db, maxRecords);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  append(record: AgentUsageRecord): void {
    const normalized = canonicalRecord(record);
    const payload = JSON.stringify(normalized);
    // The existing record must be identical: accepting the same id with
    // different counts would make a retry silently corrupt accounting.
    this.db.exec("BEGIN IMMEDIATE");
    let full = false;
    try {
      const existing = this.db
        .prepare("SELECT payload FROM usage_outbox WHERE id = ?")
        .get(normalized.id) as { payload: string } | undefined;
      if (existing && existing.payload !== payload)
        throw new Error("Conflicting usage record identity");
      if (!existing) {
        const count = this.db
          .prepare("SELECT COUNT(*) AS n FROM usage_outbox")
          .get() as { n: number };
        if (count.n >= this.maxRecords) {
          // Keep one bounded, durable machine-wide gap marker. Failed writes
          // caused by the filesystem itself still require fail-closed handling
          // by the caller because even this marker may be unwritable.
          this.db
            .prepare(
              "INSERT INTO usage_outbox_gap (singleton, gap_id, first_ended_at, last_ended_at, failed_attempts) VALUES (1, ?, ?, ?, 1) ON CONFLICT(singleton) DO UPDATE SET first_ended_at = MIN(first_ended_at, excluded.first_ended_at), last_ended_at = MAX(last_ended_at, excluded.last_ended_at), failed_attempts = failed_attempts + 1",
            )
            .run(randomUUID(), normalized.endedAt, normalized.endedAt);
          full = true;
        } else {
          this.db
            .prepare(
              "INSERT INTO usage_outbox (id, payload, seq) VALUES (?, ?, COALESCE((SELECT MAX(seq)+1 FROM usage_outbox), 1))",
            )
            .run(normalized.id, payload);
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (full) throw new AgentUsageOutboxFullError();
  }

  gap(): AgentUsageOutboxGap | null {
    const row = this.db
      .prepare(
        "SELECT gap_id AS id, first_ended_at AS firstEndedAt, last_ended_at AS lastEndedAt, failed_attempts AS failedAttempts FROM usage_outbox_gap WHERE singleton = 1",
      )
      .get() as AgentUsageOutboxGap | undefined;
    if (row) validateGap(row);
    return row ?? null;
  }

  /** Persist an uncertain turn when attachment identity is not yet known. */
  noteGap(endedAt: string, referenceTime: string = endedAt): void {
    if (!isCanonicalTimestamp(endedAt) || !isCanonicalTimestamp(referenceTime)) throw new Error("Invalid usage gap time");
    const first = endedAt < referenceTime ? endedAt : referenceTime;
    const last = endedAt > referenceTime ? endedAt : referenceTime;
    this.db.prepare("INSERT INTO usage_outbox_gap (singleton, gap_id, first_ended_at, last_ended_at, failed_attempts) VALUES (1, ?, ?, ?, 1) ON CONFLICT(singleton) DO UPDATE SET first_ended_at = MIN(first_ended_at, excluded.first_ended_at), last_ended_at = MAX(last_ended_at, excluded.last_ended_at), failed_attempts = failed_attempts + 1").run(randomUUID(), first, last);
  }

  /** Only clear the exact snapshot durably accepted by the server. A new gap
   * observed while it is in flight changes the count, so it remains queued. */
  acknowledgeGap(gap: AgentUsageOutboxGap): void {
    validateGap(gap);
    this.db
      .prepare(
        "DELETE FROM usage_outbox_gap WHERE singleton = 1 AND gap_id = ? AND first_ended_at = ? AND last_ended_at = ? AND failed_attempts = ?",
      )
      .run(gap.id, gap.firstEndedAt, gap.lastEndedAt, gap.failedAttempts);
  }

  /** A server-side ID collision does not discard the warning. Retry the same
   * snapshot with a fresh ID; if it changed in flight, leave it untouched. */
  rekeyGap(gap: AgentUsageOutboxGap): void {
    validateGap(gap);
    this.db.prepare("UPDATE usage_outbox_gap SET gap_id = ? WHERE singleton = 1 AND gap_id = ? AND first_ended_at = ? AND last_ended_at = ? AND failed_attempts = ?")
      .run(randomUUID(), gap.id, gap.firstEndedAt, gap.lastEndedAt, gap.failedAttempts);
  }

  pending(limit = 100): AgentUsageRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError("Invalid usage batch limit");
    const rows = this.db
      .prepare(
        "SELECT payload FROM usage_outbox WHERE quarantine_reason IS NULL ORDER BY seq LIMIT ?",
      )
      .all(limit) as Array<{ payload: string }>;
    return rows.map((row) =>
      canonicalRecord(JSON.parse(row.payload) as AgentUsageRecord),
    );
  }

  /** Rejected records remain on disk and count toward capacity. Authorization
   * rejections may be retried when the server's placement history changes. */
  quarantine(id: string, reason: AgentUsageQuarantineReason, referenceTime?: string): void {
    if (!UUID.test(id) || !QUARANTINE_REASONS.includes(reason))
      throw new Error("Invalid usage quarantine");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT payload, quarantine_reason AS reason FROM usage_outbox WHERE id = ?").get(id.toLowerCase()) as { payload: string; reason: string | null } | undefined;
      if (row && row.reason === null) {
        const record = canonicalRecord(JSON.parse(row.payload) as AgentUsageRecord);
        this.db.prepare("UPDATE usage_outbox SET quarantine_reason = ? WHERE id = ?").run(reason, id.toLowerCase());
        // A possibly lost record and its warning commit together. A clock
        // deferral is retained for retry and does not create a permanent gap.
        if (reason !== "clock_skew_deferred") {
          this.noteGap(record.endedAt, referenceTime);
        } else {
          this.db.prepare("INSERT INTO usage_outbox_clock_retries (id, attempts) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1").run(id.toLowerCase());
          const retry = this.db.prepare("SELECT attempts, gap_flagged FROM usage_outbox_clock_retries WHERE id = ?").get(id.toLowerCase()) as { attempts: number; gap_flagged: number };
          if (retry.attempts >= 2 && !retry.gap_flagged && referenceTime && Date.parse(record.endedAt) - Date.parse(referenceTime) > 24 * 60 * 60_000) {
            this.noteGap(record.endedAt, referenceTime);
            this.db.prepare("UPDATE usage_outbox_clock_retries SET gap_flagged = 1 WHERE id = ?").run(id.toLowerCase());
          }
        }
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  quarantined(): Array<{
    record: AgentUsageRecord;
    reason: AgentUsageQuarantineReason;
  }> {
    const rows = this.db
      .prepare(
        "SELECT payload, quarantine_reason AS reason FROM usage_outbox WHERE quarantine_reason IS NOT NULL ORDER BY seq",
      )
      .all() as Array<{ payload: string; reason: AgentUsageQuarantineReason }>;
    return rows.map((row) => {
      if (!QUARANTINE_REASONS.includes(row.reason))
        throw new Error("Invalid persisted usage quarantine");
      return {
        record: canonicalRecord(JSON.parse(row.payload) as AgentUsageRecord),
        reason: row.reason,
      };
    });
  }

  retryQuarantined(id: string): void {
    if (!UUID.test(id)) throw new Error("Invalid usage record identity");
    this.db
      .prepare("UPDATE usage_outbox SET quarantine_reason = NULL WHERE id = ?")
      .run(id.toLowerCase());
  }

  acknowledge(ids: readonly string[]): void {
    if (!ids.every((id) => UUID.test(id)))
      throw new Error("Invalid usage acknowledgment");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const remove = this.db.prepare("DELETE FROM usage_outbox WHERE id = ?");
      const removeRetry = this.db.prepare("DELETE FROM usage_outbox_clock_retries WHERE id = ?");
      for (const id of ids) { remove.run(id.toLowerCase()); removeRetry.run(id.toLowerCase()); }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
