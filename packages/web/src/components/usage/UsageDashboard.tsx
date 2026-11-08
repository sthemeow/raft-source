import { useMemo, useState } from "react";
import { useIntl } from "react-intl";
import type { MessageId } from "../../i18n/messages/en";
import {
  usageMovingAverage,
  usagePresetRange,
} from "./usageTime";
import type { UsageInterval, UsagePreset } from "./usageTime";
export const USAGE_METRICS = [
  "total",
  "input",
  "output",
  "cachedInput",
  "uncachedInput",
  "reasoningOutput",
  "completionOutput",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];
export type UsageValues = Record<UsageMetric, number | null>;
export type UsageObservationCounts = Record<UsageMetric, number>;
export interface UsageAgent {
  id: string;
  name: string;
  totals: UsageValues;
  totalObservations?: UsageObservationCounts;
  lastReceivedAt?: string | null;
  /** Explain partial coverage rather than treating missing history as zero. */
  coverage: string;
  points: Array<{
    time: number;
    values: UsageValues;
    observations?: UsageObservationCounts;
  }>;
}
export interface UsageQuery {
  from: Date | null;
  to: Date;
  interval: UsageInterval;
}
export interface UsageDashboardProps {
  agents: UsageAgent[];
  loading: boolean;
  error?: string | null;
  onQuery: (query: UsageQuery) => void;
  initialRange?: { from: Date | null; to: Date };
}
const colors = [
  "#b64b15",
  "#166f84",
  "#6948a4",
  "#2b7952",
  "#bb720a",
  "#ab3d71",
  "#57647a",
];
const display = (value: number | null) =>
  value === null ? "—" : value.toLocaleString();
function localInput(value: Date): string {
  const d = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
/** Visual surface is driven by the caller's authorized, coverage-aware data.
 * Null values represent unavailable usage and remain gaps on the chart. */
export function UsageDashboard({
  agents,
  loading,
  error,
  onQuery,
  initialRange,
}: UsageDashboardProps) {
  const { formatMessage } = useIntl();
  const t = (key: Extract<MessageId, `usage.${string}`> extends `usage.${infer K}` ? K : never) => formatMessage({ id: `usage.${key}` });
  const labels: Record<UsageMetric, string> = useMemo(() => ({ total: formatMessage({ id: "usage.totalTokens" }), input: formatMessage({ id: "usage.inputTokens" }), output: formatMessage({ id: "usage.outputTokens" }), cachedInput: formatMessage({ id: "usage.cachedInput" }), uncachedInput: formatMessage({ id: "usage.uncachedInput" }), reasoningOutput: formatMessage({ id: "usage.reasoningOutput" }), completionOutput: formatMessage({ id: "usage.completionOutput" }) }), [formatMessage]);
  const [range, setRange] = useState(() =>
    initialRange ?? usagePresetRange("week", new Date()),
  );
  const [appliedRange, setAppliedRange] = useState(range);
  const [interval, setInterval] = useState<UsageInterval>("1h");
  const [selectedPreset, setSelectedPreset] = useState<UsagePreset | null>("week");
  const [view, setView] = useState<"table" | "chart">("table");
  const [chartMode, setChartMode] = useState<"metrics" | "agents">("metrics");
  const [showAverage, setShowAverage] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedAgents, setSelectedAgents] = useState<string[] | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<UsageMetric>("total");
  const [selectedMetrics, setSelectedMetrics] = useState<UsageMetric[]>([
    "total",
    "input",
    "output",
  ]);
  const [selectedPoint, setSelectedPoint] = useState<{ key: string; time: number; text: string } | null>(null);
  const [expandInput, setExpandInput] = useState(false);
  const [expandOutput, setExpandOutput] = useState(false);
  const tableMetrics: UsageMetric[] = [
    "total",
    "input",
    ...(expandInput ? (["cachedInput", "uncachedInput"] as UsageMetric[]) : []),
    "output",
    ...(expandOutput
      ? (["reasoningOutput", "completionOutput"] as UsageMetric[])
      : []),
  ];
  const activeAgent =
    agents.find((agent) => agent.id === selectedAgent) ?? agents[0];
  const chosenAgents =
    selectedAgents === null
      ? agents
      : agents.filter((agent) => selectedAgents.includes(agent.id));
  function apply(
    next: {
      from: Date | null;
      to: Date;
    },
    nextInterval = interval,
  ) {
    setSelectedPoint(null);
    setRange(next);
    setAppliedRange(next);
    onQuery({ ...next, interval: nextInterval });
  }
  function choosePreset(preset: UsagePreset) {
    setSelectedPreset(preset);
    apply(usagePresetRange(preset, new Date()));
  }
  const lines = useMemo(
    () =>
      chartMode === "metrics"
        ? selectedMetrics.map((metric, i) => ({
            key: metric,
            label: labels[metric],
            coverage: undefined,
            lastReceivedAt: undefined,
            color: colors[i % colors.length]!,
            points: (activeAgent?.points ?? []).map(
              (point) => [point.time, point.values[metric], point.observations?.[metric]] as const,
            ),
          }))
        : chosenAgents.map((agent, i) => ({
            key: agent.id,
            label: agent.name,
            coverage: agent.coverage,
            lastReceivedAt: agent.lastReceivedAt,
            color: colors[i % colors.length]!,
            points: agent.points.map(
              (point) => [point.time, point.values[selectedMetric], point.observations?.[selectedMetric]] as const,
            ),
          })),
    [activeAgent, chartMode, chosenAgents, labels, selectedMetric, selectedMetrics],
  );
  const drawnLines = useMemo(() => {
    if (!showAverage)
      return lines.map((line) => ({ ...line, averaged: false }));
    const intervalMs =
      interval === "1m" ? 60_000 : interval === "10m" ? 600_000 : 3_600_000;
    return lines.flatMap((line) => {
      const average = usageMovingAverage(
        line.points.map((point) => point[1]),
        3,
      );
      return [
        { ...line, averaged: false },
        {
          ...line,
          key: `${line.key}:average`,
          label: formatMessage({ id: "usage.averageLabel" }, { label: line.label }),
          averaged: true,
          points: line.points.map((point, index) => {
            const consecutive =
              index >= 2 &&
              point[0] - line.points[index - 1]![0] === intervalMs &&
              line.points[index - 1]![0] - line.points[index - 2]![0] ===
                intervalMs;
            return [point[0], consecutive ? average[index]! : null] as const;
          }),
        },
      ];
    });
  }, [formatMessage, interval, lines, showAverage]);
  const bounds = useMemo(() => {
    const points = lines.flatMap((line) =>
      line.points.filter(
        (point): point is readonly [number, number, number | undefined] =>
          point[1] !== null && Number.isFinite(point[1]),
      ),
    );
    if (!points.length) return null;
    return points.reduce(
      (result, point) => ({
        start: Math.min(result.start, point[0]),
        end: Math.max(result.end, point[0]),
        max: Math.max(result.max, point[1]),
      }),
      { start: Infinity, end: -Infinity, max: 1 },
    );
  }, [lines]);
  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-auto p-5"
      aria-label={t("ariaPage")}
    >
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <header>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm opacity-70">{t("subtitle")}</p>
        </header>
        <div className="flex flex-wrap gap-2" aria-label={t("ariaPresets")}>
          {(
            [
              ["hour", t("hour")],
              ["day", t("day")],
              ["week", t("week")],
              ["month", t("month")],
              ["total", t("total")],
            ] as const
          ).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              aria-pressed={preset === selectedPreset}
              className={`rounded border px-3 py-1 text-sm ${preset === selectedPreset ? "bg-brand-soft font-semibold" : ""}`}
              onClick={() => choosePreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            {t("start")}
            <input
              aria-label={t("startTime")}
              type="datetime-local"
              className="rounded border p-2"
              value={range.from ? localInput(range.from) : ""}
              onChange={(event) => {
                const d = new Date(event.target.value);
                if (Number.isFinite(d.getTime()))
                  setRange((old) => ({ ...old, from: d }));
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("end")}
            <input
              aria-label={t("endTime")}
              type="datetime-local"
              className="rounded border p-2"
              value={localInput(range.to)}
              onChange={(event) => {
                const d = new Date(event.target.value);
                if (Number.isFinite(d.getTime()))
                  setRange((old) => ({ ...old, to: d }));
              }}
            />
          </label>
          <button
            type="button"
            className="rounded border px-3 py-2"
            disabled={Boolean(range.from && range.from >= range.to)}
            onClick={() => { setSelectedPreset(null); apply(range); }}
          >
            {t("apply")}
          </button>
          {range.from && range.from >= range.to ? (
            <span role="alert">{t("badRange")}</span>
          ) : null}
        </div>
        {(range.from?.getTime() ?? null) !==
          (appliedRange.from?.getTime() ?? null) ||
        range.to.getTime() !== appliedRange.to.getTime() ? (
          <p role="status" className="text-sm opacity-70">
            {t("rangeChanged")}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={view === "table"}
            className={`rounded border px-3 py-1 ${view === "table" ? "bg-brand-soft font-semibold" : ""}`}
            onClick={() => setView("table")}
          >
            {t("table")}
          </button>
          <button
            type="button"
            aria-pressed={view === "chart"}
            className={`rounded border px-3 py-1 ${view === "chart" ? "bg-brand-soft font-semibold" : ""}`}
            onClick={() => setView("chart")}
          >
            {t("chart")}
          </button>
        </div>
        {loading ? <p role="status">{t("loading")}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {!loading &&
          !error &&
          (view === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">{t("agent")}</th>
                    {tableMetrics.map((metric) => (
                      <th key={metric} className="p-2">
                        {metric === "input" || metric === "output" ? (
                          <button
                            type="button"
                            aria-expanded={
                              metric === "input" ? expandInput : expandOutput
                            }
                            onClick={() =>
                              metric === "input"
                                ? setExpandInput((v) => !v)
                                : setExpandOutput((v) => !v)
                            }
                          >
                            {labels[metric]}{" "}
                            {metric === "input"
                              ? expandInput
                                ? String.fromCharCode(8722)
                                : "+"
                              : expandOutput
                                ? String.fromCharCode(8722)
                                : "+"}
                          </button>
                        ) : (
                          labels[metric]
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id} className="border-t">
                      <th scope="row" className="p-2">
                        <div>{agent.name}</div>
                        <div className="font-normal opacity-70">
                          {agent.coverage}
                        </div>
                        <div className="text-xs font-normal opacity-70">{agent.lastReceivedAt ? formatMessage({ id: "usage.lastReceived" }, { time: new Date(agent.lastReceivedAt).toLocaleString() }) : t("noReports")}</div>
                      </th>
                      {tableMetrics.map((metric) => (
                        <td key={metric} className="p-2 tabular-nums">
                          {display(agent.totals[metric])}
                          {agent.totals[metric] !== null && agent.totalObservations?.[metric] !== undefined ? <div className="text-xs opacity-70">{formatMessage({ id: "usage.observations" }, { count: agent.totalObservations[metric] })}</div> : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && agents.length === 0 ? (
                <p className="p-3">{t("empty")}</p>
              ) : null}
              <p className="p-2 text-xs opacity-70">
                {t("unknown")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {chartMode === "metrics" && activeAgent?.coverage ? <p className="text-xs opacity-70">{activeAgent.coverage}</p> : null}
              {chartMode === "metrics" && activeAgent?.lastReceivedAt ? <p className="text-xs opacity-70">{formatMessage({ id: "usage.lastReceived" }, { time: new Date(activeAgent.lastReceivedAt).toLocaleString() })}</p> : null}
              <p className="text-xs opacity-70">{t("metricCountsHelp")}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <label>
                  {t("view")}{" "}
                  <select
                    className="rounded border p-1"
                    value={chartMode}
                    onChange={(e) =>
                      setChartMode(e.target.value as "metrics" | "agents")
                    }
                  >
                    <option value="metrics">{t("metricView")}</option>
                    <option value="agents">{t("agentView")}</option>
                  </select>
                </label>
                <label>
                  {t("interval")}{" "}
                  <select
                    className="rounded border p-1"
                    value={interval}
                    onChange={(e) => {
                      const next = e.target.value as UsageInterval;
                      setInterval(next);
                      if (!range.from || range.from < range.to)
                        apply(range, next);
                    }}
                  >
                    <option value="1m">{t("minute")}</option>
                    <option value="10m">{t("tenMinutes")}</option>
                    <option value="1h">{t("hour")}</option>
                  </select>
                </label>
                {chartMode === "metrics" ? (
                  <label>
                    {t("agent")}{" "}
                    <select
                      className="rounded border p-1"
                      value={activeAgent?.id ?? ""}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    {t("metric")}{" "}
                    <select
                      className="rounded border p-1"
                      value={selectedMetric}
                      onChange={(e) =>
                        setSelectedMetric(e.target.value as UsageMetric)
                      }
                    >
                      {USAGE_METRICS.map((metric) => (
                        <option key={metric} value={metric}>
                          {labels[metric]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <fieldset className="flex flex-wrap gap-3 text-sm">
                <legend>
                  {chartMode === "metrics" ? t("metrics") : t("agents")}
                </legend>
                {chartMode === "metrics"
                  ? USAGE_METRICS.map((metric) => (
                      <label key={metric}>
                        <input
                          type="checkbox"
                          checked={selectedMetrics.includes(metric)}
                          onChange={(e) =>
                            setSelectedMetrics((current) =>
                              e.target.checked
                                ? [...current, metric]
                                : current.filter((item) => item !== metric),
                            )
                          }
                        />{" "}
                        {labels[metric]}
                      </label>
                    ))
                  : agents.map((agent) => (
                      <label key={agent.id}>
                        <input
                          type="checkbox"
                          checked={
                            selectedAgents === null ||
                            selectedAgents.includes(agent.id)
                          }
                          onChange={(e) =>
                            setSelectedAgents((current) => {
                              const base = current ?? agents.map((a) => a.id);
                              return e.target.checked
                                ? [...base, agent.id]
                                : base.filter((id) => id !== agent.id);
                            })
                          }
                        />{" "}
                        {agent.name}
                      </label>
                    ))}
              </fieldset>
              <label className="block text-sm">
                <input
                  type="checkbox"
                  checked={showAverage}
                  onChange={(event) => setShowAverage(event.target.checked)}
                />{" "}
                {t("average")}
              </label>
              {bounds ? (
                <svg
                  role="img"
                  aria-label={t("ariaChart")}
                  viewBox="0 0 1000 260"
                  className="h-64 w-full overflow-visible border-b border-l"
                >
                  {drawnLines.flatMap((line) => {
                    const segments: string[][] = [];
                    let current: string[] = [];
                    let previousTime: number | null = null;
                    const intervalMs =
                      interval === "1m"
                        ? 60_000
                        : interval === "10m"
                          ? 600_000
                          : 3_600_000;
                    for (const [time, value] of line.points) {
                      // Even a sparse response must not join across an omitted
                      // bucket: an absent observation does not prove zero.
                      if (
                        previousTime !== null &&
                        time - previousTime !== intervalMs &&
                        current.length
                      ) {
                        segments.push(current);
                        current = [];
                      }
                      previousTime = time;
                      if (value === null || !Number.isFinite(value)) {
                        if (current.length) segments.push(current);
                        current = [];
                        continue;
                      }
                      const x =
                        10 +
                        (980 * (time - bounds.start)) /
                          Math.max(1, bounds.end - bounds.start);
                      const y = 250 - (240 * value) / bounds.max;
                      current.push(`${x},${y}`);
                    }
                    if (current.length) segments.push(current);
                    return segments.map((points, i) =>
                      points.length === 1 ? (
                        <circle
                          key={`${line.key}-${i}`}
                          cx={points[0]!.split(",")[0]}
                          cy={points[0]!.split(",")[1]}
                          r="3"
                          fill={line.color}
                        />
                      ) : (
                        <polyline
                          key={`${line.key}-${i}`}
                          points={points.join(" ")}
                          fill="none"
                          stroke={line.color}
                          strokeWidth="2"
                          strokeDasharray={line.averaged ? "6 4" : undefined}
                          vectorEffect="non-scaling-stroke"
                        />
                      ),
                    );
                  })}
                  {lines.flatMap((line) => line.points.map(([time, value, count]) => {
                    if (value === null || count === undefined) return null;
                    const text = formatMessage({ id: "usage.chartObservation" }, { label: line.label, time: new Date(time).toLocaleString(), value: value.toLocaleString(), count });
                    return <circle key={`${line.key}:observation:${time}`} cx={10 + (980 * (time - bounds.start)) / Math.max(1, bounds.end - bounds.start)} cy={250 - (240 * value) / bounds.max} r="4" fill={line.color} tabIndex={0} aria-label={text} onClick={() => setSelectedPoint({ key: line.key, time, text })} onFocus={() => setSelectedPoint({ key: line.key, time, text })}><title>{text}</title></circle>;
                  }))}
                </svg>
              ) : (
                <p>{t("emptyChart")}</p>
              )}
              {bounds ? (
                <div className="flex justify-between text-xs opacity-70">
                  <span>{new Date(bounds.start).toLocaleString()}</span>
                  <span>{formatMessage({ id: "usage.peak" }, { count: bounds.max.toLocaleString() })}</span>
                  <span>{new Date(bounds.end).toLocaleString()}</span>
                </div>
              ) : null}
              {selectedPoint && lines.some((line) => line.key === selectedPoint.key && line.points.some((point) => point[0] === selectedPoint.time)) ? <p role="status" className="text-xs opacity-70">{selectedPoint.text}</p> : null}
              <div className="flex flex-wrap gap-4 text-sm">
                {drawnLines.map((line) => (
                  <span key={line.key}>
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />{" "}
                    {line.label}
                    {line.coverage ? <span className="text-xs opacity-70"> — {line.coverage}</span> : null}
                    {line.lastReceivedAt ? <span className="text-xs opacity-70"> — {formatMessage({ id: "usage.lastReceived" }, { time: new Date(line.lastReceivedAt).toLocaleString() })}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
