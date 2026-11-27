/**
 * Send hold: a person's message waits a few seconds before it
 * is delivered, and can be withdrawn back into the message box meanwhile.
 * The wait is the person's choice (`users.send_hold_seconds`), on every
 * device; server and web both read it through here.
 *
 * - null (the default): SEND_HOLD_SECONDS_DEFAULT seconds.
 * - 0: off, messages are delivered at once.
 * - 3, 5, 10: that many seconds.
 */

export const SEND_HOLD_SECONDS_CHOICES = [0, 3, 5, 10] as const;
export type SendHoldSeconds = typeof SEND_HOLD_SECONDS_CHOICES[number];
export const SEND_HOLD_SECONDS_DEFAULT = 5 satisfies SendHoldSeconds;
/** What `users.send_hold_seconds` holds, and the profile carries: null is the default. */
export type StoredSendHoldSeconds = Exclude<SendHoldSeconds, typeof SEND_HOLD_SECONDS_DEFAULT> | null;

/** Server-scoped flag; default off. Off: nothing is held, whatever a send asks. */
export const SEND_HOLD_FEATURE_FLAG_KEY = "send_hold_v0";

/** The send was withdrawn by its sender before it was delivered (HTTP 409 code). */
export const SEND_HOLD_WITHDRAWN_CODE = "send_withdrawn";

/** Socket events for the held preview other people see. */
export const SEND_HOLD_HELD_EVENT = "message:held";
export const SEND_HOLD_REMOVED_EVENT = "message:held_removed";

export type HeldMessagePreview = {
  randomId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  releaseAt: string;
  attachmentCount: number;
};

export type HeldMessageRemoved = { randomId: string; channelId: string };

/** What the account stores, read: null, absent or anything unknown is the default. */
export function normalizeSendHoldSeconds(value: unknown): SendHoldSeconds {
  return (SEND_HOLD_SECONDS_CHOICES as readonly unknown[]).includes(value) ? value as SendHoldSeconds : SEND_HOLD_SECONDS_DEFAULT;
}

/**
 * PATCH /auth/me's `sendHoldSeconds`: undefined = unchanged, null or the
 * default = stored as null, another choice = stored. Anything else throws.
 */
export function parseSendHoldSecondsPreference(raw: unknown): StoredSendHoldSeconds | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === SEND_HOLD_SECONDS_DEFAULT) return null;
  if (raw === 0 || raw === 3 || raw === 10) return raw;
  throw new Error("sendHoldSeconds must be 0, 3, 5, 10, or null");
}
