"use client";

import { useMemo, useState } from "react";
import { useCategories, useTxns } from "@/lib/hooks";
import { filterByRange, fmtDay, monthKeyOf, rangeForPreset, type DatePreset, type DateRange } from "@/lib/dates";
import { formatINR, pct } from "@/lib/money";
import { incomeTotal, investedTotal, expenseTotal } from "@/lib/finance";
import { Card, CardTitle, Empty, Stat } from "@/components/ui";
import { DateFilter } from "@/components/DateFilter";
import { TrendChart } from "@/components/charts";
import { startOfMonth } from "date-fns";

export default function IncomePage() {
  const txns = useTxns();
  const categories = useCategories();
  const [preset, setPreset] = useState<DatePreset>("6m");
  const [custom, setCustom] = useState<DateRange>({ start: startOfMonth(new Date()), end: new Date() });

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);

  const derived = useMemo(() => {
    if (!txns || !categories) return null;
    const ranged = filterByRange(txns, range);
    const incomeTxns = ranged.filter((t) => t.type === "income");

    const bySource = new Map<string, number>();
    for (const t of incomeTxns) {
      const src = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name ?? "Other" : t.merchant || t.description;
      bySource.set(src, (bySource.get(src) ?? 0) + t.amount);
    }
    const sources = [...bySource.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

    // by month
    const byMonth = new Map<string, number>();
    for (const t of incomeTxns) {
      const k = monthKeyOf(t.date);
      byMonth.set(k, (byMonth.get(k) ?? 0) + t.amount);
    }
    const monthly = [...byMonth.entries()].sort().map(([k, total]) => ({ label: k, income: total }));

    const total = incomeTotal(ranged);
    const expense = expenseTotal(ranged);
    const invested = investedTotal(ranged);
    const months = new Set(incomeTxns.map((t) => monthKeyOf(t.date))).size || 1;

    return { incomeTxns: incomeTxns.sort((a, b) => b.date.localeCompare(a.date)), sources, monthly, total, expense, invested, avgMonthly: total / months };
  }, [txns, categories, range]);

  if (!derived) return <div className="py-20 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Income</h1>
          <p className="text-sm text-muted">Salary, freelance, business & more</p>
        </div>
        <DateFilter preset={preset} onChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      {derived.incomeTxns.length === 0 ? (
        <Empty
          title="No income recorded"
          sub="Add income transactions with type = Income. Salary, freelance payouts, dividends — they all land here."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total income (period)" value={formatINR(derived.total)} tone="good" />
            <Stat label="Avg monthly" value={formatINR(Math.round(derived.avgMonthly))} />
            <Stat label="Saved" value={formatINR(derived.total - derived.expense)} tone={derived.total - derived.expense >= 0 ? "good" : "bad"}
              sub={`${pct(Math.max(0, derived.total - derived.expense), derived.total).toFixed(0)}% savings rate`} />
            <Stat label="Invested" value={formatINR(derived.invested)} sub={`${pct(derived.invested, derived.total).toFixed(0)}% of income`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardTitle title="Income by Month" sub="Selected period" />
              <TrendChart data={derived.monthly} dataKey="income" color="var(--good)" name="Income" />
            </Card>
            <Card>
              <CardTitle title="Income Sources" sub="Selected period" />
              <ul className="space-y-2">
                {derived.sources.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink" title={s.name}>{s.name}</span>
                    <span className="tnum shrink-0 font-semibold">
                      {formatINR(s.total)}
                      <span className="ml-2 text-[11px] font-normal text-muted">{pct(s.total, derived.total).toFixed(0)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card>
            <CardTitle title="Income Entries" sub={`${derived.incomeTxns.length} in range`} />
            <ul className="divide-y divide-border">
              {derived.incomeTxns.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink" title={t.description}>{t.description}</p>
                    <p className="truncate text-xs text-muted" title={`${fmtDay(t.date)}${t.merchant ? ` · ${t.merchant}` : ""}${t.categoryId ? ` · ${categories?.find((c) => c.id === t.categoryId)?.name ?? ""}` : ""}`}>
                      {fmtDay(t.date)}
                      {t.merchant ? ` · ${t.merchant}` : ""}
                      {t.categoryId ? ` · ${categories?.find((c) => c.id === t.categoryId)?.name}` : ""}
                    </p>
                  </div>
                  <span className="tnum shrink-0 font-semibold text-good">+{formatINR(t.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
