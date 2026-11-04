// ─────────────────────────────────────────────────────────────
// Artha domain types
// All money is stored as integer paise (₹1 = 100). Never floats.
// ─────────────────────────────────────────────────────────────

export type ID = string;

export type AccountType = "bank" | "cash" | "credit_card" | "wallet" | "investment";

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  /** bank subtype: savings | salary | other */
  subtype?: string;
  bankName?: string;
  /** Signed paise. Positive = money you have. Credit cards go negative as you spend. */
  openingBalance: number;
  color?: string;
  /** credit card only */
  creditLimit?: number;
  /** credit card only: statement generation day (1-28) */
  billingDay?: number;
  isActive: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export type PaymentMethodType =
  | "upi"
  | "debit_card"
  | "credit_card"
  | "netbanking"
  | "cash"
  | "wallet"
  | "other";

/**
 * A way of paying (UPI handle, debit card, cash…). Payment methods NEVER
 * hold balances — they are lenses onto an account via linkedAccountId.
 */
export interface PaymentMethod {
  id: ID;
  name: string;
  type: PaymentMethodType;
  linkedAccountId?: ID;
  isActive: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: ID;
  name: string;
  parentId?: ID;
  kind: CategoryKind;
  /** expense only: true = need, false = want, null = unspecified */
  isNeed: boolean | null;
  /** expense only: fixed (rent/EMI) vs variable */
  flow?: "fixed" | "variable";
  color: string;
  isArchived: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export type TxnType =
  | "expense"
  | "income"
  | "transfer"
  | "cc_payment"
  | "lend"
  | "lend_repayment"
  | "borrow"
  | "borrow_repayment"
  | "refund"
  | "investment";

export interface Txn {
  id: ID;
  type: TxnType;
  /** Positive paise. Direction is derived from type + account(s). */
  amount: number;
  /** ISO date or datetime string */
  date: string;
  description: string;
  accountId: ID;
  toAccountId?: ID;
  categoryId?: ID;
  paymentMethodId?: ID;
  goalId?: ID;
  loanId?: ID;
  merchant?: string;
  notes?: string;
  tags: string[];
  linkedTxnIds?: ID[];
  isDemo?: boolean;
  createdAt: string;
}

export type LoanDirection = "lent" | "borrowed";
export type LoanStatus = "open" | "partial" | "settled";

export interface Loan {
  id: ID;
  personName: string;
  direction: LoanDirection;
  /** Initial principal in paise (usually 0 — principal accrues via linked lend/borrow txns). */
  amount: number;
  dueDate?: string;
  notes?: string;
  status: LoanStatus;
  isDemo?: boolean;
  createdAt: string;
}

export interface LoanSummary {
  loan: Loan;
  /** effective principal: loan.amount + Σ linked principal txns */
  amount: number;
  /** Σ linked repayment txns */
  paid: number;
  outstanding: number;
  /** 0–100 */
  recoveryRate: number;
}

export interface Budget {
  id: ID;
  /** undefined = overall monthly budget */
  categoryId?: ID;
  amount: number;
  isActive: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export type BillingCycle = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Subscription {
  id: ID;
  name: string;
  amount: number;
  cycle: BillingCycle;
  /** yyyy-MM-dd */
  nextDueDate: string;
  /** account the money actually leaves (balance source) */
  accountId?: ID;
  /** how it's paid: UPI app, credit/debit card, net banking… (never holds a balance) */
  paymentMethodId?: ID;
  categoryId?: ID;
  isActive: boolean;
  notes?: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface Goal {
  id: ID;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  notes?: string;
  isCompleted: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export interface Insight {
  id: string;
  severity: "info" | "warning" | "alert";
  title: string;
  /** the calculation behind the insight, shown to the user */
  calc: string;
  action?: string;
  deltaPct?: number;
}

export interface HealthScoreBreakdown {
  total: number;
  savings: number; // /40
  budget: number; // /25
  debt: number; // /20
  lending: number; // /15
}
