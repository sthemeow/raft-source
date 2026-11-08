import { useEffect, useReducer, useState } from "react";
import { useIntl } from "react-intl";
import api from "../../api/client";
import { useServerStore } from "../../store/serverStore";
import { UsageDashboard } from "./UsageDashboard";
import type { UsageAgent, UsageQuery } from "./UsageDashboard";
import { usagePresetRange } from "./usageTime";

type LoadState = { agents: UsageAgent[]; loading: boolean; error: string | null };
type LoadAction = { type: "start" } | { type: "success"; agents: UsageAgent[] } | { type: "error"; message: string };
function reduceLoad(_state: LoadState, action: LoadAction): LoadState {
  if (action.type === "start") return { agents: [], loading: true, error: null };
  if (action.type === "success") return { agents: action.agents, loading: false, error: null };
  return { agents: [], loading: false, error: action.message };
}

export function UsagePage() {
  const { formatMessage } = useIntl();
  const serverId = useServerStore((state) => state.current?.id);
  const [query, setQuery] = useState<UsageQuery>(() => ({ ...usagePresetRange("week", new Date()), interval: "1h" }));
  const [initialRange] = useState(() => ({ from: query.from, to: query.to }));
  const [state, dispatch] = useReducer(reduceLoad, { agents: [], loading: true, error: null });
  useEffect(() => {
    if (!serverId) return;
    const controller = new AbortController();
    dispatch({ type: "start" });
    void api.get<{ agents: Array<UsageAgent & { archived: boolean }> }>("/agents/usage/summary", {
      params: { ...(query.from ? { from: query.from.toISOString() } : {}), to: query.to.toISOString(), interval: query.interval },
      headers: { "X-Server-Id": serverId }, signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) dispatch({ type: "success", agents: data.agents.map((agent) => ({ ...agent, name: agent.archived ? formatMessage({ id: "usage.archivedName" }, { name: agent.name }) : agent.name, coverage: formatMessage({ id: agent.coverage === "opencode_gap" ? "usage.openCodeGap" : agent.coverage === "opencode_unavailable" ? "usage.openCodeCoverage" : agent.coverage === "partial_gap" ? "usage.partialGap" : "usage.coverage" }) })) });
    }).catch(() => {
      if (!controller.signal.aborted) dispatch({ type: "error", message: formatMessage({ id: "usage.error" }) });
    });
    return () => controller.abort();
  }, [formatMessage, query, serverId]);
  return <UsageDashboard {...state} onQuery={setQuery} initialRange={initialRange} />;
}
