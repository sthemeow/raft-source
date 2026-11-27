import assert from "node:assert/strict";
import "./helpers/domSetup";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MessageItem from "../src/components/message/MessageItem";
import { useAuthStore } from "../src/store/authStore";
import type { User } from "../src/store/authStore";
import type { Message } from "../src/store/messageStore";
import { useServerStore } from "../src/store/serverStore";
import type { Server } from "../src/store/serverStore";
import { TestIntlProvider } from "./helpers/intl";

// Send hold: a waiting message reads Sending… for everyone,
// also when it continues its sender's group and so has no header.

afterEach(() => cleanup());
beforeEach(() => {
  useAuthStore.setState({ user: { id: "user-viewer", name: "viewer", displayName: "Viewer" } as User, initialized: true, loading: false });
  useServerStore.setState({ current: { id: "server-1", name: "Server", slug: "server", role: "member" } as Server, members: [] });
});

const preview: Message = {
  id: "optimistic-held-r-1",
  channelId: "thread-1",
  randomId: "r-1",
  senderType: "user",
  senderId: "user-bob",
  senderName: "bob",
  messageType: "chat",
  content: "still waiting",
  createdAt: "2026-11-27T11:40:00.000Z",
  held: { createdAt: "2026-11-27T11:40:00.000Z", releaseAt: "2026-11-27T11:40:05.000Z" },
};

function renderRow(groupState?: Parameters<typeof MessageItem>[0]["groupState"]) {
  return render(
    <MemoryRouter>
      <TestIntlProvider>
        <MessageItem message={preview} mentionMap={new Map()} channels={[]} hideThreadActions groupState={groupState} />
      </TestIntlProvider>
    </MemoryRouter>,
  );
}

test("a held row opening its group shows Sending… in its header", () => {
  const view = renderRow();
  assert.equal(view.getAllByTestId("held-send-status").length, 1);
});

test("a held row continuing its sender's group still shows Sending…", () => {
  const view = renderRow({ isFirstInGroup: false, previousMessageId: "message-0", showAvatar: false, showName: false } as never);
  assert.equal(view.getAllByTestId("held-send-status").length, 1);
  assert.ok(view.getByTestId("held-send-status").textContent?.includes("Sending"));
});
