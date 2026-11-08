import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

const migrationPath = new URL(
  "../../drizzle/0375_onprem_agent_usage.sql",
  import.meta.url,
);

test("usage migration journal and schema snapshot continue the previous revision", async () => {
  const meta = new URL("../../drizzle/meta/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("_journal.json", meta), "utf8"),
  ) as { entries: Array<{ idx: number; when: number; tag: string }> };
  const index = journal.entries.findIndex(
    (entry) => entry.tag === "0375_onprem_agent_usage",
  );
  assert.ok(index > 0);
  const current = journal.entries[index]!;
  const previous = journal.entries[index - 1]!;
  assert.equal(current.idx, previous.idx + 1);
  assert.ok(current.when > previous.when);
  const before = JSON.parse(
    await readFile(new URL("0374_snapshot.json", meta), "utf8"),
  ) as { id: string };
  const after = JSON.parse(
    await readFile(new URL("0375_snapshot.json", meta), "utf8"),
  ) as { prevId: string };
  assert.equal(after.prevId, before.id);
});

test("usage migration replays safely and rejects schema drift", async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(migrationPath, "utf8");
    await db.exec(
      "CREATE TABLE servers (id uuid PRIMARY KEY); CREATE TABLE agents (id uuid PRIMARY KEY)",
    );
    await db.exec(sql);
    await db.exec(sql);
    await db.exec("SET search_path = pg_catalog");
    await db.exec(sql);
    const searchPath = await db.query<{ path: string }>(
      "SELECT current_setting('search_path') AS path",
    );
    assert.equal(searchPath.rows[0]?.path, "pg_catalog");
    await db.exec("SET search_path = public");
    for (const [change, expected] of [
      [
        "ALTER TABLE agent_usage_records ALTER COLUMN runtime DROP NOT NULL",
        /incompatible table columns/,
      ],
      [
        "ALTER TABLE agent_usage_records DROP CONSTRAINT agent_usage_records_nonnegative; ALTER TABLE agent_usage_records ADD CONSTRAINT agent_usage_records_nonnegative CHECK (true)",
        /incompatible constraints/,
      ],
      [
        "DROP INDEX idx_agent_usage_records_server_time; CREATE INDEX idx_agent_usage_records_server_time ON agent_usage_records(server_id)",
        /incompatible indexes/,
      ],
    ] as const) {
      await db.exec("BEGIN");
      await db.exec(change);
      await assert.rejects(db.exec(sql), expected);
      await db.exec("ROLLBACK");
    }
  } finally {
    await db.close();
  }
});
