"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths, differenceInCalendarDays, endOfDay, endOfMonth, format, parseISO, startOfMonth, startOfToday, subMonths,
} from "date-fns";
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Lightbulb,
} from "lucide-react";
import {
  useAccounts, useBalances, useBudgets, useCategories, useLoans, usePaymentMethods, useSettingState, useSubscriptions, useTxns,
} from "@/lib/hooks";
import { expenseTotal, incomeTotal, netWorth, radarLevel } from "@/lib/finance";
import { filterByRange, fmtDay } from "@/lib/dates";
import { formatINR, pct } from "@/lib/money";
import { categoryBreakdown } from "@/lib/analytics";
import { generateInsights } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { Card, Empty } from "@/components/ui";
import { GetStarted } from "@/components/GetStarted";
import { useFeatures } from "@/lib/features";

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

// shared look for anything tappable on Home
const TAP = "transition-colors hover:bg-cardhover active:bg-cardhover";

function MiniStat({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "good" | "bad"; href: string }) {
  return (
    <Link href={href} className={cn("block rounded-2xl border border-border bg-card p-4 active:scale-[0.98]", TAP)}>
      <p className="flex items-center justify-between text-xs text-muted">
        {label} <ChevronRight size={14} className="text-faint" />
      </p>
      <p className={cn("tnum mt-1 truncate text-lg font-bold", tone === "good" && "text-good", tone === "bad" && "text-danger")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>}
    </Link>
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
  const f = useFeatures();
  // the Get started card reads these too — wait for them so it doesn't pop in late
  const methods = usePaymentMethods();
  const guideDismissed = useSettingState<boolean>("onboardingDismissed", false);

  // 0 = this month, 1 = last month, …
  const [offset, setOffset] = useState(0);
  // extra numbers stay folded away until asked for (remembered on this device)
  // (safe to read during render: Home only draws its content after data has loaded on the client)
  const [details, setDetails] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("artha:home:details") === "1"; } catch { return false; }
  });
  const toggleDetails = () => {
    setDetails((v) => {
      try { localStorage.setItem("artha:home:details", v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  };
  const ready = accounts && txns && categories && subscriptions && loans && budgets && methods && guideDismissed.loaded;

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
    // brand-new user: a short guided start instead of an empty dashboard
    return (
      <div className="mx-auto max-w-lg space-y-4 py-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Artha</h1>
          <p className="text-sm text-muted">Three quick steps and you're set.</p>
        </div>
        <GetStarted big accounts={accounts} methods={methods!} txns={txns} dismissed={guideDismissed.value} />
      </div>
    );
  }

  const change = d.prevSpent > 0 ? pct(d.spent - d.prevSpent, d.prevSpent) : null;
  const used = d.limit > 0 ? Math.round((d.spent / d.limit) * 100) : 0;
  const barColor = used >= 100 ? "var(--danger)" : used >= 85 ? "var(--warn)" : "var(--accent)";
  const topCats = d.cats.slice(0, 3);
  const maxCat = topCats[0]?.value ?? 1;
  const catName = (id?: string) => (id ? categories.find((c) => c.id === id)?.name : undefined);
  const accName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const monthLabel = format(d.monthStart, "MMMM yyyy");
  // when looking at a past month, links into Activity open that month
  const monthQ = d.isCurrent ? "" : `&from=${format(d.monthStart, "yyyy-MM-dd")}&to=${format(endOfMonth(d.monthStart), "yyyy-MM-dd")}`;
  const activity = (q: string) => `/transactions?${q}${monthQ}`;

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

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        {/* ── left: the main story ── */}
        <div className="space-y-5 lg:col-span-2">
          <GetStarted accounts={accounts} methods={methods!} txns={txns} dismissed={guideDismissed.value} />
          {/* hero: what did I spend */}
          <Link href={activity("type=expense")} className={cn("block rounded-2xl border border-border bg-card p-6 shadow-card", TAP)}>
            <p className="flex items-center justify-between text-sm text-muted">
              You spent <span className="flex items-center text-xs text-accent">See all <ChevronRight size={14} /></span>
            </p>
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
          </Link>

          <button
            type="button"
            onClick={toggleDetails}
            aria-expanded={details}
            className="-mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium text-accent hover:bg-cardhover"
          >
            {details ? "Fewer details" : "More details"}
            <ChevronDown size={14} className={cn("transition-transform", details && "rotate-180")} />
          </button>

          {/* 4 key numbers — behind "More details" */}
          {details && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Income" value={formatINR(d.income)} tone={d.income > 0 ? "good" : undefined} href={activity("type=income")} />
            <MiniStat
              label="Saved"
              href="/analytics"
              value={formatINR(d.saved)}
              tone={d.saved < 0 ? "bad" : undefined}
              sub={d.income > 0 ? `${Math.round(pct(Math.max(0, d.saved), d.income))}% of income` : undefined}
            />
            <MiniStat label="In your accounts" value={formatINR(d.nw.bankAndCash)} sub="bank + cash" href="/accounts" />
            <MiniStat label="Owed to you" value={formatINR(d.nw.lentOutstanding)} sub="money you lent" href="/lending" />
          </div>
          )}

          {/* where it went */}
          <Card>
            <SectionHead title="Where your money went" href={f.insights ? "/analytics" : activity("type=expense")} linkLabel={f.insights ? "Insights" : "See all"} />
            {topCats.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No spending recorded in {monthLabel}.</p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {topCats.map((c) => (
                  <li key={c.categoryId}>
                    <Link
                      href={activity(c.categoryId === "uncategorized" ? "type=expense" : `cat=${c.categoryId}`)}
                      className={cn("block rounded-xl px-2 py-1.5", TAP)}
                    >
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate text-ink">{c.name}</span>
                        <span className="tnum ml-3 flex shrink-0 items-center gap-1 font-medium">
                          {formatINR(c.value)} <span className="text-xs font-normal text-muted">· {c.share.toFixed(0)}%</span>
                          <ChevronRight size={14} className="text-faint" />
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cardhover">
                        <div className="h-full rounded-full" style={{ width: `${(c.value / maxCat) * 100}%`, backgroundColor: c.color }} />
                      </div>
                    </Link>
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
              <ul className="-mx-2 -my-1">
                {d.recent.map((t) => {
                  const out = OUTFLOW.includes(t.type);
                  const inc = INFLOW.includes(t.type);
                  const sub = catName(t.categoryId) ?? t.type.replace("_", " ");
                  return (
                    <li key={t.id}>
                      <Link href={activity(`edit=${t.id}`)} className={cn("flex items-center justify-between gap-3 rounded-xl px-2 py-2.5", TAP)}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                        <p className="truncate text-xs text-muted">
                          {format(parseISO(t.date), "d MMM")} · {sub} · {accName(t.accountId)}
                        </p>
                      </div>
                      <span className={cn("tnum shrink-0 text-sm font-semibold", out ? "text-ink" : inc ? "text-good" : "text-muted")}>
                        {out ? "−" : inc ? "+" : ""}{formatINR(t.amount)}
                      </span>
                      </Link>
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
              <ul className="-mx-2 space-y-1">
                {d.tips.map((t) => (
                  <li key={t.id}>
                    <Link href="/analytics" className={cn("flex gap-3 rounded-xl px-2 py-2", TAP)}>
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
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {d.isCurrent && (
            <Card>
              <SectionHead title="Subscription Radar" href="/plan?tab=bills" linkLabel="Open" />
              {d.dueSoon.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">Nothing due in the next 10 days.</p>
              ) : (
                <ul className="-mx-2 space-y-1">
                  {d.dueSoon.map((s) => (
                    <li key={s.id}>
                    <Link href="/plan?tab=bills" className={cn("flex items-center justify-between gap-3 rounded-xl px-2 py-2", TAP)}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <CalendarClock size={16} className={cn("shrink-0", radarLevel(s.daysLeft) === "red" ? "text-danger" : "text-warn")} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{s.name}</span>
                          <span className={cn("block text-[11px]", radarLevel(s.daysLeft) === "red" ? "text-danger" : "text-warn")}>
                            {s.daysLeft < 0 ? `overdue by ${-s.daysLeft}d` : s.daysLeft === 0 ? "due today" : `${s.daysLeft === 1 ? "tomorrow" : `in ${s.daysLeft} days`} · ${fmtDay(s.nextDueDate)}`}
                          </span>
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-sm font-semibold">{formatINR(s.amount)}</span>
                    </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {details && (
          <Card>
              <SectionHead title="Big picture" href="/accounts" linkLabel="Accounts" />
              <ul className="-mx-2 text-sm">
                {[
                  d.nw.investments > 0 && { label: "Investments", value: d.nw.investments, tone: "", href: "/accounts" },
                  d.nw.ccOutstanding > 0 && { label: "Credit card dues", value: d.nw.ccOutstanding, tone: "text-danger", href: "/accounts" },
                  d.nw.borrowedOutstanding > 0 && { label: "You owe people", value: d.nw.borrowedOutstanding, tone: "text-warn", href: "/lending" },
                ]
                  .filter((r): r is { label: string; value: number; tone: string; href: string } => Boolean(r))
                  .map((r) => (
                    <li key={r.label}>
                      <Link href={r.href} className={cn("flex items-center justify-between rounded-xl px-2 py-2", TAP)}>
                        <span className="text-muted">{r.label}</span>
                        <span className={cn("tnum flex items-center gap-1 font-medium", r.tone)}>
                          {formatINR(r.value)} <ChevronRight size={14} className="text-faint" />
                        </span>
                      </Link>
                    </li>
                  ))}
                <li className="mt-1 border-t border-border pt-1">
                  <Link href="/accounts" className={cn("flex items-center justify-between rounded-xl px-2 py-2", TAP)}>
                    <span className="text-muted">Net worth</span>
                    <span className="tnum flex items-center gap-1 font-semibold">
                      {formatINR(d.nw.total)} <ChevronRight size={14} className="text-faint" />
                    </span>
                  </Link>
                </li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
