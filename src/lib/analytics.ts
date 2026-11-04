import { format, getDay, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import type { Account, Category, PaymentMethod, Txn } from "./types";
import { expenseTotal, incomeTotal, investedTotal, savingsRateOf } from "./finance";
import { lastNMonthKeys, monthKeyOf } from "./dates";
import { pct } from "./utils";

// ─────────────────────────────────────────────────────────────
// Pure analytics over in-memory transactions.
// ─────────────────────────────────────────────────────────────

export interface MonthPoint {
  month: string; // yyyy-MM
  label: string; // "Jan 25"
  income: number;
  expense: number; // net of refunds
  invested: number;
  savings: number;
  savingsRate: number;
}

export function monthSeries(txns: Txn[], months: number): MonthPoint[] {
  const keys = lastNMonthKeys(months);
  return keys.map((key) => {
    const scoped = txns.filter((t) => monthKeyOf(t.date) === key);
    const income = incomeTotal(scoped);
    const expense = expenseTotal(scoped);
    return {
      month: key,
      label: format(parseISO(`${key}-01`), "MMM yy"),
      income,
      expense,
      invested: investedTotal(scoped),
      savings: income - expense,
      savingsRate: savingsRateOf(scoped),
    };
  });
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string;
  value: number;
  share: number;
}

/** Expense distribution, refunds netted against their category. */
export function categoryBreakdown(txns: Txn[], categories: Category[]): CategorySlice[] {
  const byCat = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" && t.type !== "refund") continue;
    const key = t.categoryId ?? "uncategorized";
    const sign = t.type === "expense" ? 1 : -1;
    byCat.set(key, (byCat.get(key) ?? 0) + sign * t.amount);
  }
  // Clamp net-negative categories (refunds > spend) to 0 so they can't
  // shrink the total and push every other share above its true value.
  const rows = [...byCat.entries()].map(([id, value]) => ({ id, value: Math.max(value, 0) }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows
    .map(({ id, value }) => {
      const cat = categories.find((c) => c.id === id);
      return {
        categoryId: id,
        name: cat?.name ?? "Uncategorized",
        color: cat?.color ?? "#64748b",
        value,
        share: pct(value, total),
      };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Income distribution by category. */
export function incomeBreakdown(txns: Txn[], categories: Category[]): CategorySlice[] {
  const byCat = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "income") continue;
    const key = t.categoryId ?? "uncategorized";
    byCat.set(key, (byCat.get(key) ?? 0) + t.amount);
  }
  const total = [...byCat.values()].reduce((s, v) => s + v, 0);
  return [...byCat.entries()]
    .map(([id, value]) => {
      const cat = categories.find((c) => c.id === id);
      return { categoryId: id, name: cat?.name ?? "Other income", color: cat?.color ?? "#10b981", value, share: pct(value, total) };
    })
    .sort((a, b) => b.value - a.value);
}

export interface MerchantTotal {
  name: string;
  total: number;
}

export function merchantTotals(txns: Txn[], limit = 10): MerchantTotal[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense" || !t.merchant) continue;
    const key = t.merchant.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Daily expense totals over the last `days` days (chronological). */
export function dailySpendMap(txns: Txn[], days = 30): { date: string; label: string; total: number }[] {
  const today = new Date();
  const buckets: { date: string; label: string; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(today, i);
    buckets.push({ date: format(d, "yyyy-MM-dd"), label: format(d, "d MMM"), total: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.date, i]));
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const i = index.get(format(parseISO(t.date), "yyyy-MM-dd")); // local day key (not UTC slice)
    if (i !== undefined) buckets[i].total += t.amount;
  }
  return buckets;
}

export interface DowPoint {
  day: string;
  dow: number;
  total: number;
}

/** Spend by day-of-week (0 = Sunday). */
export function dayOfWeekSpend(txns: Txn[]): DowPoint[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const t of txns) {
    if (t.type !== "expense") continue;
    totals[getDay(parseISO(t.date))] += t.amount;
  }
  return totals.map((total, dow) => ({ day: names[dow], dow, total }));
}

export interface SpendingAverages {
  daily: number;
  weekly: number;
  monthly: number;
  daysWithSpend: number;
}

export function spendingAverages(txns: Txn[]): SpendingAverages {
  const expenses = txns.filter((t) => t.type === "expense");
  if (expenses.length === 0) return { daily: 0, weekly: 0, monthly: 0, daysWithSpend: 0 };
  const days = new Set(expenses.map((t) => format(parseISO(t.date), "yyyy-MM-dd")));
  const months = new Set(expenses.map((t) => monthKeyOf(t.date)));
  const total = expenses.reduce((s, t) => s + t.amount, 0);
  return {
    daily: Math.round(total / days.size),
    weekly: Math.round((total / days.size) * 7),
    monthly: Math.round(total / months.size),
    daysWithSpend: days.size,
  };
}

/** Per-account balance for distribution charts. */
export function accountBalanceList(
  accounts: Account[],
  balances: Map<string, number>,
): { accountId: string; name: string; color: string; balance: number }[] {
  return accounts
    .filter((a) => a.isActive && a.type !== "credit_card")
    .map((a) => ({
      accountId: a.id,
      name: a.name,
      color: a.color ?? "#38bdf8",
      balance: Math.max(balances.get(a.id) ?? a.openingBalance, 0),
    }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

export interface PaymentMethodSlice {
  paymentMethodId: string;
  name: string;
  value: number;
  share: number;
}

export function paymentMethodSplit(txns: Txn[], methods: PaymentMethod[]): PaymentMethodSlice[] {
  const byPm = new Map<string, number>();
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const key = t.paymentMethodId ?? "none";
    byPm.set(key, (byPm.get(key) ?? 0) + t.amount);
  }
  const total = [...byPm.values()].reduce((s, v) => s + v, 0);
  return [...byPm.entries()]
    .map(([id, value]) => {
      const pm = methods.find((m) => m.id === id);
      return { paymentMethodId: id, name: pm?.name ?? "Unspecified", value, share: pct(value, total) };
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Needs vs wants vs unspecified expense split (refunds netted into their bucket). */
export function needsWantsSplit(txns: Txn[], categories: Category[]): { need: number; want: number; other: number } {
  const out = { need: 0, want: 0, other: 0 };
  for (const t of txns) {
    if (t.type !== "expense" && t.type !== "refund") continue;
    const sign = t.type === "expense" ? 1 : -1;
    const cat = categories.find((c) => c.id === t.categoryId);
    if (cat?.isNeed === true) out.need += sign * t.amount;
    else if (cat?.isNeed === false) out.want += sign * t.amount;
    else out.other += sign * t.amount;
  }
  return { need: Math.max(out.need, 0), want: Math.max(out.want, 0), other: Math.max(out.other, 0) };
}

/** Fixed vs variable expense split by category flow (refunds netted into their bucket). */
export function fixedVariableSplit(txns: Txn[], categories: Category[]): { fixed: number; variable: number; other: number } {
  const out = { fixed: 0, variable: 0, other: 0 };
  for (const t of txns) {
    if (t.type !== "expense" && t.type !== "refund") continue;
    const sign = t.type === "expense" ? 1 : -1;
    const cat = categories.find((c) => c.id === t.categoryId);
    if (cat?.flow === "fixed") out.fixed += sign * t.amount;
    else if (cat?.flow === "variable") out.variable += sign * t.amount;
    else out.other += sign * t.amount;
  }
  return { fixed: Math.max(out.fixed, 0), variable: Math.max(out.variable, 0), other: Math.max(out.other, 0) };
}

/** Spend for a specific month offset (0 = current). Used by insights/health score. */
export function monthScopedTxns(txns: Txn[], offset: number): Txn[] {
  const key = format(startOfMonth(subMonths(new Date(), offset)), "yyyy-MM");
  return txns.filter((t) => monthKeyOf(t.date) === key);
}
