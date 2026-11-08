import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { agentUsageBatchSchema } from "../../shared/src/agentUsage";
import {
  AgentUsageOutbox,
  AgentUsageOutboxFullError,
  type AgentUsageRecord,
} from "./agentUsageOutbox";

const record: AgentUsageRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  serverId: "00000000-0000-4000-8000-000000000002",
  computerId: "00000000-0000-4000-8000-000000000003",
  agentId: "00000000-0000-4000-8000-000000000004",
  runtime: "codex",
  endedAt: "2026-11-08T10:00:00.000Z",
  complete: true,
  input: 100,
  output: 10,
  cacheRead: 50,
  cacheWrite: null,
  reasoning: 3,
};
function withFile(fn: (file: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-test-"));
  try {
    fn(path.join(root, "private", "usage.db"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("usage queue survives reopening and removes only acknowledged records", () =>
  withFile((file) => {
    let queue = AgentUsageOutbox.open(file);
    queue.append({ ...record, secret: "not persisted" } as AgentUsageRecord);
    const second = {
      ...record,
      id: "00000000-0000-4000-8000-000000000005",
      input: 42,
    };
    queue.append(second);
    queue.append(record); // replay is idempotent
    assert.throws(() => queue.append({ ...record, input: 999 }), /Conflicting/);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    queue.close();
    queue = AgentUsageOutbox.open(file);
    assert.deepEqual(queue.pending(1), [record]);
    queue.acknowledge([record.id]);
    assert.deepEqual(queue.pending(), [second]);
    queue.close();
    assert.equal(
      readFileSync(file).includes(Buffer.from("not persisted")),
      false,
    );
  }));

test("invalid identities, negative or non-integer token counts and invalid batch sizes fail closed", () =>
  withFile((file) => {
    const queue = AgentUsageOutbox.open(file);
    assert.throws(
      () => queue.append({ ...record, agentId: "../other" }),
      /identity/,
    );
    assert.throws(() => queue.append({ ...record, input: -1 }), /count/);
    assert.throws(() => queue.append({ ...record, output: 1.5 }), /count/);
    assert.throws(
      () => queue.append({ ...record, endedAt: "2026-02-30T10:00:00.000Z" }),
      /metadata/,
    );
    assert.throws(
      () =>
        queue.append({
          ...record,
          input: null,
          output: null,
          cacheRead: null,
          cacheWrite: null,
          reasoning: null,
        }),
      /no observations/,
    );
    assert.throws(() => queue.pending(0), RangeError);
    assert.throws(() => queue.acknowledge(["bad"]), /acknowledgment/);
    assert.deepEqual(queue.pending(), []);
    queue.close();
  }));

test("a full queue rejects new records without dropping queued records", () =>
  withFile((file) => {
    let queue = AgentUsageOutbox.open(file, 1);
    queue.append(record);
    queue.append(record);
    const next = { ...record, id: "00000000-0000-4000-8000-000000000005" };
    assert.throws(() => queue.append(next), AgentUsageOutboxFullError);
    assert.deepEqual(queue.pending(), [record]);
    const firstGap = queue.gap()!;
    assert.equal(firstGap.failedAttempts, 1);
    assert.equal(
      agentUsageBatchSchema.safeParse({
        records: queue.pending(),
        gap: firstGap,
      }).success,
      true,
    );
    assert.throws(() => queue.append(next), AgentUsageOutboxFullError);
    queue.acknowledgeGap(firstGap);
    assert.equal(
      queue.gap()?.failedAttempts,
      2,
      "a stale acknowledgment must not erase a newer gap",
    );
    queue.close();
    queue = AgentUsageOutbox.open(file, 1);
    const secondGap = queue.gap()!;
    assert.equal(secondGap.failedAttempts, 2);
    queue.acknowledgeGap(secondGap);
    assert.equal(queue.gap(), null);
    assert.throws(() => queue.append(next), AgentUsageOutboxFullError);
    queue.acknowledgeGap(secondGap);
    assert.notEqual(
      queue.gap()?.id,
      secondGap.id,
      "an old acknowledgment must not erase a later gap",
    );
    queue.acknowledge([record.id]);
    queue.append(next);
    assert.deepEqual(queue.pending(), [next]);
    queue.close();
  }));

test("a permanently rejected record is retained without blocking later records", () =>
  withFile((file) => {
    let queue = AgentUsageOutbox.open(file);
    const next = { ...record, id: "00000000-0000-4000-8000-000000000005" };
    queue.append(record);
    queue.append(next);
    queue.quarantine(record.id, "agent_unavailable");
    assert.deepEqual(queue.pending(), [next]);
    queue.close();
    queue = AgentUsageOutbox.open(file);
    assert.deepEqual(queue.quarantined(), [
      { record, reason: "agent_unavailable" },
    ]);
    queue.retryQuarantined(record.id);
    assert.deepEqual(queue.pending(), [record, next]);
    queue.close();
  }));

test("an older queue upgrades without losing pending records; newer schemas fail closed", () =>
  withFile((file) => {
    mkdirSync(path.dirname(file), { recursive: true });
    const sqlite = process.getBuiltinModule(
      "node:sqlite",
    ) as typeof import("node:sqlite");
    const old = new sqlite.DatabaseSync(file);
    old.exec(
      "CREATE TABLE usage_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, seq INTEGER NOT NULL)",
    );
    old
      .prepare("INSERT INTO usage_outbox VALUES (?, ?, 1)")
      .run(record.id, JSON.stringify(record));
    old.close();
    const queue = AgentUsageOutbox.open(file);
    assert.deepEqual(queue.pending(), [record]);
    queue.quarantine(record.id, "agent_unavailable");
    assert.equal(queue.quarantined().length, 1);
    queue.close();
    const future = new sqlite.DatabaseSync(file);
    future.exec("PRAGMA user_version=2");
    future.close();
    assert.throws(
      () => AgentUsageOutbox.open(file),
      /Unsupported usage outbox schema/,
    );
  }));

test("a committed record survives a killed writer before acknowledgment", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "raft-usage-crash-test-"));
  const file = path.join(root, "usage.db");
  const moduleUrl = new URL("./agentUsageOutbox.ts", import.meta.url).href;
  const code = `import { AgentUsageOutbox } from ${JSON.stringify(moduleUrl)};
    const queue = AgentUsageOutbox.open(${JSON.stringify(file)});
    queue.append(${JSON.stringify(record)});
    process.stdout.write('committed\\n');
    setInterval(() => {}, 1000);`;
  const child = spawn(
    process.execPath,
    ["--experimental-transform-types", "--input-type=module", "-e", code],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const committed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("writer did not commit in time")),
        5000,
      );
      child.stdout.on("data", (data: Buffer) => {
        if (data.toString().includes("committed")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        if (code !== null) {
          clearTimeout(timer);
          reject(new Error(`writer exited ${code}`));
        }
      });
    });
    await committed;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    const queue = AgentUsageOutbox.open(file);
    assert.deepEqual(queue.pending(), [record]);
    queue.close();
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});
