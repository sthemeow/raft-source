import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { CURRENT_LEGAL_ACCEPTANCE } from "@botiverse/raft-shared";
import { getDb } from "../db/index";
import { passwordResets, serverMembers, userLegalAcceptances, users } from "../db/schema";
import { createServer } from "../services/serverService";
import { getDb as db } from "../db/index";
import * as userService from "../services/userService";
import { createApiTest } from "../test/integration/apiTest";
import { seedUser } from "../test/externalInviteFixture";

// An administrator creates a human account from the web (#Raft-Dev:a5519ad5):
// §3 of the Raft License wants accounts created by an administrator, not by
// self sign-up, and the product had no other way in once registration is off.
const test = createApiTest();

type User = Awaited<ReturnType<typeof seedUser>>;
type Http = ReturnType<typeof import("../test/integration/http").createHttpClient>;

function post(http: Http, as: User, serverId: string, path: string, body: unknown = {}) {
  return http.as(as).request(path, {
    method: "POST",
    // Server-scoped routes carry the server in the header (middleware/auth.ts).
    headers: { "Content-Type": "application/json", "X-Server-Id": serverId },
    body: JSON.stringify(body),
  });
}

function person(label: string): Promise<User> {
  return seedUser(`${label}-${randomBytes(4).toString("hex")}`);
}

async function deployment(): Promise<{ owner: User; serverId: string }> {
  const owner = await person("owner");
  const server = await createServer("Home", `home-${randomUUID().slice(0, 8)}`, owner.id);
  return { owner, serverId: server.id };
}

function accountPath(serverId: string): string {
  return `/api/servers/${serverId}/members/create`;
}

test("the owner creates an account: seat, one setup token, terms at the reset step", async ({ app, http }) => {
  const { owner, serverId } = await deployment();
  const email = `newcomer-${randomBytes(4).toString("hex")}@slock.test`;

  const created = await post(http, owner, serverId, accountPath(serverId), { email, name: "Newcomer", role: "member" });
  assert.equal(created.status, 200);
  const { userId } = (await created.json()) as { userId: string };

  const [account] = await getDb().select().from(users).where(eq(users.id, userId));
  assert.ok(account, "the account exists");
  assert.equal(account!.email, email);
  assert.equal(account!.emailVerified, false);

  const seat = await getDb().select().from(serverMembers).where(eq(serverMembers.userId, userId));
  assert.equal(seat.length, 1, "the account holds its seat");
  assert.equal(seat[0]!.serverId, serverId);

  const tokens = await getDb().select().from(passwordResets).where(eq(passwordResets.userId, userId));
  assert.equal(tokens.length, 1, "one setup link was issued");

  assert.equal(await userService.hasLegalAcceptance(userId), false, "nothing is accepted on their behalf");

  // The person opens the emailed link and chooses a password, accepting the terms.
  const setup = await userService.issueAccountSetupToken(email);
  assert.ok(setup, "a setup token can be issued for the address");
  const reset = await fetch(`${app.baseUrl}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: setup!.token,
      password: "chosen-by-them-123",
      acceptTerms: true,
      termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
      privacyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyVersion,
    }),
  });
  assert.equal(reset.status, 200);
  assert.equal(((await reset.json()) as { legalRecorded: boolean }).legalRecorded, true);
  assert.equal(await userService.hasLegalAcceptance(userId), true);
  const [acceptance] = await getDb().select().from(userLegalAcceptances).where(eq(userLegalAcceptances.userId, userId));
  assert.equal(acceptance!.source, "invite");

  // The password they chose is the one that works.
  const login = await fetch(`${app.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "chosen-by-them-123" }),
  });
  assert.equal(login.status, 200);
});

test("a member cannot create accounts", async ({ http }) => {
  const { owner, serverId } = await deployment();
  const member = await person("member");
  await getDb().insert(serverMembers).values({ serverId, userId: member.id, role: "member" });

  const refused = await post(http, member, serverId, accountPath(serverId), {
    email: `x-${randomBytes(4).toString("hex")}@slock.test`,
    name: "Someone",
  });
  assert.equal(refused.status, 403);
  assert.equal(owner.id === member.id, false);
});

test("an email that already has an account is sent to the invite flow", async ({ http }) => {
  const { owner, serverId } = await deployment();
  const existing = await person("existing");

  const refused = await post(http, owner, serverId, accountPath(serverId), { email: existing.email, name: existing.name });
  assert.equal(refused.status, 409);
  const body = (await refused.json()) as { error: string };
  assert.match(body.error, /invite/);
});

test("at the licence limit nothing is created, and no seatless account is left behind", async ({ http }) => {
  const { owner, serverId } = await deployment();
  // Four more people take the deployment to the five-human limit.
  for (let i = 0; i < 4; i += 1) {
    const other = await person(`filled-${i}`);
    await getDb().insert(serverMembers).values({ serverId, userId: other.id, role: "member" });
  }

  const email = `sixth-${randomBytes(4).toString("hex")}@slock.test`;
  const refused = await post(http, owner, serverId, accountPath(serverId), { email, name: "Sixth" });
  assert.equal(refused.status, 403);
  const body = (await refused.json()) as { code?: string };
  assert.equal(body.code, "deployment_user_limit_reached");

  const [leftover] = await getDb().select().from(users).where(eq(users.email, email));
  assert.equal(leftover, undefined, "no account was left without a seat");
});

// The shared in-transaction creator is also what SSO calls
// (createSsoUserInTransaction delegates to it). SSO's own suite cannot run in
// this source-available snapshot — the edition gate refuses every SSO route —
// so this covers the creation half directly.
test("the SSO account helper still records the terms it was given", async ({ app }) => {
  // Taking `app` initialises the database this test then uses directly.
  assert.ok(app.baseUrl);
  const email = `sso-${randomBytes(4).toString("hex")}@slock.test`;
  const { createSsoUserInTransaction } = userService;
  const created = await db().transaction((tx) => createSsoUserInTransaction(tx, {
    email,
    displayName: "SSO Person",
    legalAcceptance: {
      acceptTerms: true,
      termsVersion: CURRENT_LEGAL_ACCEPTANCE.termsVersion,
      privacyVersion: CURRENT_LEGAL_ACCEPTANCE.privacyVersion,
    },
    joiningServerId: null as unknown as string,
  }));

  const [account] = await getDb().select().from(users).where(eq(users.id, created.id));
  assert.equal(account!.emailVerified, true, "the IdP claim vouches for the address");
  const [acceptance] = await getDb().select().from(userLegalAcceptances).where(eq(userLegalAcceptances.userId, created.id));
  assert.equal(acceptance!.source, "oauth");
});
