#!/usr/bin/env -S node --import=@oxc-node/core/register
/**
 * Ops entry: create the first human account of an empty deployment.
 *
 * A fresh deployment has no way in the product to create its first account:
 * `/auth/register` is closed in this edition (§3 of the Raft License: accounts
 * are created or invited by an administrator) and the administrator path in
 * the web UI needs an administrator to exist first. This script is that one
 * step, and only that step: it refuses unless the deployment has no human
 * account at all.
 *
 * It does what the web path does minus the seat (an empty deployment has no
 * Server yet): the account row through userService, a one-time set-password
 * token, and the "set your password" email. The person chooses their own
 * password; this script never prints or sets one. It also prints the link, so
 * the run works on a deployment whose mail transport is not configured yet.
 *
 *   DATABASE_URL=<url> pnpm --filter @botiverse/raft-server ops:bootstrap-admin -- --email someone@example.com
 *
 * Exit codes: 0 created, 2 refused (an account already exists, or the input is
 * invalid), 1 failure.
 */
import { eq, sql } from "drizzle-orm";
import { closeDatabase, getDb, initDatabase } from "../src/db/index";
import { users } from "../src/db/schema";
import { validateEmailAddress } from "@botiverse/raft-shared";
import { sendAccountCreatedEmail } from "../src/services/emailService";
import { appUrl } from "../src/platform/links";
import { createHumanAccountInTransaction } from "../src/services/userService";
import { issueAccountSetupToken } from "../src/services/userService";

function parseArgs(argv: readonly string[]): { email: string | null } {
  let email: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--email") email = argv[i + 1] ?? null;
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
  }
  return { email };
}

async function main(): Promise<number> {
  const { email } = parseArgs(process.argv.slice(2));
  if (!email) {
    console.error("Usage: ops:bootstrap-admin -- --email someone@example.com");
    return 2;
  }
  const emailError = validateEmailAddress(email);
  if (emailError) {
    console.error(emailError);
    return 2;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await initDatabase(databaseUrl, undefined, { log: () => {} });

  const [{ count }] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  if (Number(count) > 0) {
    console.error(`Refusing: this deployment already has ${count} account(s). Bootstrap only runs on an empty one.`);
    return 2;
  }

  // The address's local part names the account until the person sets their own.
  const displayName = email.split("@")[0] ?? null;
  const created = await getDb().transaction((tx) => createHumanAccountInTransaction(tx, {
    email,
    displayName,
    legal: null,
    emailVerified: false,
    joiningServerId: null,
  }));

  const setup = await issueAccountSetupToken(email);
  if (!setup) throw new Error("The account was created but no setup token was issued");

  const link = `${appUrl()}?reset=${setup.token}&setup=1`;
  console.log(`Created the first account: ${created.email}`);
  console.log(`Set-password link (single use, 7 days):\n${link}`);

  try {
    await sendAccountCreatedEmail(email, displayName ?? "there", setup.token, "your new Raft deployment");
    console.log("The same link was emailed to that address.");
  } catch (err) {
    console.error("The email could not be sent; use the link above.", err);
  }

  const [row] = await getDb().select({ id: users.id }).from(users).where(eq(users.email, created.email));
  if (!row) throw new Error("The account vanished after creation");
  return 0;
}

main()
  .then(async (code) => {
    await closeDatabase();
    process.exitCode = code;
  })
  .catch(async (err) => {
    console.error(err);
    await closeDatabase().catch(() => undefined);
    process.exitCode = 1;
  });
