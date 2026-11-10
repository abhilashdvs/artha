"use client";

import { useMemo, useState } from "react";
import { useAccounts, useCategories, usePaymentMethods, useTxns } from "@/lib/hooks";
import { filterByRange, monthKeyOf, rangeForPreset, type DatePreset, type DateRange } from "@/lib/dates";
import { exportCategorySummaryCsv, exportMonthlySummaryCsv, exportTxnsCsv } from "@/lib/csv";
import { formatINR } from "@/lib/money";
import { categoryBreakdown, type MonthPoint } from "@/lib/analytics";
import { expenseTotal, incomeTotal, investedTotal, savingsRateOf } from "@/lib/finance";
import { Btn, Card, CardTitle } from "@/components/ui";
import { DateFilter } from "@/components/DateFilter";
import { downloadFile } from "@/lib/utils";
import { parseISO, startOfMonth, format } from "date-fns";
import { Download, Printer } from "lucide-react";
import type { Txn } from "@/lib/types";

export default function ReportsPage() {
  const txns = useTxns();
  const categories = useCategories();
  const accounts = useAccounts();
  const paymentMethods = usePaymentMethods();
  const [preset, setPreset] = useState<DatePreset>("6m");
  const [custom, setCustom] = useState<DateRange>({ start: startOfMonth(new Date()), end: new Date() });

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  const ranged = useMemo(() => (txns ? filterByRange(txns, range) : []), [txns, range]);

  // Monthly buckets over the SELECTED range only — single source for the
  // preview table and the CSV export. Months with no activity are omitted
  // (no misleading ₹0 rows).
  const monthly = useMemo<MonthPoint[]>(() => {
    const byMonth = new Map<string, Txn[]>();
    for (const t of ranged) {
      const key = monthKeyOf(t.date);
      const arr = byMonth.get(key);
      if (arr) arr.push(t);
      else byMonth.set(key, [t]);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, txns]) => {
        const income = incomeTotal(txns);
        const expense = expenseTotal(txns);
        return {
          month: key,
          label: format(parseISO(`${key}-01`), "MMM yy"),
          income,
          expense,
          invested: investedTotal(txns),
          savings: income - expense,
          savingsRate: savingsRateOf(txns),
        };
      });
  }, [ranged]);
  const catBreakdown = useMemo(
    () => (categories ? categoryBreakdown(ranged, categories) : []),
    [ranged, categories]
  );

  if (!txns || !categories || !accounts || !paymentMethods) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const stamp = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted">Save as PDF, or export CSV for Excel / Google Sheets</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateFilter preset={preset} onChange={setPreset} custom={custom} onCustomChange={setCustom} />
          <Btn onClick={() => window.print()}><Printer size={14} /> Save as PDF</Btn>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle title="All Transactions" sub={`${ranged.length} rows in selected range`} />
          <p className="mb-4 text-xs text-muted">Date, type, amount, account, category, merchant, payment method, tags, notes.</p>
          <Btn variant="outline" onClick={async () => downloadFile(`artha-transactions-${stamp}.csv`, await exportTxnsCsv(ranged))}>
            <Download size={14} /> Download CSV
          </Btn>
        </Card>
        <Card>
          <CardTitle title="Category Summary" sub="Spend per category in range" />
          <p className="mb-4 text-xs text-muted">One row per category with share %. Refunds already netted out.</p>
          <Btn
            variant="outline"
            disabled={catBreakdown.length === 0}
            onClick={() => downloadFile(`artha-categories-${stamp}.csv`, exportCategorySummaryCsv(catBreakdown))}
          >
            <Download size={14} /> Download CSV
          </Btn>
        </Card>
        <Card>
          <CardTitle title="Monthly Summary" sub="Income, expense, savings per month" />
          <p className="mb-4 text-xs text-muted">Income, expenses, invested amount, savings and savings rate for each month.</p>
          <Btn
            variant="outline"
            disabled={monthly.length === 0}
            onClick={() => downloadFile(`artha-monthly-${stamp}.csv`, exportMonthlySummaryCsv(monthly))}
          >
            <Download size={14} /> Download CSV
          </Btn>
        </Card>
      </div>

      {/* preview table: monthly */}
      <Card>
        <CardTitle title="Monthly Summary Preview" sub="Months in selected period" />
        {monthly.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted">No data in selected range</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4">Month</th>
                  <th className="pb-2 pr-4 text-right">Income</th>
                  <th className="pb-2 pr-4 text-right">Expenses</th>
                  <th className="pb-2 pr-4 text-right">Invested</th>
                  <th className="pb-2 pr-4 text-right">Savings</th>
                  <th className="pb-2 text-right">Savings rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {monthly.map((m) => (
                  <tr key={m.label}>
                    <td className="py-2 pr-4 font-medium text-ink">{m.label}</td>
                    <td className="tnum py-2 pr-4 text-right text-good">{formatINR(m.income)}</td>
                    <td className="tnum py-2 pr-4 text-right text-danger">{formatINR(m.expense)}</td>
                    <td className="tnum py-2 pr-4 text-right text-accent">{formatINR(m.invested)}</td>
                    <td className={`tnum py-2 pr-4 text-right font-semibold ${m.savings >= 0 ? "text-good" : "text-danger"}`}>{formatINR(m.savings)}</td>
                    <td className="tnum py-2 text-right text-muted">{m.savingsRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
