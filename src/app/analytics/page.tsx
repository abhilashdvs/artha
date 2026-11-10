"use client";

import { useMemo, useState } from "react";
import { useAccounts, useBudgets, useCategories, useLoans, useSubscriptions, useTxns } from "@/lib/hooks";
import {
  categoryBreakdown, dayOfWeekSpend, fixedVariableSplit,
  merchantTotals, monthSeries, needsWantsSplit, spendingAverages,
} from "@/lib/analytics";
import { generateInsights } from "@/lib/insights";
import { activeWeights, healthScoreHistory } from "@/lib/healthScore";
import { filterByRange, rangeForPreset, type DatePreset, type DateRange } from "@/lib/dates";
import { formatINR, pct } from "@/lib/money";
import { Badge, Card, CardTitle, Empty } from "@/components/ui";
import { DateFilter } from "@/components/DateFilter";
import { SpendingCalendar } from "@/components/SpendingCalendar";
import { WhatIf } from "@/components/WhatIf";
import { DonutChart, HBarChart, ScoreLineChart, TrendChart } from "@/components/charts";
import { cn } from "@/lib/utils";
import { startOfMonth } from "date-fns";
import { AlertTriangle, Info, TrendingUp } from "lucide-react";

const DOW_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AnalyticsPage() {
  const txns = useTxns();
  const categories = useCategories();
  const accounts = useAccounts();
  const budgets = useBudgets();
  const loans = useLoans();
  const subscriptions = useSubscriptions();

  const [preset, setPreset] = useState<DatePreset>("6m");
  const [custom, setCustom] = useState<DateRange>({ start: startOfMonth(new Date()), end: new Date() });
  const [view, setView] = useState<"monthly" | "weekly" | "daily">("monthly");

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  const ranged = useMemo(() => (txns ? filterByRange(txns, range) : []), [txns, range]);

  const derived = useMemo(() => {
    if (!txns || !categories || !accounts || !budgets || !loans || !subscriptions) return null;
    return {
      series: monthSeries(txns, 6),
      averages: spendingAverages(txns),
      catSlices: categoryBreakdown(ranged, categories),
      merchants: merchantTotals(ranged, 10),
      dow: dayOfWeekSpend(ranged).sort((a, b) => DOW_ORDER.indexOf(a.day) - DOW_ORDER.indexOf(b.day)),
      fixedVar: fixedVariableSplit(ranged, categories),
      nw: needsWantsSplit(ranged, categories),
      insights: generateInsights(txns, categories, budgets, loans, subscriptions),
      scores: healthScoreHistory(6, { txns, budgets, accounts, loans, categories }),
      weights: activeWeights(),
    };
  }, [txns, categories, accounts, budgets, loans, subscriptions, ranged]);

  if (!derived) return <div className="py-20 text-center text-sm text-muted">Loading…</div>;

  const avgs = derived.averages;
  const avgMap = { monthly: avgs.monthly, weekly: avgs.weekly, daily: avgs.daily };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
          <p className="text-sm text-muted">Patterns, averages and honest nudges</p>
        </div>
        <DateFilter preset={preset} onChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      {/* averages */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {(["daily", "weekly", "monthly"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={cn(
              "rounded-2xl border p-3 text-left transition-colors sm:p-4",
              view === k ? "border-accent bg-accent/5" : "border-border bg-card hover:bg-cardhover"
            )}
          >
            <p className="text-[11px] text-muted sm:text-xs">Avg spend / {k === "daily" ? "day" : k === "weekly" ? "week" : "month"}</p>
            <p className="tnum mt-1 truncate text-base font-bold sm:text-lg" title={formatINR(avgMap[k])}>{formatINR(avgMap[k])}</p>
            <p className="text-[10px] text-faint">based on {avgs.daysWithSpend} active days</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <SpendingCalendar txns={txns ?? []} />
        <WhatIf txns={txns ?? []} categories={categories ?? []} subscriptions={subscriptions ?? []} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle title="Spending Trend" sub="Last 6 months" />
          <TrendChart data={derived.series} dataKey="expense" color="var(--danger)" />
        </Card>
        <Card>
          <CardTitle
            title="Financial Health Score"
            sub={`0–100 · savings ${derived.weights.savings}, budgets ${derived.weights.budget}, debt ${derived.weights.debt}, lending ${derived.weights.lending}`}
          />
          <ScoreLineChart data={derived.scores} />
          <p className="mt-1 text-[11px] text-faint">
            Score drops if you overspend budgets, carry credit card debt, or have long-pending lendings.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle title="Top Categories" sub="Selected period" />
          {derived.catSlices.length > 0 ? (
            <HBarChart data={derived.catSlices.slice(0, 10).map((c) => ({ name: c.name, total: c.value }))} />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No expenses in this period</p>
          )}
        </Card>
        <Card>
          <CardTitle title="Top Merchants" sub="Selected period" />
          {derived.merchants.length > 0 ? (
            <HBarChart data={derived.merchants.map((m) => ({ name: m.name, total: m.total }))} />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No merchant data — add merchant names to transactions</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle title="Spending by Day" sub="When do you spend most?" />
          {derived.dow.some((d) => d.total > 0) ? (
            <HBarChart data={derived.dow.map((d) => ({ name: d.day, total: d.total }))} />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No data</p>
          )}
        </Card>
        <Card>
          <CardTitle title="Needs vs Wants" sub="Selected period" />
          {derived.nw.need + derived.nw.want > 0 ? (
            <>
              <DonutChart
                data={[
                  { name: "Needs", value: derived.nw.need, color: "var(--good)" },
                  { name: "Wants", value: derived.nw.want, color: "var(--warn)" },
                  ...(derived.nw.other > 0 ? [{ name: "Unspecified", value: derived.nw.other, color: "var(--muted)" }] : []),
                ]}
              />
              <p className="text-center text-xs text-muted">
                Wants are <b className="text-warn">{pct(derived.nw.want, derived.nw.need + derived.nw.want + derived.nw.other).toFixed(0)}%</b> of spending
              </p>
            </>
          ) : (
            <p className="py-16 text-center text-xs text-muted">Tag categories as need/want to unlock this</p>
          )}
        </Card>
        <Card>
          <CardTitle title="Fixed vs Variable" sub="Selected period" />
          {derived.fixedVar.fixed + derived.fixedVar.variable > 0 ? (
            <DonutChart
              data={[
                { name: "Fixed (rent, EMI, bills…)", value: derived.fixedVar.fixed, color: "var(--accent)" },
                { name: "Variable", value: derived.fixedVar.variable, color: "var(--good)" },
                ...(derived.fixedVar.other > 0 ? [{ name: "Unspecified", value: derived.fixedVar.other, color: "var(--muted)" }] : []),
              ]}
            />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No data</p>
          )}
        </Card>
      </div>

      {/* insights */}
      <Card>
        <CardTitle title="Insights" sub="Every insight shows its calculation — no black boxes" />
        {derived.insights.length === 0 ? (
          <Empty title="No insights yet" sub="Record a few weeks of transactions and insights will appear here." />
        ) : (
          <ul className="space-y-3">
            {derived.insights.map((ins) => (
              <li
                key={ins.id}
                className={cn(
                  "rounded-xl border p-4",
                  ins.severity === "warning" ? "border-warn/40 bg-warn/5" : ins.severity === "alert" ? "border-danger/40 bg-danger/5" : "border-border bg-bg"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5", ins.severity === "info" ? "text-accent" : ins.severity === "warning" ? "text-warn" : "text-danger")}>
                    {ins.severity === "info" ? <TrendingUp size={16} /> : ins.severity === "warning" ? <Info size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{ins.title}</p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted">{ins.calc}</p>
                    {ins.action && <p className="mt-1.5 text-xs font-medium text-accent">→ {ins.action}</p>}
                  </div>
                  {ins.deltaPct !== undefined && (
                    <Badge tone={ins.deltaPct > 0 ? "warn" : "good"}>
                      {ins.deltaPct > 0 ? "+" : ""}{ins.deltaPct.toFixed(0)}%
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
