import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// 0374 adds the provider's email-verification claim to social auth
// completions. The backfill must happen exactly when the column is introduced:
// replaying the migration must not turn a later `false` claim into `true`.
const migrationPath = new URL(
  "../../drizzle/0374_onprem_oidc_email_verified.sql",
  import.meta.url,
);

test("0374 backfills legacy rows once and leaves later claims alone", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE social_auth_completions (
        id text PRIMARY KEY,
        provider text NOT NULL,
        provider_user_id text,
        provider_email text
      );
      INSERT INTO social_auth_completions (id, provider) VALUES ('legacy-1', 'google'), ('legacy-2', 'oidc');
    `);

    await db.exec(migration);
    const afterFirst = await db.query<{ id: string; provider_email_verified: boolean | null }>(
      "SELECT id, provider_email_verified FROM social_auth_completions ORDER BY id",
    );
    // Only providers that verified under the old code are backfilled; an OIDC
    // row written before this migration keeps an unknown claim.
    assert.deepEqual(afterFirst.rows.map((row) => row.provider_email_verified), [true, null]);

    // Completions written after the migration: one with a genuinely false
    // claim, one whose claim has not been recorded yet.
    await db.exec(`
      INSERT INTO social_auth_completions (id, provider, provider_email_verified)
      VALUES ('new-false', 'oidc', false), ('new-unknown', 'google', NULL);
    `);

    await db.exec(migration);
    const afterSecond = await db.query<{ id: string; provider_email_verified: boolean | null }>(
      "SELECT id, provider_email_verified FROM social_auth_completions ORDER BY id",
    );
    const byId = Object.fromEntries(
      afterSecond.rows.map((row) => [row.id, row.provider_email_verified]),
    );
    assert.equal(byId["legacy-1"], true);
    assert.equal(byId["legacy-2"], null);
    assert.equal(byId["new-false"], false, "replaying must not verify a later unverified claim");
    assert.equal(byId["new-unknown"], null, "replaying must not fill an unrecorded claim");
  } finally {
    await db.close();
  }
});
