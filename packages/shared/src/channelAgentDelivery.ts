export interface ChannelAgentDeliveryMember {
  agentId: string;
  name: string;
  avatarUrl: string | null;
  individualPrefsVersion: number;
  muted: boolean;
}

export interface ChannelAgentDeliveryState {
  muteAll: boolean;
  canManage: boolean;
  members: ChannelAgentDeliveryMember[];
}

export type ChannelAgentDeliveryChange =
  | { kind: "channel"; enabled: boolean }
  | { kind: "individual"; agentId: string; enabled: boolean; individualPrefsVersion: number };

export function supportsChannelAgentDelivery(channel: { type: string; name: string; loungeAgentId?: string | null }) {
  return (channel.type === "channel" || channel.type === "private") && channel.name !== "all" && !channel.loungeAgentId;
}
