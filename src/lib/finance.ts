import type { Account, Budget, Category, Goal, Loan, LoanSummary, Subscription, Txn } from "./types";
import { monthKeyOf } from "./dates";
import { format } from "date-fns";

// ─────────────────────────────────────────────────────────────
// FINANCIAL RULES — single source of truth.
//
//  • transfer / cc_payment      → neither income nor expense
//  • lend                       → asset (receivable), NOT consumption
//  • lend_repayment             → NOT income
//  • borrow                     → liability, NOT income
//  • borrow_repayment           → NOT consumption
//  • refund                     → reduces its expense category, NOT income
//  • investment                 → savings deployed, NOT consumption
//  • payment methods            → no balance; only accounts move
// ─────────────────────────────────────────────────────────────

/** Signed paise effect of a transaction on a specific account. */
export function deltaFor(t: Txn, accountId: string): number {
  const out = t.accountId === accountId ? -t.amount : 0;
  const inn = t.toAccountId === accountId ? t.amount : 0;
  switch (t.type) {
    case "expense":
    case "lend":
    case "borrow_repayment":
      return out;
    case "investment":
      // Source account is debited AND destination account (PPF/FD-style move) is credited.
      return out + inn;
    case "income":
    case "lend_repayment":
    case "borrow":
    case "refund":
      return t.accountId === accountId ? t.amount : 0;
    case "transfer":
    case "cc_payment":
      return out + inn;
  }
}

/** Current balance of one account: opening + Σ deltas. */
export function balanceOf(account: Account, txns: Txn[]): number {
  let bal = account.openingBalance;
  for (const t of txns) bal += deltaFor(t, account.id);
  return bal;
}

/** Balances for all accounts, keyed by account id. */
export function computeBalances(accounts: Account[], txns: Txn[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of accounts) map.set(a.id, a.openingBalance);
  for (const t of txns) {
    const d1 = deltaFor(t, t.accountId);
    if (d1) map.set(t.accountId, (map.get(t.accountId) ?? 0) + d1);
    if (t.toAccountId) {
      const d2 = deltaFor(t, t.toAccountId);
      if (d2) map.set(t.toAccountId, (map.get(t.toAccountId) ?? 0) + d2);
    }
  }
  return map;
}

// ── Totals ────────────────────────────────────────────────────

export function incomeTotal(txns: Txn[]): number {
  return txns.reduce((s, t) => (t.type === "income" ? s + t.amount : s), 0);
}

/** Gross expense (refunds shown separately). */
export function expenseGross(txns: Txn[]): number {
  return txns.reduce((s, t) => (t.type === "expense" ? s + t.amount : s), 0);
}

export function refundTotal(txns: Txn[]): number {
  return txns.reduce((s, t) => (t.type === "refund" ? s + t.amount : s), 0);
}

/** Consumption = expenses − refunds (refunds reduce their category). */
export function expenseTotal(txns: Txn[]): number {
  return expenseGross(txns) - refundTotal(txns);
}

export function investedTotal(txns: Txn[]): number {
  return txns.reduce((s, t) => (t.type === "investment" ? s + t.amount : s), 0);
}

export function transferTotal(txns: Txn[]): number {
  return txns.reduce((s, t) => (t.type === "transfer" || t.type === "cc_payment" ? s + t.amount : s), 0);
}

/** (income − consumption) / income · 100, clamped to [-100, 100]. */
export function savingsRateOf(txns: Txn[]): number {
  const inc = incomeTotal(txns);
  if (inc <= 0) return 0;
  const rate = ((inc - expenseTotal(txns)) / inc) * 100;
  return Math.max(-100, Math.min(100, Math.round(rate * 10) / 10));
}

// ── Credit cards ──────────────────────────────────────────────

/** Outstanding on a credit card given its signed balance (negative = you owe). */
export function ccOutstanding(balance: number): number {
  return Math.max(-balance, 0);
}

/** Available credit given the account's limit and signed balance. */
export function ccAvailable(account: Account, balance: number): number {
  if (!account.creditLimit) return 0;
  return Math.max(account.creditLimit - ccOutstanding(balance), 0);
}

// ── Lending / borrowing ───────────────────────────────────────

const LOAN_TXN_TYPES = new Set(["lend", "lend_repayment", "borrow", "borrow_repayment"]);

export function loanTransactions(txns: Txn[], loanId: string): Txn[] {
  return txns.filter((t) => t.loanId === loanId && LOAN_TXN_TYPES.has(t.type));
}

/**
 * Compute per-loan position. Principal = loan.amount + Σ linked lend/borrow
 * txns; repaid = Σ linked repayments. Stored "settled" status sticks;
 * otherwise status is derived from the numbers.
 */
export function loanSummaries(loans: Loan[], txns: Txn[]): LoanSummary[] {
  return loans.map((loan) => {
    const linked = loanTransactions(txns, loan.id);
    let principal = loan.amount;
    let paid = 0;
    for (const t of linked) {
      if (loan.direction === "lent") {
        if (t.type === "lend") principal += t.amount;
        else if (t.type === "lend_repayment") paid += t.amount;
      } else {
        if (t.type === "borrow") principal += t.amount;
        else if (t.type === "borrow_repayment") paid += t.amount;
      }
    }
    // a loan you marked settled is closed: anything left was forgiven / written off,
    // so it no longer counts as owed anywhere (Home, People, net worth, insights)
    const outstanding = loan.status === "settled" ? 0 : Math.max(principal - paid, 0);
    const recoveryRate = principal > 0 ? Math.min((paid / principal) * 100, 100) : 0;
    const status =
      loan.status === "settled" ? "settled"
      : principal > 0 && outstanding <= 0 ? "settled"
      : paid > 0 ? "partial"
      : "open";
    return { loan: { ...loan, status, amount: principal }, amount: principal, paid, outstanding, recoveryRate };
  });
}

// ── Net worth ─────────────────────────────────────────────────

export interface NetWorth {
  bankAndCash: number;
  investments: number;
  lentOutstanding: number;
  ccOutstanding: number;
  borrowedOutstanding: number;
  total: number;
}

export function netWorth(accounts: Account[], balances: Map<string, number>, loans: Loan[], txns: Txn[]): NetWorth {
  let bankAndCash = 0;
  let investments = 0;
  let ccOut = 0;
  for (const a of accounts) {
    const bal = balances.get(a.id) ?? a.openingBalance;
    if (a.type === "credit_card") ccOut += ccOutstanding(bal);
    else if (a.type === "investment") investments += bal;
    else bankAndCash += bal;
  }
  const summaries = loanSummaries(loans, txns);
  const lentOutstanding = summaries.filter((s) => s.loan.direction === "lent").reduce((s, x) => s + x.outstanding, 0);
  const borrowedOutstanding = summaries.filter((s) => s.loan.direction === "borrowed").reduce((s, x) => s + x.outstanding, 0);
  return {
    bankAndCash,
    investments,
    lentOutstanding,
    ccOutstanding: ccOut,
    borrowedOutstanding,
    total: bankAndCash + investments + lentOutstanding - ccOut - borrowedOutstanding,
  };
}

// ── Budgets ───────────────────────────────────────────────────

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  pctUsed: number;
}

/**
 * Progress of each active budget against one month's spend.
 * `monthKey` is a local "yyyy-MM" (defaults to the current month).
 * When `categories` are provided, a budget set on a parent category
 * also counts spend recorded against its child categories.
 */
export function budgetProgress(budgets: Budget[], txns: Txn[], monthKey?: string, categories?: Category[]): BudgetProgress[] {
  const key = monthKey ?? format(new Date(), "yyyy-MM");
  const inMonth = txns.filter((t) => monthKeyOf(t.date) === key);
  const withChildren = (categoryId: string) =>
    new Set([categoryId, ...(categories ?? []).filter((c) => c.parentId === categoryId).map((c) => c.id)]);
  return budgets
    .filter((b) => b.isActive)
    .map((budget) => {
      const ids = budget.categoryId ? withChildren(budget.categoryId) : null;
      const relevant = ids ? inMonth.filter((t) => ids.has(t.categoryId ?? "")) : inMonth;
      const spent = Math.max(expenseTotal(relevant), 0);
      const remaining = budget.amount - spent;
      const pctUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      return { budget, spent, remaining, pctUsed };
    })
    .sort((a, b) => b.pctUsed - a.pctUsed);
}

// ── Subscriptions ─────────────────────────────────────────────

/** Cost of one subscription normalised to a full year (paise). */
export function annualCost(sub: Subscription): number {
  switch (sub.cycle) {
    case "weekly":
      return sub.amount * 52;
    case "monthly":
      return sub.amount * 12;
    case "quarterly":
      return sub.amount * 4;
    case "yearly":
      return sub.amount;
  }
}

/** Monthly-equivalent cost of a list of (pre-filtered active) subscriptions. */
export function subscriptionMonthlyCost(subs: Subscription[]): number {
  return Math.round(subs.reduce((s, x) => s + annualCost(x), 0) / 12);
}

export function subscriptionYearlyCost(subs: Subscription[]): number {
  return subs.reduce((s, x) => s + annualCost(x), 0);
}

// ── Subscription Radar ────────────────────────────────────────

export type RadarLevel = "red" | "yellow" | "clear";

/** Due in under 3 days (or overdue) → red; within 10 days → yellow; otherwise clear. */
export function radarLevel(daysLeft: number): RadarLevel {
  if (daysLeft < 3) return "red";
  if (daysLeft <= 10) return "yellow";
  return "clear";
}

// ── Budget helpers ────────────────────────────────────────────

/** Alert stage for a budget at 50 / 75 / 90 / 100 % used. */
export function budgetStage(pctUsed: number): { label: string; tone: "muted" | "accent" | "warn" | "danger" } {
  if (pctUsed >= 100) return { label: "Over budget", tone: "danger" };
  if (pctUsed >= 90) return { label: "Almost used up", tone: "warn" };
  if (pctUsed >= 75) return { label: "75% used", tone: "warn" };
  if (pctUsed >= 50) return { label: "Half used", tone: "accent" };
  return { label: "On track", tone: "muted" };
}

/**
 * A realistic monthly limit: the average of the last 3 complete months'
 * spending (for a category incl. its sub-categories, or overall), rounded up
 * to the next ₹500. Returns null when there's no history.
 */
export function suggestBudget(
  txns: Txn[], categories: Category[], categoryId?: string, now = new Date(),
): { average: number; suggested: number; months: number } | null {
  const ids = categoryId
    ? new Set([categoryId, ...categories.filter((c) => c.parentId === categoryId).map((c) => c.id)])
    : null;
  const totals: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const key = format(new Date(now.getFullYear(), now.getMonth() - i, 1), "yyyy-MM");
    const inMonth = txns.filter((t) => monthKeyOf(t.date) === key && (!ids || ids.has(t.categoryId ?? "")));
    totals.push(Math.max(expenseTotal(inMonth), 0));
  }
  const withData = totals.filter((x) => x > 0);
  if (withData.length === 0) return null;
  const average = Math.round(withData.reduce((a, b) => a + b, 0) / withData.length);
  const step = 500_00;
  return { average, suggested: Math.ceil(average / step) * step, months: withData.length };
}

// ── Goals ─────────────────────────────────────────────────────

export type GoalStatus = "done" | "on-track" | "behind" | "overdue" | "no-deadline";

/**
 * Is a goal on track? Compares what's saved with where you'd be if you saved
 * evenly from the day the goal was created to its target date. Also gives the
 * amount needed per month from now (at least one month, so it never vanishes).
 */
export function goalStatus(g: Goal, now = new Date()): { status: GoalStatus; monthlyNeeded: number | null; daysLeft: number | null } {
  const left = Math.max(g.targetAmount - g.currentAmount, 0);
  if (left === 0) return { status: "done", monthlyNeeded: null, daysLeft: null };
  if (!g.targetDate) return { status: "no-deadline", monthlyNeeded: null, daysLeft: null };
  const target = new Date(`${g.targetDate.slice(0, 10)}T23:59:59`);
  const daysLeft = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return { status: "overdue", monthlyNeeded: left, daysLeft };
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
  const monthlyNeeded = Math.ceil(left / monthsLeft);
  const start = new Date(g.createdAt).getTime();
  const total = target.getTime() - start;
  const expected = total > 0 ? g.targetAmount * Math.min(1, (now.getTime() - start) / total) : g.targetAmount;
  return { status: g.currentAmount >= expected * 0.9 ? "on-track" : "behind", monthlyNeeded, daysLeft };
}
