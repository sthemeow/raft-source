import assert from "node:assert/strict";
import "./helpers/domSetup";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../src/api/client";
import { HeldSendWithdraw } from "../src/components/message/HeldSendWithdraw";
import { TestIntlProvider } from "./helpers/intl";

// Send hold: beside Withdraw, Send now delivers the waiting
// message at once (POST /v2/messages/held/send-now); already on its way, it
// says nothing.

const originalPost = api.post;
afterEach(() => { cleanup(); api.post = originalPost; });

function renderButtons() {
  const now = Date.now();
  return render(
    <TestIntlProvider>
      <HeldSendWithdraw randomId="r-1" createdAt={new Date(now).toISOString()} releaseAt={new Date(now + 5000).toISOString()} />
    </TestIntlProvider>,
  );
}

test("Send now asks the server to send the waiting message at once", async () => {
  const posted: Array<[string, unknown]> = [];
  api.post = (async (url: string, body?: unknown) => { posted.push([url, body]); return { data: { sent: true } }; }) as typeof api.post;
  renderButtons();
  assert.ok(screen.getByTestId("held-send-withdraw-button"), "Withdraw is still there");
  fireEvent.click(screen.getByTestId("held-send-now-button"));
  await waitFor(() => assert.deepEqual(posted, [["/v2/messages/held/send-now", { randomId: "r-1" }]]));
  assert.ok(screen.queryByRole("status") === null, "no notice");
});

test("already on its way: no notice; a failure says it still goes out on time", async () => {
  api.post = (async () => { throw { response: { data: { code: "send_already_released" } } }; }) as typeof api.post;
  renderButtons();
  fireEvent.click(screen.getByTestId("held-send-now-button"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(screen.queryByRole("status") === null, "no notice");
  cleanup();
  api.post = (async () => { throw new Error("network"); }) as typeof api.post;
  renderButtons();
  fireEvent.click(screen.getByTestId("held-send-now-button"));
  await waitFor(() => assert.match(screen.getByRole("status").textContent ?? "", /on time/));
});
