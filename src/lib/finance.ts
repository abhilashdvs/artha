import type { Account, Budget, Category, Loan, LoanSummary, Subscription, Txn } from "./types";
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
    const outstanding = Math.max(principal - paid, 0);
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
