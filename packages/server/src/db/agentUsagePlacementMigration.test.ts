import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "vitest";

const server = "00000000-0000-4000-8000-000000000001";
const agent = "00000000-0000-4000-8000-000000000002";
const first = "00000000-0000-4000-8000-000000000003";
const second = "00000000-0000-4000-8000-000000000004";

test("placement migration snapshots once, tracks assignment and archive, and detects drift", async () => {
  const db = new PGlite();
  const sql = await readFile(new URL("../../drizzle/0376_onprem_agent_usage_placement.sql", import.meta.url), "utf8");
  const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  const migrate = async () => {
    await db.exec("BEGIN");
    try { for (const statement of statements) await db.exec(statement); await db.exec("COMMIT"); }
    catch (error) { await db.exec("ROLLBACK"); throw error; }
  };
  try {
    await db.exec(`CREATE TABLE public.servers (id uuid PRIMARY KEY); CREATE TABLE public.agents (id uuid PRIMARY KEY, server_id uuid NOT NULL REFERENCES public.servers(id), daemon_id uuid, deleted_at timestamptz); INSERT INTO public.servers VALUES ('${server}'); INSERT INTO public.agents VALUES ('${agent}','${server}','${first}',NULL);`);
    await migrate();
    assert.equal((await db.query("SELECT * FROM public.agent_usage_placements")).rows.length, 1);
    await db.exec(`UPDATE public.agents SET daemon_id='${second}' WHERE id='${agent}'`);
    const moved = await db.query<{ machine_id: string; ended_at: Date | null }>("SELECT machine_id, ended_at FROM public.agent_usage_placements ORDER BY started_at");
    assert.equal(moved.rows.length, 2);
    assert.equal(moved.rows[0]!.machine_id, first);
    assert.ok(moved.rows[0]!.ended_at);
    assert.equal(moved.rows[1]!.machine_id, second);
    assert.equal(moved.rows[1]!.ended_at, null);
    await db.exec(`UPDATE public.agents SET deleted_at=now(), daemon_id=NULL WHERE id='${agent}'`);
    await migrate();
    const after = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.agent_usage_placements WHERE ended_at IS NULL");
    assert.equal(after.rows[0]!.count, 0);
    assert.equal((await db.query("SELECT * FROM public.agent_usage_placements")).rows.length, 2);
    await db.exec("ALTER TABLE public.agent_usage_placements DROP CONSTRAINT agent_usage_placements_range");
    await assert.rejects(migrate(), /incompatible constraints/);
    await db.exec("ALTER TABLE public.agent_usage_placements ADD CONSTRAINT agent_usage_placements_range CHECK (ended_at IS NULL OR started_at <= ended_at)");
    await db.exec("CREATE OR REPLACE FUNCTION public.track_agent_usage_placement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
    await assert.rejects(migrate(), /different definition/);
  } finally { await db.close(); }
}, 60_000);

test("received-time index is replay-safe and rejects a same-name incompatible index", async () => {
  const db = new PGlite();
  const sql = await readFile(new URL("../../drizzle/0377_onprem_agent_usage_received_index.sql", import.meta.url), "utf8");
  const parts = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  const apply = async () => { for (const part of parts) await db.exec(part); };
  try {
    await db.exec("CREATE TABLE public.agent_usage_records (server_id uuid, agent_id uuid, received_at timestamptz)");
    await apply(); await apply();
    await db.exec("DROP INDEX public.idx_agent_usage_records_server_agent_received; CREATE INDEX idx_agent_usage_records_server_agent_received ON public.agent_usage_records (received_at)");
    await assert.rejects(apply(), /index is incompatible/);
  } finally { await db.close(); }
}, 60_000);
