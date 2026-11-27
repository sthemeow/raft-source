// Send hold (shared sendHold.ts): a sent message waits a few
// seconds before delivery and can be withdrawn back into the message box.
// The wait is stored on the account (users.send_hold_seconds), so it follows
// the person to every device. The server decides whether a send is held (the
// send_hold_v0 flag and this setting); the composer only asks.
import { normalizeSendHoldSeconds } from "@botiverse/raft-shared";
import type { SendHoldSeconds } from "@botiverse/raft-shared";
import api from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import type { Message } from "../../store/messageStore";

export type { SendHoldSeconds };

/** The account's choice; the default when unset, signed out, or from an older server. */
export function useSendHoldSeconds(): SendHoldSeconds {
  return useAuthStore((state) => normalizeSendHoldSeconds(state.user?.sendHoldSeconds ?? null));
}

/**
 * Shows the change at once and saves it to the account (PATCH /auth/me); a
 * failed save puts the previous value back (unless a later change replaced it)
 * and rethrows.
 */
export async function saveSendHoldSeconds(seconds: SendHoldSeconds): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const previous = user.sendHoldSeconds ?? null;
  const next = seconds === 5 ? null : seconds;
  useAuthStore.setState({ user: { ...user, sendHoldSeconds: next } });
  const stillThis = () => {
    const current = useAuthStore.getState().user;
    return current && (current.sendHoldSeconds ?? null) === next ? current : null;
  };
  try {
    const { data } = await api.patch("/auth/me", { sendHoldSeconds: seconds });
    const current = stillThis();
    if (current && data && "sendHoldSeconds" in data) {
      useAuthStore.setState({ user: { ...current, sendHoldSeconds: data.sendHoldSeconds ?? null } });
    }
  } catch (err) {
    const current = stillThis();
    if (current) useAuthStore.setState({ user: { ...current, sendHoldSeconds: previous } });
    throw err;
  }
}

/**
 * Take back the message still waiting, by the randomId it was sent with. True
 * when withdrawn: its send then fails with `send_withdrawn` and the composer
 * puts the text back. False when it is already sent.
 */
export async function withdrawHeldSend(randomId: string): Promise<boolean> {
  try {
    await api.post("/v2/messages/held/withdraw", { randomId });
    return true;
  } catch (err) {
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code === "send_already_released") return false;
    throw err;
  }
}

/**
 * Send the waiting message now instead of at its time ("Send now"). True once
 * it is delivered; false when it is already on its way or withdrawn. The
 * original send request answers as usual.
 */
export async function sendHeldNow(randomId: string): Promise<boolean> {
  try {
    await api.post("/v2/messages/held/send-now", { randomId });
    return true;
  } catch (err) {
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
    if (code === "send_already_released") return false;
    throw err;
  }
}

/**
 * A waiting send withdrawn from a page that did not send it (reloaded during
 * the wait, so no send request is left to fail and put the text back): the
 * composer of that conversation takes the text instead (MessageInput).
 */
export const HELD_SEND_RESTORE_EVENT = "raft:held-send-restore";
export type HeldSendRestoreDetail = { channelId: string; content: string };

export function restoreWithdrawnHeldSend(detail: HeldSendRestoreDetail): void {
  window.dispatchEvent(new window.CustomEvent<HeldSendRestoreDetail>(HELD_SEND_RESTORE_EVENT, { detail }));
}

/** Your latest message still waiting in this conversation's rows, if any. */
export function latestOwnHeldSend(rows: readonly Message[], userId: string): Message | null {
  let latest: Message | null = null;
  for (const row of rows) {
    if (!row.held || row.senderId !== userId || !row.randomId || typeof row.seq === "number") continue;
    if (!latest || Date.parse(row.createdAt) >= Date.parse(latest.createdAt)) latest = row;
  }
  return latest;
}
