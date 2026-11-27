// Send hold: the Withdraw button under the sender's own
// waiting message, at its bottom right. A ring around
// the button runs out as the wait does, no numbers; where motion is reduced
// it stays still and dim. Withdrawing makes the send fail with send_withdrawn
// and the composer puts the text and files back (MessageInput); too late, the
// message is already on its way and stays sent.
import { useLayoutEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { restoreWithdrawnHeldSend, sendHeldNow, withdrawHeldSend } from "../../features/composer/sendHold";
import type { HeldSendRestoreDetail } from "../../features/composer/sendHold";

/**
 * `restore`: the row is a preview this page did not send (it was reloaded
 * during the wait), so no send request will put the text back; withdrawing
 * hands it to the composer instead.
 */
export function HeldSendWithdraw({ randomId, createdAt, releaseAt, restore }: { randomId: string; createdAt: string; releaseAt: string; restore?: HeldSendRestoreDetail }) {
  const { formatMessage } = useIntl();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"tooLate" | "failed" | "sendNowFailed" | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<SVGRectElement>(null);
  const progressRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const track = trackRef.current;
    const progress = progressRef.current;
    if (!button || !track || !progress) return;
    const { width, height } = button.getBoundingClientRect();
    for (const rect of [track, progress]) {
      rect.setAttribute("width", String(width + 4));
      rect.setAttribute("height", String(height + 4));
    }
    // Times are the server's; the ring runs from where the wait is now.
    const total = Math.max(1, Date.parse(releaseAt) - Date.parse(createdAt));
    const left = Math.min(total, Math.max(0, Date.parse(releaseAt) - Date.now()));
    const from = 100 * (1 - left / total);
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof progress.animate !== "function") {
      progress.style.strokeDashoffset = "0";
      progress.style.opacity = "0.5";
      return;
    }
    progress.style.strokeDashoffset = String(from);
    const animation = progress.animate(
      [{ strokeDashoffset: from }, { strokeDashoffset: 100 }],
      { duration: left, easing: "linear", fill: "forwards" },
    );
    return () => animation.cancel();
  }, [createdAt, releaseAt]);

  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    withdrawHeldSend(randomId).then(
      (withdrawn) => {
        if (!withdrawn) setNotice("tooLate");
        else if (restore) restoreWithdrawnHeldSend(restore);
      },
      () => setNotice("failed"),
    ).finally(() => setBusy(false));
  };

  const handleSendNow = () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    // Already on its way or withdrawn: nothing to say, the row settles itself.
    sendHeldNow(randomId).catch(() => setNotice("sendNowFailed")).finally(() => setBusy(false));
  };

  const noticeId = notice === "tooLate" ? "message.messageItem.withdrawTooLate"
    : notice === "sendNowFailed" ? "message.messageItem.sendNowFailed"
    : "message.messageItem.withdrawFailed";

  return (
    <div className="mt-1 flex h-[30px] items-center justify-end gap-2 pr-1.5" data-testid="held-send-withdraw">
      {notice ? (
        <span className="text-xs text-foreground-muted" role="status">
          {formatMessage({ id: noticeId })}
        </span>
      ) : null}
      {/* Send now: a plain outlined pill beside Withdraw; the ring stays Withdraw's. */}
      <button
        type="button"
        onClick={handleSendNow}
        disabled={busy}
        className="h-[26px] cursor-pointer rounded-[13px] border border-[var(--line-hairline)] bg-transparent px-3 text-xs font-semibold text-foreground-muted hover:bg-[var(--fill-muted)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default"
        data-testid="held-send-now-button"
      >
        {formatMessage({ id: "message.messageItem.sendNow" })}
      </button>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="relative h-[26px] cursor-pointer rounded-[13px] border-0 bg-[var(--fill-muted)] px-3 text-xs font-semibold text-foreground-muted hover:bg-[var(--fill-medium)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] disabled:cursor-default"
        data-testid="held-send-withdraw-button"
      >
        {formatMessage({ id: "message.messageItem.withdraw" })}
        <svg aria-hidden="true" className="pointer-events-none absolute -inset-[3px] h-[calc(100%+6px)] w-[calc(100%+6px)] overflow-visible">
          <rect ref={trackRef} x="1" y="1" rx="15" pathLength={100} fill="none" strokeWidth="2" className="stroke-[var(--line-hairline)]" />
          <rect
            ref={progressRef}
            x="1"
            y="1"
            rx="15"
            pathLength={100}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="100"
            className="stroke-[var(--brand-strong,var(--foreground-link))]"
          />
        </svg>
      </button>
    </div>
  );
}
