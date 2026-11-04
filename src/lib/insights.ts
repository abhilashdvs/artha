import { format, parseISO, subMonths } from "date-fns";
import type { Budget, Category, Insight, Loan, Txn } from "./types";
import {
  budgetProgress,
  expenseTotal,
  incomeTotal,
  loanSummaries,
  savingsRateOf,
} from "./finance";
import { monthKeyOf } from "./dates";
import { formatINR } from "./money";
import { categoryBreakdown, merchantTotals, spendingAverages } from "./analytics";
import { pct } from "./utils";

// ─────────────────────────────────────────────────────────────
// Insight engine. Every insight shows the exact calculation
// behind it (Insight.calc) — no black boxes.
// ─────────────────────────────────────────────────────────────

function monthTxns(txns: Txn[], offset: number): Txn[] {
  const key = format(subMonths(new Date(), offset), "yyyy-MM");
  return txns.filter((t) => monthKeyOf(t.date) === key);
}

export function generateInsights(
  txns: Txn[],
  categories: Category[],
  budgets: Budget[],
  loans: Loan[],
): Insight[] {
  const out: Insight[] = [];
  const cur = monthTxns(txns, 0);
  const prev = monthTxns(txns, 1);

  const curIncome = incomeTotal(cur);
  const curExpense = expenseTotal(cur);
  const prevExpense = expenseTotal(prev);
  const rate = savingsRateOf(cur);

  // 1. Savings rate this month
  if (curIncome > 0) {
    out.push({
      id: "savings-rate",
      severity: rate >= 20 ? "info" : rate >= 0 ? "warning" : "alert",
      title:
        rate >= 20
          ? `Healthy savings rate of ${rate}% this month`
          : rate >= 0
            ? `Thin savings rate of ${rate}% this month`
            : `You spent more than you earned this month`,
      calc: `(income ${formatINR(curIncome)} − expenses ${formatINR(curExpense)}) ÷ income = ${rate}%`,
      action: rate < 20 ? "Aim for 20%+ — check your top categories below." : undefined,
      deltaPct: rate - 20,
    });
  }

  // 2. Month-over-month spend change
  if (prevExpense > 0 && curExpense > 0) {
    const delta = ((curExpense - prevExpense) / prevExpense) * 100;
    const prevLabel = format(subMonths(new Date(), 1), "MMMM");
    out.push({
      id: "mom-spend",
      severity: delta > 25 ? "alert" : delta > 10 ? "warning" : "info",
      title:
        delta > 0
          ? `Spending up ${Math.abs(delta).toFixed(0)}% vs ${prevLabel}`
          : `Spending down ${Math.abs(delta).toFixed(0)}% vs ${prevLabel}`,
      calc: `this month ${formatINR(curExpense)} vs ${prevLabel} ${formatINR(prevExpense)}`,
      deltaPct: delta,
    });
  }

  // 3. Top category this month
  const slices = categoryBreakdown(cur, categories);
  if (slices.length > 0 && curExpense > 0) {
    const top = slices[0];
    out.push({
      id: "top-category",
      severity: top.share >= 40 ? "warning" : "info",
      title: `${top.name} is your biggest expense (${top.share.toFixed(0)}%)`,
      calc: `${formatINR(top.value)} of ${formatINR(curExpense)} total spend`,
      action: top.share >= 40 ? "One category dominating the budget is worth a second look." : undefined,
    });
  }

  // 4. Rising category (biggest % jump vs last month, min ₹500)
  const prevSlices = categoryBreakdown(prev, categories);
  let biggestJump: { name: string; delta: number; cur: number; prev: number } | null = null;
  for (const s of slices) {
    const p = prevSlices.find((x) => x.categoryId === s.categoryId);
    if (!p || p.value < 50000) continue; // need ₹500+ baseline
    const d = ((s.value - p.value) / p.value) * 100;
    if (d > 30 && (!biggestJump || d > biggestJump.delta)) {
      biggestJump = { name: s.name, delta: d, cur: s.value, prev: p.value };
    }
  }
  if (biggestJump) {
    out.push({
      id: "rising-category",
      severity: "warning",
      title: `${biggestJump.name} jumped ${biggestJump.delta.toFixed(0)}% this month`,
      calc: `${formatINR(biggestJump.prev)} → ${formatINR(biggestJump.cur)}`,
      action: `Open the ${biggestJump.name} category and see what drove this.`,
      deltaPct: biggestJump.delta,
    });
  }

  // 5. Budget breaches
  const breaches = budgetProgress(budgets, txns).filter((b) => b.pctUsed > 100);
  for (const b of breaches.slice(0, 3)) {
    const name = b.budget.categoryId
      ? categories.find((c) => c.id === b.budget.categoryId)?.name ?? "Category"
      : "Overall";
    out.push({
      id: `budget-breach-${b.budget.id}`,
      severity: "alert",
      title: `${name} budget exceeded`,
      calc: `spent ${formatINR(b.spent)} against a ${formatINR(b.budget.amount)} budget (${b.pctUsed.toFixed(0)}%)`,
      action: "Trim this category for the rest of the month or raise the budget honestly.",
    });
  }

  // 6. Overdue lendings
  const summaries = loanSummaries(loans, txns);
  const overdue = summaries.filter(
    (s) => s.loan.direction === "lent" && s.outstanding > 0 && s.loan.dueDate && s.loan.dueDate < format(new Date(), "yyyy-MM-dd"),
  );
  if (overdue.length > 0) {
    const total = overdue.reduce((s, x) => s + x.outstanding, 0);
    out.push({
      id: "overdue-lending",
      severity: "warning",
      title: `${formatINR(total)} in overdue lendings`,
      calc: `${overdue.length} loan${overdue.length > 1 ? "s" : ""} past due date — ${overdue
        .slice(0, 3)
        .map((x) => x.loan.personName)
        .join(", ")}`,
      action: "A gentle reminder message usually works better than waiting.",
    });
  }

  // 7. Merchant concentration (top merchant > 25% of spend, 3-month window)
  const threeMonths = txns.filter((t) => parseISO(t.date) >= subMonths(new Date(), 3));
  const merchants = merchantTotals(threeMonths, 5);
  const threeMonthExpense = expenseTotal(threeMonths);
  if (merchants.length > 0 && threeMonthExpense > 0) {
    const top = merchants[0];
    const share = pct(top.total, threeMonthExpense);
    if (share >= 25) {
      out.push({
        id: "merchant-concentration",
        severity: "info",
        title: `${share.toFixed(0)}% of your 3-month spend went to ${top.name}`,
        calc: `${formatINR(top.total)} of ${formatINR(threeMonthExpense)}`,
      });
    }
  }

  // 8. Daily burn vs sustainable pace
  const avgs = spendingAverages(txns.filter((t) => parseISO(t.date) >= subMonths(new Date(), 1)));
  if (curIncome > 0 && avgs.daysWithSpend >= 5) {
    const dailyBudget = Math.round((curIncome * 0.7) / 30);
    if (avgs.daily > dailyBudget * 1.3) {
      out.push({
        id: "daily-burn",
        severity: "warning",
        title: `Daily spend averaging ${formatINR(avgs.daily)}`,
        calc: `${formatINR(avgs.daily)}/day across ${avgs.daysWithSpend} active days vs a sustainable ~${formatINR(dailyBudget)}/day (70% of income ÷ 30)`,
        action: "Small daily leaks compound — check food delivery and cabs first.",
      });
    }
  }

  const order = { alert: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
