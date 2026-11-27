import assert from "node:assert/strict";
import { act } from "react";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TestIntlProvider } from "./helpers/intl";
import { resetUploadCapability, withUploadCapability } from "./helpers/uploadCapability";
import api from "../src/api/client";
import { MessageInput } from "../src/features/composer/MessageInput";
import { clearDraftPendingFilesForTests, clearFailedSendMentionsForTests } from "../src/features/composer/draftPendingFilesCache";
import { useAuthStore } from "../src/store/authStore";
import { useChannelStore } from "../src/store/channelStore";
import { useMessageStore } from "../src/store/messageStore";
import type { SendMessageResult } from "../src/store/messageStore";
import { useServerStore } from "../src/store/serverStore";

// Send hold: the first reply of a thread that does not exist
// yet is sent at once (no withdraw window), so a withdrawn first reply can
// never leave an empty thread behind. Every other
// send from the composer asks for the hold.

const render: typeof rtlRender = (ui, options) => rtlRender(ui, { wrapper: TestIntlProvider, ...options });
const CHANNEL_ID = "channel-send-hold";
const originalApiGet = api.get;
const originalConsoleError = console.error;

afterEach(() => {
  resetUploadCapability();
  cleanup();
  clearDraftPendingFilesForTests();
  clearFailedSendMentionsForTests();
  api.get = originalApiGet;
  console.error = originalConsoleError;
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useServerStore.setState(useServerStore.getInitialState(), true);
  useChannelStore.setState(useChannelStore.getInitialState(), true);
  useMessageStore.setState(useMessageStore.getInitialState(), true);
});

async function sendOnce(props: { channelId: string; resolveChannelId?: () => Promise<string>; skipSendHold?: boolean }) {
  console.error = () => {};
  api.get = withUploadCapability((async () => ({ data: { agents: [], humans: [] } })) as typeof api.get);
  useAuthStore.setState({ user: { id: "user-1", email: "user@example.com", name: "user", displayName: "User" } } as never);
  useServerStore.setState({
    current: { id: "server-1", name: "Server", slug: "server", ownerId: "user-1", plan: "free", role: "owner" },
    members: [],
  } as never);
  useChannelStore.setState({
    channels: [{ id: CHANNEL_ID, serverId: "server-1", name: "general", type: "channel", archived: false, archivedAt: null }],
    dmChannels: [],
  } as never);
  const calls: Array<{ channelId: string; options: unknown }> = [];
  const sendMessage = async (channelId: string, ...rest: unknown[]): Promise<SendMessageResult> => {
    calls.push({ channelId, options: rest[rest.length - 1] });
    return { messageId: "message-1", pendingMentionActions: [], unresolvedMentionHandles: [], deliveryWarnings: [] };
  };
  useMessageStore.setState({
    drafts: {},
    channelMessages: { [CHANNEL_ID]: [] },
    currentChannelId: CHANNEL_ID,
    messages: [],
    sendMessage,
  } as never);
  render(
    <MemoryRouter>
      <MessageInput
        channelId={props.channelId}
        channelName="#general"
        resolveChannelId={props.resolveChannelId}
        skipSendHold={props.skipSendHold}
      />
    </MemoryRouter>,
  );
  const textarea = screen.getByPlaceholderText("Message #general") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "hello" } });
  await act(async () => {
    textarea.closest("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
  await waitFor(() => assert.equal(calls.length, 1));
  return calls[0]!;
}

test("an ordinary send asks for the hold", async () => {
  const call = await sendOnce({ channelId: CHANNEL_ID });
  assert.deepEqual(call.options, { hold: true });
});

test("the first reply of a thread not yet created is sent at once", async () => {
  const call = await sendOnce({
    channelId: "pending-thread:parent-1",
    resolveChannelId: async () => "thread-channel-1",
    skipSendHold: true,
  });
  assert.equal(call.channelId, "thread-channel-1");
  assert.deepEqual(call.options, { hold: false });
});

test("a lazily resolved conversation without skipSendHold keeps the hold", async () => {
  const call = await sendOnce({
    channelId: "pending-thread:task-1",
    resolveChannelId: async () => "task-conversation-1",
  });
  assert.deepEqual(call.options, { hold: true });
});

test("a send withdrawn from a reloaded page comes back into its conversation's box", async () => {
  const { restoreWithdrawnHeldSend } = await import("../src/features/composer/sendHold");
  console.error = () => {};
  api.get = withUploadCapability((async () => ({ data: { agents: [], humans: [] } })) as typeof api.get);
  useAuthStore.setState({ user: { id: "user-1", email: "user@example.com", name: "user", displayName: "User" } } as never);
  useServerStore.setState({ current: { id: "server-1", name: "Server", slug: "server", ownerId: "user-1", plan: "free", role: "owner" }, members: [] } as never);
  useChannelStore.setState({ channels: [{ id: CHANNEL_ID, serverId: "server-1", name: "general", type: "channel", archived: false, archivedAt: null }], dmChannels: [] } as never);
  useMessageStore.setState({ drafts: {}, channelMessages: { [CHANNEL_ID]: [] }, currentChannelId: CHANNEL_ID, messages: [] } as never);
  render(<MemoryRouter><MessageInput channelId={CHANNEL_ID} channelName="#general" /></MemoryRouter>);
  const textarea = screen.getByPlaceholderText("Message #general") as HTMLTextAreaElement;
  await act(async () => { restoreWithdrawnHeldSend({ channelId: "another-channel", content: "not here" }); });
  assert.equal(textarea.value, "");
  await act(async () => { restoreWithdrawnHeldSend({ channelId: CHANNEL_ID, content: "taken back" }); });
  await waitFor(() => assert.equal(textarea.value, "taken back"));
  fireEvent.change(textarea, { target: { value: "typed" } });
  await act(async () => { restoreWithdrawnHeldSend({ channelId: CHANNEL_ID, content: "again" }); });
  await waitFor(() => assert.equal(textarea.value, "typed\nagain"));
});

async function setupHeldKeys(composerSendKey: "enter" | "mod_enter" | null) {
  console.error = () => {};
  const posted: Array<{ url: string; body: unknown }> = [];
  api.post = (async (url: string, body?: unknown) => { posted.push({ url, body }); return { data: {} }; }) as typeof api.post;
  api.get = withUploadCapability((async () => ({ data: { agents: [], humans: [] } })) as typeof api.get);
  useAuthStore.setState({ user: { id: "user-1", email: "user@example.com", name: "user", displayName: "User", composerSendKey } } as never);
  useServerStore.setState({ current: { id: "server-1", name: "Server", slug: "server", ownerId: "user-1", plan: "free", role: "owner" }, members: [] } as never);
  useChannelStore.setState({ channels: [{ id: CHANNEL_ID, serverId: "server-1", name: "general", type: "channel", archived: false, archivedAt: null }], dmChannels: [] } as never);
  const held = { createdAt: "2026-11-27T13:00:00.000Z", releaseAt: "2026-11-27T13:00:05.000Z" };
  const row = (id: string, randomId: string, senderId: string, createdAt: string) =>
    ({ id, channelId: CHANNEL_ID, randomId, senderType: "user", senderId, senderName: "x", messageType: "chat", content: id, createdAt, held });
  useMessageStore.setState({
    drafts: {},
    channelMessages: { [CHANNEL_ID]: [
      row("optimistic-older", "r-older", "user-1", "2026-11-27T13:00:00.000Z"),
      row("optimistic-held-other", "r-other", "user-2", "2026-11-27T13:00:02.000Z"),
      row("optimistic-latest", "r-latest", "user-1", "2026-11-27T13:00:01.000Z"),
    ] },
    currentChannelId: CHANNEL_ID,
    messages: [],
  } as never);
  render(<MemoryRouter><MessageInput channelId={CHANNEL_ID} channelName="#general" /></MemoryRouter>);
  return { posted, textarea: screen.getByPlaceholderText("Message #general") as HTMLTextAreaElement };
}

const WITHDRAW = { url: "/v2/messages/held/withdraw", body: { randomId: "r-latest" } };
const SEND_NOW = { url: "/v2/messages/held/send-now", body: { randomId: "r-latest" } };

test("sending with Enter: in an empty box Enter sends your latest waiting message now and Backspace withdraws it", async () => {
  const originalPost = api.post;
  try {
    const { posted, textarea } = await setupHeldKeys(null);
    fireEvent.change(textarea, { target: { value: "typing" } });
    fireEvent.keyDown(textarea, { key: "Backspace" });
    assert.deepEqual(posted, [], "with text in the box Backspace only deletes");
    fireEvent.change(textarea, { target: { value: "\n" } });
    fireEvent.keyDown(textarea, { key: "Backspace" });
    fireEvent.change(textarea, { target: { value: " " } });
    fireEvent.keyDown(textarea, { key: "Backspace" });
    fireEvent.keyDown(textarea, { key: "Enter" });
    assert.deepEqual(posted.filter((p) => p.url.includes("/held/")), [], "a new line or a space in the box is something being typed");
    posted.length = 0;
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.keyDown(textarea, { key: "Backspace", repeat: true });
    fireEvent.keyDown(textarea, { key: "Backspace", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true, shiftKey: true });
    assert.deepEqual(posted, [], "a held-down Backspace, ⌘/Ctrl+Backspace, Shift+Enter and ⌘/Ctrl+Shift+Enter do nothing to it");
    fireEvent.keyDown(textarea, { key: "Backspace" });
    await waitFor(() => assert.deepEqual(posted, [WITHDRAW]));
    posted.length = 0;
    fireEvent.keyDown(textarea, { key: "Enter", repeat: true });
    assert.deepEqual(posted, [], "Enter still held down from the send is not Send now");
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => assert.deepEqual(posted, [SEND_NOW]), "released and pressed again, it is");
  } finally {
    api.post = originalPost;
  }
});

test("sending with ⌘/Ctrl+Enter: the keys are ⌘/Ctrl+Enter and ⌘/Ctrl+Backspace", async () => {
  const originalPost = api.post;
  try {
    const { posted, textarea } = await setupHeldKeys("mod_enter");
    fireEvent.keyDown(textarea, { key: "Backspace" });
    fireEvent.keyDown(textarea, { key: "Enter" });
    assert.deepEqual(posted, [], "plain Backspace and Enter (a new line here) do nothing to it");
    fireEvent.keyDown(textarea, { key: "Backspace", ctrlKey: true });
    await waitFor(() => assert.deepEqual(posted, [WITHDRAW]));
    posted.length = 0;
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true, repeat: true });
    assert.deepEqual(posted, [], "held down, ⌘/Ctrl+Enter is not Send now");
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await waitFor(() => assert.deepEqual(posted, [SEND_NOW]));
  } finally {
    api.post = originalPost;
  }
});
