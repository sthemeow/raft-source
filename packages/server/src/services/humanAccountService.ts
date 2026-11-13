import { eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { users } from "../db/schema";
import * as serverService from "./serverService";
import { createHumanAccountInTransaction } from "./userService";
import { normalizeEmail } from "./emailNormalization";
import type { ServerRole } from "@botiverse/raft-shared";

/** The address already holds an account: invite that person instead of creating a second one. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("Email is already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}

/**
 * Create a human account and give it a seat in one Server, atomically.
 *
 * This is the one shape every "an administrator adds a person" path uses
 * (#Raft-Dev:a5519ad5): the account row, the seat and — because the seat is
 * what `deploymentUserLimit` counts — the licence limit decision all happen in
 * the same transaction. A refused seat therefore rolls the account back with
 * it; there is no window in which a person exists but cannot join, and no
 * compensation step to get right.
 *
 * The person is not present, so nothing is accepted on their behalf: the terms
 * are recorded when they take over the account, at the set-password step
 * (`recordLegalAcceptance`), or by the IdP path at first SSO sign-in.
 */
export async function createHumanAccountForServer(input: {
  serverId: string;
  email: string;
  displayName: string | null;
  role: Extract<ServerRole, "member" | "admin">;
}): Promise<{ id: string; email: string }> {
  const email = normalizeEmail(input.email);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) throw new EmailAlreadyRegisteredError();
    const created = await createHumanAccountInTransaction(tx, {
      email,
      displayName: input.displayName,
      legal: null,
      // An administrator vouches for the address: they are creating the person's
      // access deliberately. The set-password link is proof when it is used, and
      // it is the only credential issued here.
      emailVerified: false,
      joiningServerId: input.serverId,
    });
    await serverService.addMember(input.serverId, created.id, input.role, { executor: tx });
    return created;
  });
}
