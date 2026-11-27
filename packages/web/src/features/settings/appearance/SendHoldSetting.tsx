// Settings › Appearance › Send: how long a sent message waits
// before delivery, so it can be withdrawn and edited. Same pattern as the send
// key row (ComposerSendKeySetting): a SegmentedControl that applies at once, a
// SaveStatus line for a failed save. Shown only where send_hold_v0 is on.

import { useCallback, useId, useRef, useState } from "react";
import { useIntl } from "react-intl";
import { Send } from "lucide-react";
import { ListRow, ListRowBody, ListRowDescription, ListRowGroup, ListRowTitle, SegmentedControl, SegmentedControlItem, SegmentedControlLabel } from "@botiverse/raft-ui";
import { SaveStatus, SaveStatusError } from "@botiverse/raft-ui/wip";
import { SEND_HOLD_FEATURE_FLAG_KEY, SEND_HOLD_SECONDS_CHOICES } from "@botiverse/raft-shared";
import SectionHeader from "../../../components/ui/SectionHeader";
import { useServerFeatureFlag } from "../../../store/serverFeatureFlags";
import { saveSendHoldSeconds, useSendHoldSeconds } from "../../composer/sendHold";
import type { SendHoldSeconds } from "../../composer/sendHold";

export function SendHoldSetting() {
  const enabled = useServerFeatureFlag(SEND_HOLD_FEATURE_FLAG_KEY).enabled;
  if (!enabled) return null;
  return <SendHoldSettingSection />;
}

function SendHoldSettingSection() {
  const { formatMessage } = useIntl();
  const idPrefix = useId();
  const seconds = useSendHoldSeconds();
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const handleChange = useCallback((next: string) => {
    const value = Number(next) as SendHoldSeconds;
    const id = ++sequence.current;
    setFailed(false);
    saveSendHoldSeconds(value).catch(() => {
      if (id === sequence.current) setFailed(true);
    });
  }, []);

  return (
    <section className="mt-6" data-testid="send-hold-setting">
      <SectionHeader className="mb-3" icon={<Send size={16} />} label={formatMessage({ id: "settings.appearance.sendSection" })} />
      <ListRowGroup className="@container">
        <ListRow id="send-hold" variant="plain" interactive={false} className="@max-lg:flex-wrap">
          <ListRowBody>
            <ListRowTitle id={`${idPrefix}-label`}>{formatMessage({ id: "settings.appearance.sendHoldTitle" })}</ListRowTitle>
            <ListRowDescription id={`${idPrefix}-description`} wrap>{formatMessage({ id: "settings.appearance.sendHoldDescription" })}</ListRowDescription>
            <SaveStatus id={`${idPrefix}-status`}>
              {failed ? (
                <SaveStatusError data-testid="send-hold-error">{formatMessage({ id: "settings.appearance.sendHoldSaveFailed" })}</SaveStatusError>
              ) : null}
            </SaveStatus>
          </ListRowBody>
          <div className="shrink-0 @max-lg:basis-full">
            <SegmentedControl
              value={String(seconds)}
              aria-labelledby={`${idPrefix}-label`}
              aria-describedby={`${idPrefix}-description ${idPrefix}-status`}
              onValueChange={handleChange}
            >
              {SEND_HOLD_SECONDS_CHOICES.map((choice) => (
                <SegmentedControlItem key={choice} value={String(choice)} data-testid={`send-hold-${choice}`}>
                  <SegmentedControlLabel>
                    {choice === 0
                      ? formatMessage({ id: "settings.appearance.sendHoldOff" })
                      : formatMessage({ id: "settings.appearance.sendHoldSeconds" }, { seconds: choice })}
                  </SegmentedControlLabel>
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
        </ListRow>
      </ListRowGroup>
    </section>
  );
}
