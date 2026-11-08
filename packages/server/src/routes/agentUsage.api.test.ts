import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createApiTest } from "../test/integration/apiTest";
import { tokenForHuman } from "../test/integration/credentials";
import { agents, agentUsageGaps, agentUsagePlacements, agentUsageRecords, computers, serverMembers } from "../db/schema";
import { createAgent } from "../services/agentService";
import { registerMachine } from "../services/machineService";
import { generateComputerApiKeyMaterial } from "../services/computerCredentialService";

const test = createApiTest({ humanActivityMuteFlagDefaultEnabled: true, onboardingOpenerFlagDefaultEnabled: false });
test("usage summary is server scoped, covers multiple computers, and leaves empty buckets unknown", async ({ app, db, seed }) => {
  const owner = await seed.human();
  const guest = await seed.human();
  const server = await seed.server({ owner, members: [guest] });
  await db.update(serverMembers).set({ role: "guest" }).where(and(eq(serverMembers.serverId, server.id), eq(serverMembers.userId, guest.id)));
  const other = await seed.server({ owner });
  const agent = await createAgent(server.id, "UsageBot", { runtime: "codex", model: "test" });
  const openCodeAgent = await createAgent(server.id, "OpenCodeBot", { runtime: "opencode", model: "test" });
  const archivedAgent = await createAgent(server.id, "ArchivedBot", { runtime: "codex", model: "test" });
  await db.update(agents).set({ deletedAt: new Date() }).where(eq(agents.id, archivedAgent.id));
  const otherAgent = await createAgent(other.id, "OtherBot", { runtime: "codex", model: "test" });
  const values = { runtime: "codex" as const, endedAt: new Date("2026-11-08T10:15:00Z"), receivedAt: new Date("2026-11-08T10:16:00Z"), complete: true, input: 20, output: 50, cacheRead: 80, cacheWrite: null, reasoning: 10 };
  await db.insert(agentUsageRecords).values([
    { id: randomUUID(), serverId: server.id, computerId: randomUUID(), agentId: agent.id, ...values },
    { id: randomUUID(), serverId: server.id, computerId: randomUUID(), agentId: archivedAgent.id, ...values },
    { id: randomUUID(), serverId: server.id, computerId: randomUUID(), agentId: agent.id, ...values },
    { id: randomUUID(), serverId: other.id, computerId: randomUUID(), agentId: otherAgent.id, ...values },
  ]);
  const url = `${app.baseUrl}/api/agents/usage/summary?from=2026-11-08T09%3A00%3A00Z&to=2026-11-08T12%3A00%3A00Z&interval=1h`;
  const get = async (email: string, serverId: string) => fetch(url, { headers: { Authorization: `Bearer ${await tokenForHuman(email)}`, "X-Server-Id": serverId } });
  const response = await get(owner.email, server.id);
  assert.equal(response.status, 200);
  const body = await response.json() as { agents: Array<{ id: string; archived: boolean; coverage: string; totals: { total: number | null }; points: Array<{ values: { total: number | null } }> }> };
  assert.deepEqual(new Set(body.agents.map((item) => item.id)), new Set([agent.id, openCodeAgent.id, archivedAgent.id]));
  const observed = body.agents.find((item) => item.id === agent.id)!;
  const unmeasured = body.agents.find((item) => item.id === openCodeAgent.id)!;
  assert.equal(observed.totals.total, 300);
  assert.deepEqual(observed.points.map((point) => point.values.total), [null, 300, null]);
  assert.equal(unmeasured.totals.total, null);
  assert.equal(unmeasured.coverage, "opencode_unavailable");
  assert.equal(body.agents.find((item) => item.id === archivedAgent.id)?.archived, true);
  const recentUrl = `${app.baseUrl}/api/agents/usage/summary?from=2026-11-08T11%3A00%3A00Z&to=2026-11-08T12%3A00%3A00Z&interval=1h`;
  const recentResponse = await fetch(recentUrl, { headers: { Authorization: `Bearer ${await tokenForHuman(owner.email)}`, "X-Server-Id": server.id } });
  const recent = await recentResponse.json() as { agents: Array<{ id: string; lastReceivedAt: string | null; totals: { total: number | null } }> };
  assert.equal(recent.agents.find((item) => item.id === agent.id)?.totals.total, null);
  assert.ok(recent.agents.find((item) => item.id === agent.id)?.lastReceivedAt);
  await db.insert(agentUsageGaps).values({ id: randomUUID(), serverId: server.id, computerId: randomUUID(), firstEndedAt: new Date("2026-11-08T10:00:00Z"), lastEndedAt: new Date("2026-11-08T10:30:00Z"), failedAttempts: 1 });
  const withGap = await (await get(owner.email, server.id)).json() as typeof body;
  assert.equal(withGap.agents.find((item) => item.id === agent.id)?.coverage, "partial_gap");
  assert.equal(withGap.agents.find((item) => item.id === openCodeAgent.id)?.coverage, "opencode_gap");
  await db.delete(agentUsageGaps);
  const machineA = (await registerMachine(server.id, owner.id, "usage-a")).machine;
  const machineB = (await registerMachine(server.id, owner.id, "usage-b")).machine;
  await db.update(agents).set({ machineId: machineA.id }).where(eq(agents.id, agent.id));
  await db.update(agents).set({ machineId: machineB.id }).where(eq(agents.id, openCodeAgent.id));
  await db.update(agentUsagePlacements).set({ startedAt: new Date("2026-11-08T09:00:00Z") }).where(eq(agentUsagePlacements.serverId, server.id));
  const material = await generateComputerApiKeyMaterial();
  const [computerA] = await db.insert(computers).values({ serverId: server.id, name: "usage-a", machineId: machineA.id, attachedByUserId: owner.id, apiKeyHash: material.apiKeyHash, apiKeyPrefix: material.apiKeyPrefix }).returning();
  await db.insert(agentUsageGaps).values({ id: randomUUID(), serverId: server.id, computerId: computerA.id, firstEndedAt: new Date("2026-11-08T10:00:00Z"), lastEndedAt: new Date("2026-11-08T10:30:00Z"), failedAttempts: 1 });
  const scoped = await (await get(owner.email, server.id)).json() as typeof body;
  assert.equal(scoped.agents.find((item) => item.id === agent.id)?.coverage, "partial_gap");
  assert.equal(scoped.agents.find((item) => item.id === openCodeAgent.id)?.coverage, "opencode_unavailable");
  assert.equal((await get(guest.email, server.id)).status, 403);
  assert.equal((await get(guest.email, other.id)).status, 403);
}, 60_000);
