"use client";

import { useMemo, useState } from "react";
import {
  useAccounts, useBalances, useBudgets, useCategories, useDemoMode, useGoals,
  useLoans, usePaymentMethods, useSubscriptions, useTxns,
} from "@/lib/hooks";
import {
  ccOutstanding, computeBalances, expenseTotal, incomeTotal, investedTotal, netWorth,
} from "@/lib/finance";
import { filterByRange, fmtDay, monthKeyOf, rangeForPreset, type DatePreset, type DateRange } from "@/lib/dates";
import { format, startOfMonth, subMonths } from "date-fns";
import { formatINR, pct } from "@/lib/money";
import { accountBalanceList, categoryBreakdown, monthSeries, needsWantsSplit, paymentMethodSplit } from "@/lib/analytics";
import { healthScoreForMonth } from "@/lib/healthScore";
import { Card, CardTitle, Empty, Stat } from "@/components/ui";
import { DateFilter } from "@/components/DateFilter";
import { DonutChart, HBarChart, IncomeExpenseChart, SavingsRateChart, TrendChart } from "@/components/charts";
import { DemoEmpty } from "@/components/DemoEmpty";
import { ArrowDownRight, ArrowUpRight, CalendarClock, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { differenceInDays, parseISO } from "date-fns";

export default function DashboardPage() {
  const accounts = useAccounts();
  const txns = useTxns();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const subscriptions = useSubscriptions();
  const loans = useLoans();
  const budgets = useBudgets();
  const demo = useDemoMode();

  const [preset, setPreset] = useState<DatePreset>("month");
  const [custom, setCustom] = useState<DateRange>({
    start: startOfMonth(new Date()),
    end: new Date(),
  });

  const ready = accounts && txns && categories && paymentMethods && subscriptions && loans && budgets;
  const balances = useBalances(accounts, txns);

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  const rangedTxns = useMemo(() => (txns ? filterByRange(txns, range) : []), [txns, range]);

  const derived = useMemo(() => {
    if (!ready) return null;
    const active = accounts.filter((a) => a.isActive);
    const bankCash = active
      .filter((a) => ["bank", "cash", "wallet"].includes(a.type))
      .reduce((s, a) => s + (balances.get(a.id) ?? a.openingBalance), 0);
    const cashBal = active
      .filter((a) => a.type === "cash")
      .reduce((s, a) => s + (balances.get(a.id) ?? a.openingBalance), 0);
    const ccOut = active
      .filter((a) => a.type === "credit_card")
      .reduce((s, a) => s + ccOutstanding(balances.get(a.id) ?? 0), 0);

    const income = incomeTotal(rangedTxns);
    const expense = expenseTotal(rangedTxns);
    const invested = investedTotal(rangedTxns);
    const savings = income - expense;
    const savingsPct = pct(Math.max(0, savings), income);

    // previous-period comparison (same length, immediately before)
    const span = range.end.getTime() - range.start.getTime();
    const prevRange = { start: new Date(range.start.getTime() - span), end: new Date(range.start.getTime() - 1) };
    const prevTxns = filterByRange(txns, prevRange);
    const prevExpense = expenseTotal(prevTxns);

    const nw = netWorth(active, balances, loans, txns);
    const upcoming = subscriptions
      .filter((s) => s.isActive)
      .map((s) => ({ ...s, daysLeft: differenceInDays(parseISO(s.nextDueDate), new Date()) }))
      .filter((s) => s.daysLeft <= 10)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    const recent = [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    const thisMonthKey = format(new Date(), "yyyy-MM");
    const hs = healthScoreForMonth(thisMonthKey, {
      txns, budgets, accounts, loans, categories,
    });

    return {
      bankCash, cashBal, ccOut, income, expense, invested, savings, savingsPct,
      prevExpense, nw, upcoming, recent, hs,
      series6: monthSeries(txns, 6),
      catSlices: categoryBreakdown(rangedTxns, categories),
      acctDist: accountBalanceList(accounts, balances),
      pmSplit: paymentMethodSplit(rangedTxns, paymentMethods),
      nwSplit: needsWantsSplit(rangedTxns, categories),
    };
  }, [ready, accounts, balances, rangedTxns, txns, range, loans, subscriptions, categories, paymentMethods, budgets]);

  if (!ready || !derived) {
    return <div className="py-20 text-center text-sm text-muted">Loading your finances…</div>;
  }

  if (txns.length === 0 && accounts.filter((a) => a.isActive).length === 0) {
    return <DemoEmpty />;
  }

  const d = derived;
  const expChange = d.prevExpense > 0 ? pct(d.expense - d.prevExpense, d.prevExpense) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted">Your money at a glance</p>
        </div>
        <DateFilter preset={preset} onChange={setPreset} custom={custom} onCustomChange={setCustom} />
      </div>

      {/* top stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Bank + Cash Balance" value={formatINR(d.bankCash)} icon={<Wallet size={14} />} />
        <Stat label="Credit Card Outstanding" value={formatINR(d.ccOut)} tone={d.ccOut > 0 ? "bad" : "default"} icon={<ArrowDownRight size={14} />} />
        <Stat label="Income (period)" value={formatINR(d.income)} tone="good" icon={<ArrowUpRight size={14} />} />
        <Stat
          label="Expenses (period)"
          value={formatINR(d.expense)}
          tone="bad"
          sub={expChange !== null ? `${expChange >= 0 ? "+" : ""}${expChange.toFixed(1)}% vs previous period` : undefined}
        />
        <Stat
          label="Savings (period)"
          value={formatINR(d.savings)}
          tone={d.savings >= 0 ? "good" : "bad"}
          sub={d.income > 0 ? `${d.savingsPct.toFixed(0)}% savings rate` : "No income recorded"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Net Worth" value={formatINR(d.nw.total)} tone={d.nw.total >= 0 ? "good" : "bad"}
          sub={`Assets ${formatINR(d.nw.bankAndCash + d.nw.investments + d.nw.lentOutstanding)} − Liabilities ${formatINR(d.nw.ccOutstanding + d.nw.borrowedOutstanding)}`} />
        <Stat label="Invested / Saved" value={formatINR(d.nw.investments + investedTotal(txns))} sub="investment accounts + tracked investments" />
        <Stat label="Money Lent (pending)" value={formatINR(d.nw.lentOutstanding)} sub={`recovered ${formatINR(d.nw.lentOutstanding > 0 ? loans.filter(l=>l.direction==="lent").reduce((s,l)=>s+l.amount,0) - d.nw.lentOutstanding : 0)}`} />
        <Stat label="You Owe" value={formatINR(d.nw.borrowedOutstanding + d.nw.ccOutstanding)} tone={d.nw.borrowedOutstanding + d.nw.ccOutstanding > 0 ? "warn" : "good"} sub="borrowed + credit cards" />
      </div>

      {/* charts row 1 */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Income vs Expenses" sub="Last 6 months, all accounts" />
          <IncomeExpenseChart data={d.series6} />
        </Card>
        <Card>
          <CardTitle title="Spending by Category" sub="Selected period" right={
            <Link href="/analytics" className="text-xs font-medium text-accent hover:underline">Details</Link>
          } />
          {d.catSlices.length > 0 ? (
            <DonutChart data={d.catSlices.map((c) => ({ name: c.name, value: c.value, color: c.color }))} />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No expenses in this period</p>
          )}
        </Card>
      </div>

      {/* charts row 2 */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardTitle title="Spending Trend" sub="Last 6 months" />
          <TrendChart data={d.series6} dataKey="expense" color="#f43f5e" />
        </Card>
        <Card>
          <CardTitle title="Savings Rate" sub="Last 6 months" />
          <SavingsRateChart data={d.series6} />
        </Card>
        <Card>
          <CardTitle title="Needs vs Wants" sub="Selected period" />
          {d.nwSplit.need + d.nwSplit.want > 0 ? (
            <DonutChart
              data={[
                { name: "Needs", value: d.nwSplit.need, color: "#10b981" },
                { name: "Wants", value: d.nwSplit.want, color: "#f59e0b" },
                ...(d.nwSplit.other > 0 ? [{ name: "Other", value: d.nwSplit.other, color: "#64748b" }] : []),
              ]}
            />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No expenses in this period</p>
          )}
        </Card>
        <Card>
          <CardTitle title="Payment Methods" sub="Selected period spend" />
          {d.pmSplit.length > 0 ? (
            <DonutChart data={d.pmSplit.map((p) => ({ name: p.name, value: p.value }))} />
          ) : (
            <p className="py-16 text-center text-xs text-muted">No expenses in this period</p>
          )}
        </Card>
      </div>

      {/* bottom row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle title="Health Score" sub="This month" right={
            <Link href="/analytics" className="text-xs font-medium text-accent hover:underline">
              <TrendingUp size={14} className="inline" /> Trends
            </Link>
          } />
          <div className="flex items-center gap-4">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--cardhover)" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="34" fill="none"
                  stroke={d.hs.total >= 70 ? "var(--good)" : d.hs.total >= 45 ? "var(--warn)" : "var(--danger)"}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(d.hs.total / 100) * 213.6} 213.6`}
                />
              </svg>
              <span className="absolute text-2xl font-bold">{d.hs.total}</span>
            </div>
            <div className="space-y-1 text-xs text-muted">
              <p>Savings rate: <b className="text-ink">{d.hs.savings}/40</b></p>
              <p>Budget discipline: <b className="text-ink">{d.hs.budget}/25</b></p>
              <p>Debt load: <b className="text-ink">{d.hs.debt}/20</b></p>
              <p>Lending hygiene: <b className="text-ink">{d.hs.lending}/15</b></p>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle title="Upcoming Bills" sub="Due within 10 days" right={
            <Link href="/subscriptions" className="text-xs font-medium text-accent hover:underline">All</Link>
          } />
          {d.upcoming.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">Nothing due soon 🎉</p>
          ) : (
            <ul className="space-y-2.5">
              {d.upcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <CalendarClock size={14} className={s.daysLeft <= 2 ? "text-danger" : "text-muted"} />
                    {s.name}
                  </span>
                  <span className="text-right">
                    <span className="tnum font-semibold">{formatINR(s.amount)}</span>
                    <span className="block text-[11px] text-muted">
                      {s.daysLeft <= 0 ? "due today" : `in ${s.daysLeft}d`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle title="Account Distribution" sub="Balances by account" />
          {d.acctDist.length > 0 ? (
            <HBarChart data={d.acctDist.map((a) => ({ name: a.name, total: a.balance }))} name="Balance" />
          ) : (
            <p className="py-16 text-center text-xs text-muted">Add an account to see balances</p>
          )}
        </Card>
      </div>

      {/* recent transactions */}
      <Card>
        <CardTitle title="Recent Transactions" sub="Latest activity across accounts" right={
          <Link href="/transactions" className="text-xs font-medium text-accent hover:underline">View all</Link>
        } />
        {d.recent.length === 0 ? (
          <Empty title="No transactions yet" sub="Add your first transaction with the + button, or import a CSV from the Transactions page." />
        ) : (
          <ul className="divide-y divide-border">
            {d.recent.map((t) => {
              const isOut = ["expense", "lend", "borrow_repayment", "investment"].includes(t.type);
              const catName = t.categoryId ? categories.find((c) => c.id === t.categoryId)?.name : undefined;
              const acctName = accounts.find((a) => a.id === t.accountId)?.name ?? "—";
              return (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{t.description}</p>
                    <p className="text-xs text-muted">
                      {fmtDay(t.date)} · {acctName}{catName ? ` · ${catName}` : ""}
                      {t.type !== "expense" && t.type !== "income" ? ` · ${t.type.replace("_", " ")}` : ""}
                    </p>
                  </div>
                  <span className={`tnum ml-3 font-semibold ${isOut ? "text-danger" : t.type === "income" ? "text-good" : "text-ink"}`}>
                    {isOut ? "−" : t.type === "income" ? "+" : ""}{formatINR(t.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
