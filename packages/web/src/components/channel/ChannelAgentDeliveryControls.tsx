import { Button, ListRow, ListRowBody, ListRowDescription, ListRowTitle, toast } from "@botiverse/raft-ui";
import type { ChannelAgentDeliveryChange } from "@botiverse/raft-shared";
import { Bell, BellOff } from "lucide-react";
import { useId } from "react";
import { useIntl } from "react-intl";
import MenuItem from "../ui/MenuItem";
import Tooltip from "../ui/Tooltip";
import { ImmediateRowSwitch, ImmediateSaveStatus, useImmediateSave } from "../settings/ImmediateSetting";
import { useChannelAgentDelivery, toggleChannelAgentDelivery } from "../../store/channelAgentDelivery";

export function ChannelAgentMuteBadge() {
  const { formatMessage } = useIntl();
  return (
    <span className="pointer-events-none absolute -left-1 -top-1 z-raised grid size-[18px] place-items-center rounded-sm border border-layer-canvas bg-layer-canvas bg-linear-to-b from-warning-soft to-warning-soft text-warning-strong"
      aria-label={formatMessage({ id: "channel.agentDelivery.mutedStatus" })} role="img">
      <BellOff size={12} aria-hidden="true" />
    </span>
  );
}

export function ChannelAgentDeliverySettings({ channelId }: { channelId: string }) {
  const { formatMessage } = useIntl();
  const { state, saving, save } = useChannelAgentDelivery(channelId);
  const feedback = useImmediateSave();
  const titleId = useId();
  if (!state?.canManage) return null;
  const apply = (change: ChannelAgentDeliveryChange) => {
    void feedback.run(() => save(change), () => formatMessage({ id: "channel.agentDelivery.saveFailed" }));
  };
  const someMuted = state.members.some(member => member.muted);

  return (
    <>
      <ListRow variant="plain" interactive={false} data-testid="channel-agent-delivery-settings">
        <ListRowBody>
          <ListRowTitle id={titleId}>{formatMessage({ id: "channel.agentDelivery.muteAll" })}</ListRowTitle>
          <ListRowDescription wrap>{formatMessage({ id: "channel.agentDelivery.description" })}</ListRowDescription>
          <ImmediateSaveStatus feedback={feedback.feedback} />
        </ListRowBody>
        <ImmediateRowSwitch
          aria-labelledby={titleId}
          checked={state.muteAll}
          disabled={saving}
          onCheckedChange={enabled => apply({ kind: "channel", enabled })}
        />
      </ListRow>
      {someMuted && !state.muteAll && (
        <Button type="button" size="sm" variant="ghost" disabled={saving}
          onClick={() => apply({ kind: "channel", enabled: false })}>
          {formatMessage({ id: "channel.agentDelivery.unmuteAll" })}
        </Button>
      )}
    </>
  );
}

export function ChannelAgentDeliveryAction({ channelId, agentId, presentation, onApplied }: {
  channelId: string;
  agentId: string;
  presentation: "icon" | "menu" | "profile";
  onApplied?: () => void;
}) {
  const { formatMessage } = useIntl();
  const { state, saving, save } = useChannelAgentDelivery(channelId);
  const feedback = useImmediateSave();
  const member = state?.members.find(candidate => candidate.agentId === agentId);
  if (!state?.canManage || !member) return null;

  const label = formatMessage({ id: member.muted ? "channel.agentDelivery.unmuteAgent" : "channel.agentDelivery.muteAgent" });
  const accessibleLabel = formatMessage({ id: "channel.agentDelivery.namedAction" }, { action: label, name: member.name });
  const icon = member.muted ? <BellOff size={16} /> : <Bell size={16} />;
  const errorMessage = () => formatMessage({ id: "channel.agentDelivery.saveFailed" });
  const onClick = () => {
    void feedback.run(
      () => save(toggleChannelAgentDelivery(member)),
      errorMessage,
    ).then(ok => {
      if (ok) onApplied?.();
      else if (presentation !== "profile") toast.error(errorMessage());
    });
  };

  if (presentation === "menu") return (
    <MenuItem icon={icon} disabled={saving} onClick={onClick}>{label}</MenuItem>
  );

  if (presentation === "profile") return (
    <ListRow variant="plain" onClick={onClick} disabled={saving} aria-label={accessibleLabel}>
      {icon}
      <ListRowBody>
        <ListRowTitle>{label}</ListRowTitle>
        <ImmediateSaveStatus feedback={feedback.feedback} />
      </ListRowBody>
    </ListRow>
  );

  return (
    <span className="relative shrink-0">
      <Tooltip content={label}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className={member.muted ? "text-foreground-hint" : "md:pointer-fine:opacity-0 md:pointer-fine:group-hover:opacity-100 md:pointer-fine:group-focus-within:opacity-100"}
          aria-label={accessibleLabel}
          data-testid="channel-agent-delivery-member-action"
          disabled={saving}
          onClick={onClick}
        >
          {icon}
        </Button>
      </Tooltip>
    </span>
  );
}
