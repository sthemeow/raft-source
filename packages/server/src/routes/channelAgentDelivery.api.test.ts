import assert from "node:assert/strict";
import type { AgentMessage, ChannelAgentDeliveryChange, ChannelAgentDeliveryState } from "@botiverse/raft-shared";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index";
import { messages } from "../db/schema";
import type { AgentOrchestrator } from "../services/agentOrchestrator";
import { createAgent } from "../services/agentService";
import { addAgent, addHuman, createChannel, getActivityMutedAgentIdsForMessage } from "../services/channelService";
import { broadcastAndDeliver, getAgentResumeCatchupMessages } from "../services/messageService";
import { addMember } from "../services/serverService";
import { createApiTest } from "../test/integration/apiTest";
import { referenceAgentInboxChain } from "../test/agentInboxChainReference";
import { tokenForHuman } from "../test/integration/credentials";
import { withChannelDelivery } from "../test/orchestratorStub";
import { createServer, headers, seedUser } from "./channels.api.fixtures";
import { jsonHeaders, mintAgentKey } from "./internalAgentApi.auth.testkit";

const test = createApiTest();

test("bulk mute shares individual settings, skips unchanged Agents, and keeps chat mentions", async ({ app }) => {
  const owner = await seedUser("mute-owner@slock.test", "mute-owner");
  const member = await seedUser("mute-member@slock.test", "mute-member");
  const serverAdmin = await seedUser("mute-server-admin@slock.test", "mute-server-admin");
  const channelAdmin = await seedUser("mute-channel-admin@slock.test", "mute-channel-admin");
  const server = await createServer("Delivery Test", "delivery-test", owner.id);
  await addMember(server.id, member.id);
  await addMember(server.id, serverAdmin.id, "admin");
  await addMember(server.id, channelAdmin.id);
  const channel = await createChannel(server.id, "delivery");
  await addHuman(channel.id, owner.id);
  await addHuman(channel.id, member.id);
  await addHuman(channel.id, serverAdmin.id);
  await addHuman(channel.id, channelAdmin.id, { role: "admin" });
  const first = await createAgent(server.id, "fork-agent", { runtime: "claude", creatorType: "user", creatorId: owner.id });
  const second = await createAgent(server.id, "spoon-agent", { runtime: "claude", creatorType: "user", creatorId: owner.id });
  await addAgent(channel.id, first.id);
  await addAgent(channel.id, second.id);
  const firstKey = await mintAgentKey(first.id, ["read", "channels"]);
  const secondKey = await mintAgentKey(second.id, ["read", "channels"]);
  const url = `${app.baseUrl}/api/channels/${channel.id}/agent-delivery`;
  const ownerHeaders = headers(await tokenForHuman(owner.email), server.id);
  const memberHeaders = headers(await tokenForHuman(member.email), server.id);
  const change = (patch: ChannelAgentDeliveryChange, requestHeaders = ownerHeaders) => fetch(url, {
    method: "PATCH", headers: requestHeaders, body: JSON.stringify(patch),
  });
  const save = async (patch: ChannelAgentDeliveryChange) => {
    const response = await change(patch);
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as ChannelAgentDeliveryState;
  };
  const response = await fetch(url, { headers: memberHeaders });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as ChannelAgentDeliveryState).canManage, false);
  assert.equal((await change({ kind: "channel", enabled: true }, memberHeaders)).status, 403);

  for (const admin of [serverAdmin, channelAdmin]) {
    const adminHeaders = headers(await tokenForHuman(admin.email), server.id);
    const result = await change({ kind: "channel", enabled: false }, adminHeaders);
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await result.json() as ChannelAgentDeliveryState).canManage, true);
  }

  const selfMute = async (key: string, action: "mute" | "unmute") => fetch(
    `${app.baseUrl}/internal/agent-api/channels/${channel.id}/${action}`,
    { method: "POST", headers: jsonHeaders(key) },
  );
  assert.equal((await selfMute(firstKey, "mute")).status, 200);
  let state = await (await fetch(url, { headers: memberHeaders })).json() as ChannelAgentDeliveryState;
  const firstRevision = state.members[0]!.individualPrefsVersion;
  assert.deepEqual(state.members.map(member => member.muted), [true, false]);
  assert.equal((await change({
    kind: "individual", agentId: first.id, enabled: false, individualPrefsVersion: 0,
  })).status, 409);
  state = await save({ kind: "channel", enabled: true });
  assert.equal(state.members[0]!.individualPrefsVersion, firstRevision);
  assert.ok(state.members.every(member => member.muted));

  const received: Array<{ agentId: string; message: AgentMessage }> = [];
  const orchestrator = withChannelDelivery({
    async deliverMessage(agentId: string, message: AgentMessage) { received.push({ agentId, message }); },
  }) as unknown as AgentOrchestrator;
  app.app.set("agentOrchestrator", orchestrator);
  const post = (content: string) => broadcastAndDeliver(app.io, orchestrator, {
    channelId: channel.id, senderType: "user", senderId: owner.id, senderName: owner.name, content,
  });
  const suppressed = await post("No agent receives this");
  assert.equal(received.length, 0);
  const mention = await post(`Attention @${second.name}`);
  assert.equal(received.some(item => item.agentId === second.id && item.message.mentioned), true);
  const afterMention = await post("Ordinary chat after the unread mention");
  const legacyTask = await post("Task assigned to the muted agent without an @mention");
  // The legacy assignment fields are on the chat row, independent of mentions.
  await getDb().update(messages).set({ taskAssigneeType: "agent", taskAssigneeId: second.id })
    .where(eq(messages.id, legacyTask.id));

  assert.equal((await selfMute(firstKey, "unmute")).status, 200);
  const selfUnmuted = await (await fetch(url, { headers: memberHeaders })).json() as ChannelAgentDeliveryState;
  state = await save({ kind: "channel", enabled: false });
  assert.deepEqual(state.members.map(member => member.muted), [false, false]);
  assert.equal(state.members[0]!.individualPrefsVersion, selfUnmuted.members[0]!.individualPrefsVersion);
  assert.equal(state.muteAll, false);
  assert.equal((await save({ kind: "channel", enabled: false })).muteAll, false);
  const notices = received.filter(item => item.message.third_party_event?.system_app === "system.channel-mute");
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.agentId, second.id);
  const notice = notices[0]?.message.content ?? "";
  assert.equal(notice.split("\n")[0],
    "System notification: A channel administrator turned off your mute in #delivery. "
    + "2 ordinary messages posted there while you were muted are still unread. "
    + "Only messages that @mention you directly or assign you a task still need a response. "
    + "This notice and those ordinary messages need no reply.");
  assert.ok(!received.some(item => item.message.message_id === suppressed.id));
  const directAfterUnmute = await post(`New question @${second.name}`);
  assert.ok(received.some(item => item.agentId === second.id
    && item.message.message_id === directAfterUnmute.id && item.message.mentioned));
  const noticeId = notices[0]?.message.message_id;
  assert.ok(noticeId);
  const noticeUrl = `${app.baseUrl}/internal/agent-api/history?channel=agent-event:${noticeId}`;
  assert.equal((await fetch(noticeUrl, { headers: jsonHeaders(firstKey) })).status, 404);
  assert.equal((await fetch(noticeUrl, { headers: jsonHeaders(secondKey) })).status, 200);

  const inbox = (await referenceAgentInboxChain(second.id)).filter(row => row.targetId === channel.id);
  const resumed = await getAgentResumeCatchupMessages(second.id, undefined, { chain: inbox });
  assert.ok(resumed.messages.some(message => message.message_id === suppressed.id));
  assert.ok(resumed.messages.some(message => message.message_id === mention.id));
  assert.ok(resumed.messages.some(message => message.message_id === afterMention.id));

  assert.deepEqual(await getActivityMutedAgentIdsForMessage({
    serverId: server.id, sourceChannelId: channel.id, agentIds: [first.id, second.id], messageSeq: suppressed.seq,
  }), new Set());
  const history = await fetch(`${app.baseUrl}/internal/agent-api/history?channel=%23delivery`, { headers: jsonHeaders(firstKey) });
  assert.equal(history.status, 200, await history.clone().text());
  const { messages: historyMessages } = await history.json() as { messages: Array<{ id: string }> };
  assert.ok(historyMessages.some(message => message.id === suppressed.id), "mute does not hide readable history");
});

test("channel mute applies to new members, and repeated toggles do not notify for the same backlog", async ({ app }) => {
  const owner = await seedUser("mute-resume@slock.test", "mute-resume");
  const server = await createServer("Mute Resume Test", "mute-resume", owner.id);
  const channel = await createChannel(server.id, "mute-resume");
  await addHuman(channel.id, owner.id);
  const agent = await createAgent(server.id, "resume-agent", { runtime: "claude", creatorType: "user", creatorId: owner.id });
  const nextAgent = await createAgent(server.id, "next-agent", { runtime: "claude", creatorType: "user", creatorId: owner.id });

  const url = `${app.baseUrl}/api/channels/${channel.id}/agent-delivery`;
  const auth = headers(await tokenForHuman(owner.email), server.id);
  const save = async (change: ChannelAgentDeliveryChange) => {
    const response = await fetch(url, { method: "PATCH", headers: auth, body: JSON.stringify(change) });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as ChannelAgentDeliveryState;
  };
  const setMute = (enabled: boolean) => save({ kind: "channel", enabled });

  const received: AgentMessage[] = [];
  const orchestrator = withChannelDelivery({
    async deliverMessage(_agentId: string, message: AgentMessage) { received.push(message); },
    async acknowledgeDeliveredMessages() {},
  }) as unknown as AgentOrchestrator;
  app.app.set("agentOrchestrator", orchestrator);
  const post = (content: string) => broadcastAndDeliver(app.io, orchestrator, {
    channelId: channel.id, senderType: "user", senderId: owner.id, senderName: owner.name, content,
  });
  const notices = () => received.filter(message => message.third_party_event?.system_app === "system.channel-mute");

  assert.equal((await setMute(true)).muteAll, true);
  await addAgent(channel.id, agent.id);
  const state = await (await fetch(url, { headers: auth })).json() as ChannelAgentDeliveryState;
  assert.ok(state.members[0]?.muted);
  const individual = await save({
    kind: "individual", agentId: agent.id, enabled: false, individualPrefsVersion: state.members[0]!.individualPrefsVersion,
  });
  assert.equal(individual.muteAll, true);
  assert.equal(individual.members[0]?.muted, false);
  assert.equal(notices().length, 0);

  await setMute(true);
  await post("ordinary message during mute");
  assert.equal(received.length, 0);
  await setMute(false);
  assert.equal(notices().length, 1);
  await setMute(true);
  await setMute(false);
  assert.equal(notices().length, 1);

  await setMute(true);
  await post(`Attention @${agent.name}`);
  assert.equal(received.at(-1)?.mentioned, true);
  await setMute(false);
  assert.equal(notices().length, 1);

  await setMute(true);
  await post("Another ordinary message while the first notice is unread");
  await setMute(false);
  assert.equal(notices().length, 1);

  const key = await mintAgentKey(agent.id, ["read"]);
  const noticeId = notices()[0]?.message_id;
  const noticeUrl = `${app.baseUrl}/internal/agent-api/history?channel=agent-event:${noticeId}`;
  assert.equal((await fetch(noticeUrl, { headers: jsonHeaders(key) })).status, 200);
  // The previous mute's messages can remain unread without triggering a new notice.
  await setMute(true);
  await setMute(false);
  assert.equal(notices().length, 1);
  await setMute(true);
  await post(`Only a mention during this mute @${agent.name}`);
  await setMute(false);
  assert.equal(notices().length, 1);
  await setMute(true);
  await post("New ordinary message after reading the first notice");
  await setMute(false);
  assert.equal(notices().length, 2);
  assert.equal(notices()[1]?.content.split("\n")[0],
    "System notification: A channel administrator turned off your mute in #mute-resume. "
    + "1 ordinary message posted there while you were muted is still unread. "
    + "Only messages that @mention you directly or assign you a task still need a response. "
    + "This notice and that ordinary message need no reply.");

  await addAgent(channel.id, nextAgent.id);
  const joined = await (await fetch(url, { headers: auth })).json() as ChannelAgentDeliveryState;
  assert.equal(joined.members.find(member => member.agentId === nextAgent.id)?.muted, false);
});
