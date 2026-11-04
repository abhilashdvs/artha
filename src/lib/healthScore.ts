import { format, parseISO, subMonths } from "date-fns";
import type { Account, Budget, Category, HealthScoreBreakdown, Loan, Txn } from "./types";
import { budgetProgress, expenseTotal, incomeTotal, loanSummaries } from "./finance";
import { getSettingSync } from "./db";
import { monthKeyOf } from "./dates";

// ─────────────────────────────────────────────────────────────
// Financial health score (0–100), computed per month.
//   savings  /40 — savings rate
//   budget   /25 — budget discipline
//   debt     /20 — borrowed money outstanding vs monthly income
//   lending  /15 — overdue lendings
// Weights are user-tunable via the "customWeights" setting and
// always normalised back to 100.
// ─────────────────────────────────────────────────────────────

export interface HealthScoreCtx {
  txns: Txn[];
  budgets: Budget[];
  accounts: Account[];
  loans: Loan[];
  categories: Category[];
}

interface Weights {
  savings: number;
  budget: number;
  debt: number;
  lending: number;
}

const DEFAULT_WEIGHTS: Weights = { savings: 40, budget: 25, debt: 20, lending: 15 };

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreMonth(monthKey: string, ctx: HealthScoreCtx): HealthScoreBreakdown {
  const w = { ...DEFAULT_WEIGHTS, ...getSettingSync<Partial<Weights>>("customWeights", {}) };
  const scoped = ctx.txns.filter((t) => monthKeyOf(t.date) === monthKey);
  const income = incomeTotal(scoped);
  const expense = expenseTotal(scoped);

  // savings (0-40 raw): 30% rate → full marks, linear below
  const rate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0;
  const savingsRaw = Math.min(rate / 30, 1) * w.savings;

  // budget (0-25 raw): start full, −8 per breached budget, −4 per >90% budget
  let budgetRaw = w.budget;
  const progress = budgetProgress(ctx.budgets, ctx.txns);
  for (const b of progress) {
    if (b.pctUsed > 100) budgetRaw -= 8;
    else if (b.pctUsed > 90) budgetRaw -= 4;
  }
  budgetRaw = Math.max(0, Math.min(w.budget, budgetRaw));

  // debt (0-20 raw): borrowed outstanding as multiple of monthly income
  const summaries = loanSummaries(ctx.loans, ctx.txns);
  const borrowed = summaries
    .filter((s) => s.loan.direction === "borrowed")
    .reduce((s, x) => s + x.outstanding, 0);
  const debtRatio = income > 0 ? borrowed / income : borrowed > 0 ? 99 : 0;
  const debtRaw = Math.max(0, w.debt * (1 - Math.min(debtRatio / 3, 1)));

  // lending (0-15 raw): overdue lent money drags the score
  const today = format(new Date(), "yyyy-MM-dd");
  const lentOverdue = summaries
    .filter((s) => s.loan.direction === "lent" && s.outstanding > 0 && s.loan.dueDate && s.loan.dueDate < today)
    .reduce((s, x) => s + x.outstanding, 0);
  const lendRatio = income > 0 ? lentOverdue / income : lentOverdue > 0 ? 99 : 0;
  const lendingRaw = Math.max(0, w.lending * (1 - Math.min(lendRatio, 1)));

  const totalW = w.savings + w.budget + w.debt + w.lending;
  const rawTotal = savingsRaw + budgetRaw + debtRaw + lendingRaw;
  const scale = totalW > 0 ? 100 / totalW : 1;

  return {
    total: clampScore(rawTotal * scale),
    savings: Math.round(savingsRaw * scale),
    budget: Math.round(budgetRaw * scale),
    debt: Math.round(debtRaw * scale),
    lending: Math.round(lendingRaw * scale),
  };
}

export function healthScoreForMonth(monthKey: string, ctx: HealthScoreCtx): HealthScoreBreakdown {
  return scoreMonth(monthKey, ctx);
}

/** Score for each of the last `n` months, oldest first. */
export function healthScoreHistory(n: number, ctx: HealthScoreCtx): { label: string; score: number }[] {
  const out: { label: string; score: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const key = format(d, "yyyy-MM");
    out.push({ label: format(d, "MMM yy"), score: scoreMonth(key, ctx).total });
  }
  return out;
}
