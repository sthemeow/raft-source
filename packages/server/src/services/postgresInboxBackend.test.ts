import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, vi } from "vitest";
import {
  INBOX_ITEMS_CAPABILITY,
  MANUAL_CONTEXT_CAPABILITY,
  RAFT_CLIENT_CAPABILITIES_HEADER,
  SYNC_CAPABILITY_INBOX_ROW,
  type SyncChangesResponse,
  type SyncInboxRowChange,
} from "@botiverse/raft-shared";
import {
  getRisingWaveDatabaseUrl,
  getRisingWavePool,
  isPostgresInboxBackendConfigured,
  isRisingWaveConfigured,
  resolveInboxBackend,
} from "../db/risingwave";
import {
  featureFlags,
  inboxTargetMuteStates,
  messageMentions,
  threadFollows,
} from "../db/schema";
import { waitForAgentInboxChain } from "../routes/agentEventsWaitFor";
import { installRisingWaveReadReferences, uninstallRisingWaveReadReferences } from "../test/risingWaveReadReference";
import { referenceAgentInboxChain } from "../test/agentInboxChainReference";
import { createApiTest } from "../test/integration/apiTest";
import { seedJointChannel } from "../test/integration/jointFixture";
import { enableTaskV2ConversationsForServer } from "../test/integration/taskV2Flag";
import { createAgent } from "./agentService";
import { INBOX_ITEMS_LAUNCH_AT_ENV } from "./agentInboxItems";
import { runCdcIntegrityCheck } from "./cdcIntegrityService";
import {
  __testRisingWaveInbox,
  activityReadServedByRisingWave,
  addAgent,
  addHuman,
  createChannel,
  findOrCreateDM,
  getActivityUnreadTotalsBatch,
  getFollowedThreads,
  getInboxItems,
  getOrCreateThread,
  getSidebarUnreadSummaryCounts,
  getUnreadCounts,
  getUnreadSummary,
  markAgentLegacyRead,
  readAgentInboxChainRowsForDismiss,
  readAgentInboxChainTargetSeqs,
  selectAgentInboxChainRows,
} from "./channelService";
import { AGENT_INBOX_ITEMS_FEATURE_FLAG_KEY, SYNC_INBOX_ROWS_FEATURE_FLAG_KEY, createFeatureFlag } from "./featureFlagService";
import { __resetInboxItemsLaunchWarningsForTests } from "./inboxItemsLaunch";
import { mintAgentCredential } from "./agentCredentialService";
import { createMessage } from "./messageService";
import { postgresAgentInboxChain } from "./postgresInboxBackend";
import { createServer } from "./serverService";
import { parseSyncChangesCursor } from "./syncChanges";
import { createTaskConversationsInTransaction } from "./taskConversationService";
import * as taskService from "./taskService";

const test = createApiTest();

beforeEach(() => {
  uninstallRisingWaveReadReferences();
  __testRisingWaveInbox.reset();
  __resetInboxItemsLaunchWarningsForTests();
  vi.stubEnv("RAFT_INBOX_BACKEND", "postgres");
  vi.stubEnv("RISINGWAVE_DATABASE_URL", "");
  vi.stubEnv(INBOX_ITEMS_LAUNCH_AT_ENV, "2026-01-01T00:00:00.000Z");
});

afterEach(() => {
  __testRisingWaveInbox.reset();
  vi.unstubAllEnvs();
  installRisingWaveReadReferences();
});

test("config and pool isolation: RAFT_INBOX_BACKEND=postgres disables RisingWave and rejects invalid values", async () => {
  assert.equal(resolveInboxBackend({}), "risingwave");
  assert.equal(resolveInboxBackend({ RAFT_INBOX_BACKEND: "risingwave" }), "risingwave");
  assert.equal(resolveInboxBackend({ RAFT_INBOX_BACKEND: "  POSTGRES  " }), "postgres");
  assert.throws(
    () => resolveInboxBackend({ RAFT_INBOX_BACKEND: "pg" }),
    /Invalid RAFT_INBOX_BACKEND.*expected "risingwave" or "postgres"/,
  );

  assert.equal(isPostgresInboxBackendConfigured({}), false);
  assert.equal(isPostgresInboxBackendConfigured({ RAFT_INBOX_BACKEND: "postgres" }), true);

  const rwUrl = "postgresql://root@127.0.0.1:4566/dev";
  assert.equal(getRisingWaveDatabaseUrl({ RISINGWAVE_DATABASE_URL: rwUrl }), rwUrl);
  assert.equal(isRisingWaveConfigured({ RISINGWAVE_DATABASE_URL: rwUrl }), true);
  assert.equal(
    getRisingWaveDatabaseUrl({ RAFT_INBOX_BACKEND: "postgres", RISINGWAVE_DATABASE_URL: rwUrl }),
    null,
  );
  assert.equal(
    isRisingWaveConfigured({ RAFT_INBOX_BACKEND: "postgres", RISINGWAVE_DATABASE_URL: rwUrl }),
    false,
  );

  vi.stubEnv("RISINGWAVE_DATABASE_URL", rwUrl);
  assert.equal(getRisingWavePool(), null);
  assert.equal(activityReadServedByRisingWave(), true);
  const integrity = await runCdcIntegrityCheck();
  assert.equal(integrity.outcome, "skipped_not_configured");
});

test("human Activity, followed threads, sidebar unread, and sync inbox_row work via PostgreSQL without RisingWave", async ({ seed, db, http }) => {
  const owner = await seed.human();
  const peer = await seed.human();
  const server = await seed.server({ owner, members: [peer] });
  const general = await seed.channel({ server, members: [owner, peer], name: "general" });
  const announce = await seed.channel({ server, members: [peer], name: "announce" });

  const parent = await seed.message({ channel: general, author: owner, content: "thread root" });
  await seed.message({ channel: general, author: peer, content: "unread general message" });
  await seed.message({ channel: announce, author: peer, content: "public news" });

  const thread = await getOrCreateThread(parent.id, owner.id, "user");
  await db.insert(threadFollows).values({
    threadChannelId: thread.id,
    followerType: "user",
    followerId: owner.id,
    parentMessageId: parent.id,
    reason: "manual",
  }).onConflictDoNothing();
  const longReply = `${"x".repeat(150)}tail`;
  await createMessage(thread.id, "user", peer.id, longReply);

  const inbox = await getInboxItems(server.id, owner.id, { filter: "all" });
  assert.equal(inbox.backend, "postgres");
  assert.equal(inbox.totalUnreadCount, 2);
  assert.equal(inbox.items.length, 2);

  const rowsOnly = await getInboxItems(server.id, owner.id, {
    filter: "all",
    rowsOnly: true,
    rowIds: [general.id],
  });
  assert.equal(rowsOnly.backend, "postgres");
  assert.deepEqual(
    rowsOnly.items.map((item) => ("threadChannelId" in item ? item.threadChannelId : item.channelId)),
    [general.id],
  );

  const nonMemberServerId = randomUUID();
  const totals = await getActivityUnreadTotalsBatch(
    [{ serverId: server.id }, { serverId: nonMemberServerId }],
    owner.id,
  );
  assert.deepEqual(totals.get(server.id), { totalUnreadCount: 2, activeUnreadCount: 2 });
  assert.equal(totals.has(nonMemberServerId), false);

  const followed = await getFollowedThreads(server.id, owner.id);
  assert.equal(followed.length, 1);
  assert.equal(followed[0]!.threadChannelId, thread.id);
  assert.equal(followed[0]!.unreadCount, 1);
  assert.equal(followed[0]!.replyCount, 1);
  assert.equal(followed[0]!.latestActivityPreview, `${"x".repeat(140)}…`);

  const counts = await getUnreadCounts(server.id, owner.id);
  assert.equal(counts[general.id], 1);
  assert.equal(counts[thread.id], 1);
  assert.equal(counts[announce.id], undefined);

  const summary = await getUnreadSummary(server.id, owner.id);
  assert.equal(summary[general.id]?.unreadCount, 1);
  assert.equal(summary[thread.id]?.unreadCount, 1);
  assert.equal(summary[thread.id]?.parentChannelId, general.id);
  assert.equal(summary[announce.id]?.hasNew, true);
  assert.equal(summary[announce.id]?.unreadCount, 0);

  const sidebarTotals = await getSidebarUnreadSummaryCounts([server.id, nonMemberServerId], owner.id);
  assert.deepEqual(sidebarTotals, { [server.id]: 1, [nonMemberServerId]: 0 });

  // Sync changes inbox_row capability works in PG mode with zero RW lag holds.
  await db.insert(featureFlags).values({
    key: SYNC_INBOX_ROWS_FEATURE_FLAG_KEY,
    enabled: true,
    defaultEnabled: true,
    randomizationUnit: "server",
    salt: "pg-sync-inbox-rows",
  }).onConflictDoUpdate({ target: featureFlags.key, set: { enabled: true } });

  const client = http.as(owner, server);
  const initialRes = await client.get(`/api/sync/changes?capabilities=${SYNC_CAPABILITY_INBOX_ROW}`);
  assert.equal(initialRes.status, 200, await initialRes.clone().text());
  const initial = await initialRes.json() as SyncChangesResponse;
  assert.ok(parseSyncChangesCursor(initial.cursor)?.messages, `expected message cursor, got ${initial.cursor}`);

  await seed.message({ channel: general, author: peer, content: "sync update" });
  const deltaRes = await client.get(
    `/api/sync/changes?since=${encodeURIComponent(initial.cursor)}&capabilities=${SYNC_CAPABILITY_INBOX_ROW}`,
  );
  assert.equal(deltaRes.status, 200, await deltaRes.clone().text());
  const delta = await deltaRes.json() as SyncChangesResponse & { retryAfterMs?: number };
  assert.equal(delta.inboxReset, null);
  assert.equal("retryAfterMs" in delta, false);
  const rowChanges = delta.changes.filter(
    (change): change is SyncInboxRowChange => change.entity === "inbox_row",
  );
  assert.equal(rowChanges.length, 1);
  assert.equal(rowChanges[0]!.id, general.id);
  assert.equal(rowChanges[0]!.op, "upsert");
  if (rowChanges[0]!.op === "upsert") {
    const syncedRow = rowChanges[0]!.row as { unreadCount?: number };
    assert.equal(syncedRow.unreadCount, 2);
  }
});

test("agent inbox matches reference parity across channels, mutes, mentions, DMs, threads, tasks, and joint channels, and serves all 5 entry points without RisingWave", async ({ db, seed, app }) => {
  await createFeatureFlag({
    key: AGENT_INBOX_ITEMS_FEATURE_FLAG_KEY,
    randomizationUnit: "server",
    defaultEnabled: true,
  });

  const owner = await seed.human({ name: "pg-owner" });
  const peer = await seed.human({ name: "pg-peer" });
  const serverA = await seed.server({ owner, members: [peer], name: "Server A" });
  const serverB = await seed.server({ owner, members: [peer], name: "Server B" });
  const agent = await createAgent(serverA.id, "PgInboxBot", { runtime: "claude", model: "sonnet" });
  const apiKey = (await mintAgentCredential({
    agentId: agent.id,
    scopes: ["send", "read", "tasks"],
    name: "pg-inbox-test",
    issuedVia: "computer",
    createdByUserId: null,
  })).apiKey;

  await enableTaskV2ConversationsForServer(serverA.id);

  const general = await createChannel(serverA.id, "general");
  const muted = await createChannel(serverA.id, "muted-room");
  const readAlready = await createChannel(serverA.id, "caught-up");
  for (const ch of [general, muted, readAlready]) {
    await addHuman(ch.id, owner.id);
    await addAgent(ch.id, agent.id);
  }

  // Regular channel: 2 unread + own message + noise subtype (both ignored).
  const g1 = await createMessage(general.id, "user", owner.id, "hello 1");
  const g2 = await createMessage(general.id, "user", owner.id, "hello 2");
  await createMessage(general.id, "agent", agent.id, "own reply");
  await createMessage(general.id, "user", owner.id, "noise", "system", undefined, { systemSubtype: "task.deleted_summary" });

  // Already read channel (tests inAgentInbox=false targetLatestSeq in wait_for).
  const r1 = await createMessage(readAlready.id, "user", owner.id, "already seen");
  await markAgentLegacyRead(agent.id, readAlready.id, r1.seq);

  // Muted channel: 1 pre-mute message + 1 post-mute plain message (suppressed) + 1 pierced @mention.
  const preMute = await createMessage(muted.id, "user", owner.id, "before mute");
  const postMutePlain = await createMessage(muted.id, "user", owner.id, "during mute");
  await db.insert(inboxTargetMuteStates).values({
    receiverType: "agent",
    receiverId: agent.id,
    serverId: serverA.id,
    sourceChannelId: muted.id,
    activityMuted: true,
    muteFromSeq: postMutePlain.seq,
    pushMuted: true,
  });
  const piercedMention = await createMessage(muted.id, "user", owner.id, "@PgInboxBot urgent");
  await db.insert(messageMentions).values({
    messageId: piercedMention.id,
    serverId: serverA.id,
    channelId: muted.id,
    messageSeq: piercedMention.seq,
    targetType: "agent",
    targetId: agent.id,
    handleAtSendTime: "PgInboxBot",
    notifiableAtSend: true,
  });

  // DM.
  const dm = await findOrCreateDM(serverA.id, owner.id, agent.id);
  assert.ok(dm);
  const dmMsg = await createMessage(dm.id, "user", owner.id, "direct hi");

  // Followed thread with mention.
  const thread = await getOrCreateThread(g1.id, owner.id, "user");
  await db.insert(threadFollows).values({
    threadChannelId: thread.id,
    followerType: "agent",
    followerId: agent.id,
    parentMessageId: g1.id,
    reason: "mentioned",
  });
  const threadReply = await createMessage(thread.id, "user", owner.id, "@PgInboxBot thread ping");
  await db.insert(messageMentions).values({
    messageId: threadReply.id,
    serverId: serverA.id,
    channelId: thread.id,
    messageSeq: threadReply.seq,
    targetType: "agent",
    targetId: agent.id,
    handleAtSendTime: "PgInboxBot",
    notifiableAtSend: true,
  });

  // Task v2 conversation.
  const { tasks: [task] } = await taskService.createTasks(general.id, "user", owner.id, [{
    title: "Verify task conversation parity",
  }]);
  assert.ok(task);
  const createdTaskConvs = await createTaskConversationsInTransaction(db, {
    tasks: [{ id: task.id, channelId: general.id }],
    storageChannel: { id: general.id, serverId: serverA.id, type: "channel" },
    initiatingServerId: serverA.id,
  });
  const taskConvId = createdTaskConvs.get(task.id)?.canonicalChannelId;
  assert.ok(taskConvId);
  await db.insert(threadFollows).values({
    threadChannelId: taskConvId,
    followerType: "agent",
    followerId: agent.id,
    parentTaskId: task.id,
    reason: "assigned",
  }).onConflictDoNothing();
  const taskReply = await createMessage(taskConvId, "user", owner.id, "task discussion message");

  // Joint channel projection with message in canonical + mention posted on sibling projection.
  const joint = await seedJointChannel({
    name: "joint-pg",
    serverIds: [serverA.id, serverB.id],
    createdByUserId: owner.id,
  });
  const projA = joint.projections[0]!;
  const projB = joint.projections[1]!;
  await addAgent(projA.id, agent.id);
  const jointMsg = await createMessage(joint.canonical.id, "user", peer.id, "@PgInboxBot from sibling");
  await db.insert(messageMentions).values({
    messageId: jointMsg.id,
    serverId: serverB.id,
    channelId: projB.id,
    messageSeq: jointMsg.seq,
    targetType: "agent",
    targetId: agent.id,
    handleAtSendTime: "PgInboxBot",
    notifiableAtSend: true,
  });

  // Exact row-for-row parity against test reference across all 6 conversation shapes.
  const [pgRows, refRows] = await Promise.all([
    postgresAgentInboxChain(agent.id),
    referenceAgentInboxChain(agent.id),
  ]);
  const sortByTarget = <T extends { targetId: string }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.targetId.localeCompare(b.targetId));
  assert.deepEqual(sortByTarget(pgRows), sortByTarget(refRows));

  // Entry 1: selectAgentInboxChainRows
  const selection = await selectAgentInboxChainRows(agent.id);
  assert.equal(selection.source, "chain");
  if (selection.source === "chain") {
    assert.deepEqual(sortByTarget(selection.rows), sortByTarget(pgRows));
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Raft-Client": "cli",
    [RAFT_CLIENT_CAPABILITIES_HEADER]: `${MANUAL_CONTEXT_CAPABILITY},${INBOX_ITEMS_CAPABILITY}`,
  };

  // Entry 2: GET /internal/agent-api/inbox/conversations (unread + mentions + pagination + muted pierced count)
  const listAll = await fetch(`${app.baseUrl}/internal/agent-api/inbox/conversations?items=true&limit=3`, { headers });
  assert.equal(listAll.status, 200);
  const page1 = await listAll.json() as any;
  assert.deepEqual(page1.totals, { conversations: 6, dms: 1, mentions: 3 });
  assert.equal(page1.hasMore, true);
  assert.equal(page1.items.length, 3);

  const page2Res = await fetch(
    `${app.baseUrl}/internal/agent-api/inbox/conversations?items=true&limit=10&before_seq=${page1.nextBeforeSeq}`,
    { headers },
  );
  assert.equal(page2Res.status, 200);
  const page2 = await page2Res.json() as any;
  const allListed = [...page1.rows, ...page2.rows];
  assert.equal(allListed.length, 6);
  const mutedEntry = allListed.find((row: any) => row.target === `#${muted.name}`);
  assert.equal(mutedEntry?.unread, 2, `1 pre-mute (${preMute.seq}) + 1 pierced mention (${piercedMention.seq})`);
  assert.equal(mutedEntry?.mentions, 1);

  const mentionsRes = await fetch(`${app.baseUrl}/internal/agent-api/inbox/conversations?items=true&view=mentions`, { headers });
  assert.equal(mentionsRes.status, 200);
  const mentionsBody = await mentionsRes.json() as any;
  assert.equal(mentionsBody.rows.length, 3);

  // Entry 3: POST /internal/agent-api/inbox/rows
  const rowsRes = await fetch(`${app.baseUrl}/internal/agent-api/inbox/rows`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      targets: [
        { channelId: general.id, newestSeq: g2.seq },
        { channelId: dm.id, newestSeq: dmMsg.seq },
      ],
    }),
  });
  assert.equal(rowsRes.status, 200);
  const rowsBody = await rowsRes.json() as any;
  assert.equal(rowsBody.behind, 0);
  assert.equal(rowsBody.rows.length, 2);
  assert.deepEqual(rowsBody.otherUnread, {
    conversations: 4,
    messages: 2 + 1 + 1 + 1,
    mentions: 3,
    dms: 0,
  });

  // Entry 5: waitForAgentInboxChain & readAgentInboxChainTargetSeqs
  const expectedGeneralLatestSeq = pgRows.find((row) => row.targetId === general.id)?.latestSeq;
  assert.ok(expectedGeneralLatestSeq && expectedGeneralLatestSeq >= g2.seq);
  const seqs = await readAgentInboxChainTargetSeqs(agent.id, [general.id, readAlready.id, taskConvId]);
  assert.ok(seqs);
  const byTarget = new Map(seqs.map((row) => [row.targetId, row]));
  assert.equal(byTarget.get(general.id)?.inAgentInbox, true);
  assert.equal(byTarget.get(general.id)?.latestSeq, expectedGeneralLatestSeq);
  assert.equal(byTarget.get(readAlready.id)?.inAgentInbox, false);
  assert.equal(byTarget.get(readAlready.id)?.targetLatestSeq, r1.seq);
  assert.equal(byTarget.get(taskConvId)?.inAgentInbox, true);
  assert.equal(byTarget.get(taskConvId)?.latestSeq, taskReply.seq);

  const waitResult = await waitForAgentInboxChain({
    agentId: agent.id,
    pairs: [
      { targetId: general.id, seq: expectedGeneralLatestSeq },
      { targetId: readAlready.id, seq: r1.seq },
    ],
    sinceSeq: null,
  });
  assert.deepEqual(waitResult.outcome, "none");
  assert.equal(waitResult.checks, 1);
  assert.deepEqual(waitResult.unsatisfied, []);

  // Entry 4: readAgentInboxChainRowsForDismiss & POST /internal/agent-api/inbox/dismiss
  const beforeDismiss = await readAgentInboxChainRowsForDismiss(agent.id, { targetIds: [general.id] });
  assert.equal(beforeDismiss.length, 1);
  const dismissRes = await fetch(`${app.baseUrl}/internal/agent-api/inbox/dismiss`, {
    method: "POST",
    headers,
    body: JSON.stringify({ target: `#${general.name}` }),
  });
  assert.equal(dismissRes.status, 200, await dismissRes.clone().text());
  const dismissBody = await dismissRes.json() as any;
  assert.equal(dismissBody.dismissed, 1);
  assert.equal(dismissBody.conversations, 1);
  const afterDismiss = await readAgentInboxChainRowsForDismiss(agent.id, { targetIds: [general.id] });
  assert.equal(afterDismiss.length, 0);
});
