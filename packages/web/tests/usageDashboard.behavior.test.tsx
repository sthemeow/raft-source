import "./helpers/domSetup";
import { cleanup, fireEvent, render as renderWithWrapper, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { en } from "../src/i18n/messages/en";
import type { ReactElement } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { UsageDashboard } from "../src/components/usage/UsageDashboard";
import type { UsageAgent, UsageValues } from "../src/components/usage/UsageDashboard";

afterEach(cleanup);
const render = (element: ReactElement) => renderWithWrapper(element, { wrapper: ({ children }) => <IntlProvider locale="en" messages={en}>{children}</IntlProvider> });
const values: UsageValues = {
  total: 15,
  input: 10,
  output: 5,
  cachedInput: 2,
  uncachedInput: 8,
  reasoningOutput: null,
  completionOutput: null,
};
const agents: UsageAgent[] = [
  {
    id: "a",
    name: "Alpha",
    coverage: "Partial history",
    totals: values,
    points: [
      { time: 3_600_000, values },
      { time: 7_200_000, values: { ...values, total: null } },
      { time: 10_800_000, values },
    ],
  },
];

test("usage table labels unavailable metrics and retains coverage information", () => {
  render(<UsageDashboard agents={agents} loading={false} onQuery={() => {}} />);
  expect(screen.getByText(/Partial history/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Output tokens/ }));
  expect(screen.getAllByText("—")).toHaveLength(2);
  expect(screen.getByText("— means unavailable, not zero.")).toBeTruthy();
});

test("agent comparison keeps each agent's coverage next to its series", () => {
  render(<UsageDashboard agents={agents} loading={false} onQuery={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  fireEvent.change(screen.getByRole("combobox", { name: /View/ }), { target: { value: "agents" } });
  expect(screen.getByText(/Partial history/)).toBeTruthy();
});

test("metric subtotals and chart points expose their observation counts", () => {
  const counts = { total: 1, input: 2, output: 1, cachedInput: 1, uncachedInput: 2, reasoningOutput: 0, completionOutput: 0 };
  const measured: UsageAgent[] = [{ ...agents[0]!, totalObservations: counts, points: [{ time: 3_600_000, values, observations: counts }] }];
  render(<UsageDashboard agents={measured} loading={false} onQuery={() => {}} />);
  expect(screen.getByText("2 observations")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  expect(screen.getByText(/Input tokens.*2 observations/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText(/Input tokens.*2 observations/));
  expect(screen.getByRole("status").textContent).toMatch(/2 observations/);
});

test("draft date changes are labeled and stale data is hidden while loading", () => {
  const query = vi.fn();
  const rendered = render(
    <UsageDashboard agents={agents} loading={false} onQuery={query} />,
  );
  fireEvent.change(screen.getByLabelText("Start time"), {
    target: { value: "2020-01-01T00:00" },
  });
  expect(
    screen.getByText("Range changed. Select Apply range to update the data."),
  ).toBeTruthy();
  expect(query).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Apply range" }));
  expect(query).toHaveBeenCalledOnce();
  rendered.rerender(
    <UsageDashboard agents={agents} loading={true} onQuery={query} />,
  );
  expect(screen.queryByText("Alpha")).toBeNull();
  expect(screen.getByText("Loading usage…")).toBeTruthy();
});

test("a sparse chart response does not draw a line across an omitted bucket", () => {
  const sparse: UsageAgent[] = [
    { ...agents[0]!, points: [agents[0]!.points[0]!, agents[0]!.points[2]!] },
  ];
  render(<UsageDashboard agents={sparse} loading={false} onQuery={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  const chart = screen.getByRole("img", { name: "Token usage over time" });
  expect(chart.querySelectorAll("polyline")).toHaveLength(0);
  expect(chart.querySelectorAll("circle")).toHaveLength(6);
});

test("presets request the chosen interval and chart selection can be emptied", () => {
  const query = vi.fn();
  render(<UsageDashboard agents={agents} loading={false} onQuery={query} />);
  fireEvent.click(screen.getByRole("button", { name: "1 hour" }));
  expect(query).toHaveBeenCalledOnce();
  const sent = query.mock.calls[0]![0];
  expect(sent.to.getTime() - sent.from.getTime()).toBe(3_600_000);
  fireEvent.click(screen.getByRole("button", { name: "Chart" }));
  expect(
    screen
      .getByRole("img", { name: "Token usage over time" })
      .querySelectorAll("circle"),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Show 3-bucket moving average" }),
  );
  expect(screen.getByText("Total tokens (3-bucket average)")).toBeTruthy();
  expect(
    screen
      .getByRole("img", { name: "Token usage over time" })
      .querySelectorAll("polyline[stroke-dasharray]"),
  ).toHaveLength(0);
  fireEvent.change(screen.getByRole("combobox", { name: /View/ }), {
    target: { value: "agents" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
  expect(
    screen.getByText("No chart data available for this selection."),
  ).toBeTruthy();
});
