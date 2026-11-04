"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths, differenceInCalendarDays, endOfDay, endOfMonth, format, parseISO, startOfMonth, startOfToday, subMonths,
} from "date-fns";
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, Lightbulb,
} from "lucide-react";
import {
  useAccounts, useBalances, useBudgets, useCategories, useLoans, useSubscriptions, useTxns,
} from "@/lib/hooks";
import { expenseTotal, incomeTotal, netWorth } from "@/lib/finance";
import { filterByRange, fmtDay } from "@/lib/dates";
import { formatINR, pct } from "@/lib/money";
import { categoryBreakdown } from "@/lib/analytics";
import { generateInsights } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { Card, Empty } from "@/components/ui";
import { DemoEmpty } from "@/components/DemoEmpty";

const OUTFLOW = ["expense", "lend", "borrow_repayment", "investment"];
const INFLOW = ["income", "refund", "lend_repayment", "borrow"];

function SectionHead({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {href && (
        <Link href={href} className="text-xs font-medium text-accent hover:underline">
          {linkLabel ?? "See all"}
        </Link>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("tnum mt-1 truncate text-lg font-bold", tone === "good" && "text-good", tone === "bad" && "text-danger")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export default function HomePage() {
  const accounts = useAccounts();
  const txns = useTxns();
  const categories = useCategories();
  const subscriptions = useSubscriptions();
  const loans = useLoans();
  const budgets = useBudgets();
  const balances = useBalances(accounts, txns);

  // 0 = this month, 1 = last month, …
  const [offset, setOffset] = useState(0);
  const ready = accounts && txns && categories && subscriptions && loans && budgets;

  const d = useMemo(() => {
    if (!ready) return null;
    const now = new Date();
    const monthStart = startOfMonth(subMonths(now, offset));
    const isCurrent = offset === 0;
    // include anything dated later today (the add form allows times up to 23:59)
    const range = { start: monthStart, end: isCurrent ? endOfDay(now) : endOfMonth(monthStart) };
    // compare like-for-like: for the current month, last month up to the same day
    const prevStart = startOfMonth(subMonths(monthStart, 1));
    const prevRange = { start: prevStart, end: isCurrent ? endOfDay(addMonths(now, -1)) : endOfMonth(prevStart) };

    const monthTxns = filterByRange(txns, range);
    const income = incomeTotal(monthTxns);
    const spent = expenseTotal(monthTxns);
    const prevSpent = expenseTotal(filterByRange(txns, prevRange));
    const saved = income - spent;

    const nw = netWorth(accounts.filter((a) => a.isActive), balances, loans, txns);

    const overall = budgets.find((b) => b.isActive && !b.categoryId);
    const limit = overall?.amount ?? income;

    const cats = categoryBreakdown(monthTxns, categories);

    const dueSoon = isCurrent
      ? subscriptions
          .filter((s) => s.isActive)
          .map((s) => ({ ...s, daysLeft: differenceInCalendarDays(parseISO(s.nextDueDate), startOfToday()) }))
          .filter((s) => s.daysLeft <= 10)
          .sort((a, b) => a.daysLeft - b.daysLeft)
          .slice(0, 4)
      : [];

    const tips = isCurrent
      ? generateInsights(txns, categories, budgets, loans)
          .filter((i) => i.severity !== "info" || i.id === "top-category")
          .slice(0, 3)
      : [];

    const recent = [...monthTxns].sort((a, b) => +parseISO(b.date) - +parseISO(a.date)).slice(0, 5);

    return {
      monthStart, isCurrent, income, spent, prevSpent, saved, nw, limit,
      limitLabel: overall ? "budget" : "income", cats, dueSoon, tips, recent,
    };
  }, [ready, offset, txns, accounts, balances, loans, budgets, categories, subscriptions]);

  if (!ready || !d) {
    return <div className="py-20 text-center text-sm text-muted">Loading your finances…</div>;
  }
  if (txns.length === 0 && accounts.filter((a) => a.isActive).length === 0) {
    return <DemoEmpty />;
  }

  const change = d.prevSpent > 0 ? pct(d.spent - d.prevSpent, d.prevSpent) : null;
  const used = d.limit > 0 ? Math.round((d.spent / d.limit) * 100) : 0;
  const barColor = used >= 100 ? "var(--danger)" : used >= 85 ? "var(--warn)" : "var(--accent)";
  const topCats = d.cats.slice(0, 5);
  const maxCat = topCats[0]?.value ?? 1;
  const catName = (id?: string) => (id ? categories.find((c) => c.id === id)?.name : undefined);
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const monthLabel = format(d.monthStart, "MMMM yyyy");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* month switcher */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{d.isCurrent ? "This month" : monthLabel}</h1>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button onClick={() => setOffset((o) => o + 1)} aria-label="Previous month" className="rounded-lg p-1.5 text-muted hover:bg-cardhover hover:text-ink">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[84px] text-center text-sm font-medium">{format(d.monthStart, "MMM yyyy")}</span>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={d.isCurrent}
            aria-label="Next month"
            className="rounded-lg p-1.5 text-muted hover:bg-cardhover hover:text-ink disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── left: the main story ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* hero: what did I spend */}
          <Card className="p-6">
            <p className="text-sm text-muted">You spent</p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="tnum text-4xl font-bold tracking-tight">{formatINR(d.spent)}</p>
              {change !== null && (
                <span
                  className={cn(
                    "mb-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    change > 0 ? "bg-danger/10 text-danger" : "bg-good/10 text-good"
                  )}
                >
                  {change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(change).toFixed(0)}% vs {format(subMonths(d.monthStart, 1), "MMM")}
                </span>
              )}
            </div>
            {d.limit > 0 && (
              <div className="mt-5">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-cardhover">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(used, 100)}%`, backgroundColor: barColor }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {used}% of your {formatINR(d.limit)} {d.limitLabel}
                  {d.limit - d.spent > 0 ? ` · ${formatINR(d.limit - d.spent)} left` : ` · over by ${formatINR(d.spent - d.limit)}`}
                </p>
              </div>
            )}
          </Card>

          {/* 4 key numbers */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Income" value={formatINR(d.income)} tone={d.income > 0 ? "good" : undefined} />
            <MiniStat
              label="Saved"
              value={formatINR(d.saved)}
              tone={d.saved < 0 ? "bad" : undefined}
              sub={d.income > 0 ? `${Math.round(pct(Math.max(0, d.saved), d.income))}% of income` : undefined}
            />
            <MiniStat label="In your accounts" value={formatINR(d.nw.bankAndCash)} sub="bank + cash" />
            <MiniStat label="Owed to you" value={formatINR(d.nw.lentOutstanding)} sub="money you lent" />
          </div>

          {/* where it went */}
          <Card>
            <SectionHead title="Where your money went" href="/analytics" linkLabel="Insights" />
            {topCats.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No spending recorded in {monthLabel}.</p>
            ) : (
              <ul className="space-y-3">
                {topCats.map((c) => (
                  <li key={c.categoryId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate text-ink">{c.name}</span>
                      <span className="tnum ml-3 shrink-0 font-medium">
                        {formatINR(c.value)} <span className="text-xs font-normal text-muted">· {c.share.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cardhover">
                      <div className="h-full rounded-full" style={{ width: `${(c.value / maxCat) * 100}%`, backgroundColor: c.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* recent */}
          <Card>
            <SectionHead title="Recent" href="/transactions" />
            {d.recent.length === 0 ? (
              <Empty title="No transactions this month" sub="Tap + to add your first one." />
            ) : (
              <ul className="-my-1 divide-y divide-border">
                {d.recent.map((t) => {
                  const out = OUTFLOW.includes(t.type);
                  const inc = INFLOW.includes(t.type);
                  const sub = catName(t.categoryId) ?? t.type.replace("_", " ");
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                        <p className="truncate text-xs text-muted">
                          {format(parseISO(t.date), "d MMM")} · {sub} · {accName(t.accountId)}
                        </p>
                      </div>
                      <span className={cn("tnum shrink-0 text-sm font-semibold", out ? "text-ink" : inc ? "text-good" : "text-muted")}>
                        {out ? "−" : inc ? "+" : ""}{formatINR(t.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* ── right: what needs attention ── */}
        <div className="space-y-5">
          {d.tips.length > 0 && (
            <Card>
              <SectionHead title="Worth knowing" href="/analytics" linkLabel="More" />
              <ul className="space-y-3">
                {d.tips.map((t) => (
                  <li key={t.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        t.severity === "alert" ? "bg-danger/10 text-danger" : t.severity === "warning" ? "bg-warn/10 text-warn" : "bg-accent/10 text-accent"
                      )}
                    >
                      <Lightbulb size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-ink">{t.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{t.calc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {d.isCurrent && (
            <Card>
              <SectionHead title="Due soon" href="/plan?tab=bills" />
              {d.dueSoon.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">Nothing due in the next 10 days.</p>
              ) : (
                <ul className="space-y-3">
                  {d.dueSoon.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <CalendarClock size={16} className={cn("shrink-0", s.daysLeft <= 2 ? "text-danger" : "text-muted")} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{s.name}</span>
                          <span className={cn("block text-[11px]", s.daysLeft <= 2 ? "text-danger" : "text-muted")}>
                            {s.daysLeft < 0 ? `overdue by ${-s.daysLeft}d` : s.daysLeft === 0 ? "due today" : `in ${s.daysLeft} days · ${fmtDay(s.nextDueDate)}`}
                          </span>
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-sm font-semibold">{formatINR(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
              <SectionHead title="Big picture" href="/accounts" linkLabel="Accounts" />
              <ul className="space-y-2 text-sm">
                {d.nw.investments > 0 && (
                  <li className="flex justify-between">
                    <span className="text-muted">Investments</span>
                    <span className="tnum font-medium">{formatINR(d.nw.investments)}</span>
                  </li>
                )}
                {d.nw.ccOutstanding > 0 && (
                  <li className="flex justify-between">
                    <Link href="/accounts" className="text-muted hover:text-ink">Credit card dues</Link>
                    <span className="tnum font-medium text-danger">{formatINR(d.nw.ccOutstanding)}</span>
                  </li>
                )}
                {d.nw.borrowedOutstanding > 0 && (
                  <li className="flex justify-between">
                    <Link href="/lending" className="text-muted hover:text-ink">You owe people</Link>
                    <span className="tnum font-medium text-warn">{formatINR(d.nw.borrowedOutstanding)}</span>
                  </li>
                )}
                <li className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted">Net worth</span>
                  <span className="tnum font-semibold">{formatINR(d.nw.total)}</span>
                </li>
              </ul>
            </Card>
        </div>
      </div>
    </div>
  );
}
