import Dexie, { type Table } from "dexie";
import type {
  Account,
  Budget,
  Category,
  Goal,
  Loan,
  PaymentMethod,
  Subscription,
  Txn,
} from "./types";
import { ACCOUNT_COLORS, uid } from "./utils";
import { nowISO } from "./dates";

// ─────────────────────────────────────────────────────────────
// Local-first database (IndexedDB via Dexie).
// The table shapes mirror supabase/schema.sql 1:1 so a future
// sync provider can map rows without transformation.
// ─────────────────────────────────────────────────────────────

interface SettingRow {
  key: string;
  value: unknown;
}

export class ArthaDB extends Dexie {
  accounts!: Table<Account, string>;
  paymentMethods!: Table<PaymentMethod, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Txn, string>;
  loans!: Table<Loan, string>;
  budgets!: Table<Budget, string>;
  subscriptions!: Table<Subscription, string>;
  goals!: Table<Goal, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super("artha-finance");
    this.version(1).stores({
      accounts: "id, type, isActive, isDemo",
      paymentMethods: "id, type, linkedAccountId, isDemo",
      categories: "id, parentId, kind, isArchived, isDemo",
      transactions: "id, date, type, accountId, toAccountId, categoryId, paymentMethodId, goalId, loanId, isDemo",
      loans: "id, direction, status, isDemo",
      budgets: "id, categoryId, isActive, isDemo",
      subscriptions: "id, nextDueDate, isActive, isDemo",
      goals: "id, isCompleted, isDemo",
      settings: "key",
    });
  }
}

export const db = new ArthaDB();

// ── Settings helpers ──────────────────────────────────────────
// Settings are also mirrored to localStorage so pure sync
// functions (e.g. health score) can read them without await.

const LS_PREFIX = "artha:setting:";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* SSR / private mode — ignore */
  }
}

/** Synchronous read from the localStorage mirror (client components only). */
export function getSettingSync<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function primeSettingsCache(): Promise<void> {
  try {
    const rows = await db.settings.toArray();
    for (const r of rows) localStorage.setItem(LS_PREFIX + r.key, JSON.stringify(r.value));
  } catch {
    /* ignore */
  }
}

// ── Transactions (with goal contribution side-effects) ───────

async function applyGoalEffect(t: Txn, sign: 1 | -1): Promise<void> {
  if (t.goalId && t.type === "investment") {
    const g = await db.goals.get(t.goalId);
    if (g) {
      const next = sign === 1 ? g.currentAmount + t.amount : Math.max(0, g.currentAmount - t.amount);
      await db.goals.update(g.id, { currentAmount: next });
    }
  }
}

export async function addTxn(t: Omit<Txn, "id" | "createdAt">): Promise<Txn> {
  if ((t.type === "transfer" || t.type === "cc_payment") && t.accountId && t.accountId === t.toAccountId) {
    throw new Error("Source and destination accounts must be different.");
  }
  const txn: Txn = { ...t, id: uid(), createdAt: nowISO() };
  await db.transaction("rw", [db.transactions, db.goals], async () => {
    await db.transactions.add(txn);
    await applyGoalEffect(txn, 1);
  });
  return txn;
}

export async function updateTxn(id: string, patch: Partial<Omit<Txn, "id" | "createdAt">>): Promise<void> {
  await db.transaction("rw", [db.transactions, db.goals], async () => {
    const old = await db.transactions.get(id);
    if (!old) return;
    const next: Txn = { ...old, ...patch, id };
    if ((next.type === "transfer" || next.type === "cc_payment") && next.accountId && next.accountId === next.toAccountId) {
      throw new Error("Source and destination accounts must be different.");
    }
    await applyGoalEffect(old, -1);
    await db.transactions.put(next);
    await applyGoalEffect(next, 1);
  });
}

export async function deleteTxn(id: string): Promise<void> {
  await db.transaction("rw", [db.transactions, db.goals], async () => {
    const old = await db.transactions.get(id);
    if (!old) return;
    await applyGoalEffect(old, -1);
    await db.transactions.delete(id);
  });
}

// ── Accounts ──────────────────────────────────────────────────

export async function addAccount(a: Omit<Account, "id" | "createdAt">): Promise<Account> {
  const count = await db.accounts.count();
  const account: Account = {
    ...a,
    id: uid(),
    color: a.color ?? ACCOUNT_COLORS[count % ACCOUNT_COLORS.length],
    isActive: a.isActive ?? true,
    createdAt: nowISO(),
  };
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, "id" | "createdAt">>): Promise<void> {
  await db.accounts.update(id, patch);
}

export async function deleteAccount(id: string): Promise<void> {
  await db.accounts.delete(id);
}

// ── Payment methods ───────────────────────────────────────────

export async function addPaymentMethod(p: Omit<PaymentMethod, "id" | "createdAt">): Promise<PaymentMethod> {
  const pm: PaymentMethod = { ...p, id: uid(), isActive: p.isActive ?? true, createdAt: nowISO() };
  await db.paymentMethods.add(pm);
  return pm;
}

export async function updatePaymentMethod(id: string, patch: Partial<Omit<PaymentMethod, "id" | "createdAt">>): Promise<void> {
  await db.paymentMethods.update(id, patch);
}

export async function deletePaymentMethod(id: string): Promise<void> {
  await db.paymentMethods.delete(id);
}

// ── Categories ────────────────────────────────────────────────

export async function addCategory(c: Omit<Category, "id" | "createdAt" | "color" | "isArchived"> & Partial<Pick<Category, "color" | "isArchived">>): Promise<Category> {
  const count = await db.categories.count();
  const category: Category = {
    ...c,
    id: uid(),
    color: c.color ?? ACCOUNT_COLORS[count % ACCOUNT_COLORS.length],
    isArchived: c.isArchived ?? false,
    createdAt: nowISO(),
  };
  await db.categories.add(category);
  return category;
}

export async function updateCategory(id: string, patch: Partial<Omit<Category, "id" | "createdAt">>): Promise<void> {
  await db.categories.update(id, patch);
}

/**
 * Delete a category. With `mergeInto`, all references (transactions,
 * budgets, subscriptions, child categories) are re-pointed and the
 * category is archived. Without it, the category must be unused —
 * otherwise throws an Error whose message is shown in the UI.
 */
export async function deleteCategoryWith(id: string, mergeInto?: string): Promise<void> {
  await db.transaction("rw", [db.categories, db.transactions, db.budgets, db.subscriptions], async () => {
    const cat = await db.categories.get(id);
    if (!cat) return;

    const txnCount = await db.transactions.where("categoryId").equals(id).count();
    const budgetCount = await db.budgets.where("categoryId").equals(id).count();
    const subCount = (await db.subscriptions.toArray()).filter((s) => s.categoryId === id).length;
    const childCount = await db.categories.where("parentId").equals(id).count();
    const inUse = txnCount + budgetCount + subCount + childCount;

    if (!mergeInto) {
      if (inUse > 0) {
        const parts: string[] = [];
        if (txnCount) parts.push(`${txnCount} transaction${txnCount > 1 ? "s" : ""}`);
        if (budgetCount) parts.push(`${budgetCount} budget${budgetCount > 1 ? "s" : ""}`);
        if (subCount) parts.push(`${subCount} subscription${subCount > 1 ? "s" : ""}`);
        if (childCount) parts.push(`${childCount} sub-categor${childCount > 1 ? "ies" : "y"}`);
        throw new Error(`"${cat.name}" is used by ${parts.join(", ")}. Choose another category to merge into, or move those first.`);
      }
      await db.categories.delete(id);
      return;
    }

    if (mergeInto === id) throw new Error("Cannot merge a category into itself.");
    await db.transactions.where("categoryId").equals(id).modify({ categoryId: mergeInto });
    await db.budgets.where("categoryId").equals(id).modify({ categoryId: mergeInto });
    const subs = await db.subscriptions.toArray();
    for (const s of subs.filter((x) => x.categoryId === id)) {
      await db.subscriptions.update(s.id, { categoryId: mergeInto });
    }
    // children of the merged category move up to its parent (or become top-level)
    const newParent = cat.parentId;
    await db.categories.where("parentId").equals(id).modify((child) => {
      child.parentId = newParent === mergeInto ? undefined : newParent;
    });
    await db.categories.update(id, { isArchived: true });
  });
}

// ── Budgets ───────────────────────────────────────────────────

export async function addBudget(b: Omit<Budget, "id" | "createdAt">): Promise<Budget> {
  const budget: Budget = { ...b, id: uid(), isActive: b.isActive ?? true, createdAt: nowISO() };
  await db.budgets.add(budget);
  return budget;
}

export async function updateBudget(id: string, patch: Partial<Omit<Budget, "id" | "createdAt">>): Promise<void> {
  await db.budgets.update(id, patch);
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id);
}

// ── Subscriptions ─────────────────────────────────────────────

export async function addSubscription(s: Omit<Subscription, "id" | "createdAt">): Promise<Subscription> {
  const sub: Subscription = { ...s, id: uid(), isActive: s.isActive ?? true, createdAt: nowISO() };
  await db.subscriptions.add(sub);
  return sub;
}

export async function updateSubscription(id: string, patch: Partial<Omit<Subscription, "id" | "createdAt">>): Promise<void> {
  await db.subscriptions.update(id, patch);
}

export async function deleteSubscription(id: string): Promise<void> {
  await db.subscriptions.delete(id);
}

// ── Goals ─────────────────────────────────────────────────────

export async function addGoal(g: Omit<Goal, "id" | "createdAt">): Promise<Goal> {
  const goal: Goal = { ...g, id: uid(), currentAmount: g.currentAmount ?? 0, isCompleted: g.isCompleted ?? false, createdAt: nowISO() };
  await db.goals.add(goal);
  return goal;
}

export async function updateGoal(id: string, patch: Partial<Omit<Goal, "id" | "createdAt">>): Promise<void> {
  await db.goals.update(id, patch);
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id);
}

// ── Loans ─────────────────────────────────────────────────────

export async function addLoan(l: Omit<Loan, "id" | "createdAt">): Promise<Loan> {
  const loan: Loan = { ...l, id: uid(), status: l.status ?? "open", createdAt: nowISO() };
  await db.loans.add(loan);
  return loan;
}

export async function updateLoan(id: string, patch: Partial<Omit<Loan, "id" | "createdAt">>): Promise<void> {
  await db.loans.update(id, patch);
}

export async function deleteLoan(id: string): Promise<void> {
  await db.transaction("rw", [db.loans, db.transactions], async () => {
    // Detach linked transactions so they don't keep dangling loanId refs.
    await db.transactions.where("loanId").equals(id).modify((t) => {
      t.loanId = undefined;
    });
    await db.loans.delete(id);
  });
}

// ── First-run defaults ────────────────────────────────────────

let seeded = false;

/** Seed default categories + payment methods. `force` bypasses the in-memory once-per-session guard (used after wipe-all). */
export async function seedDefaults(force = false): Promise<void> {
  if (seeded && !force) return;
  seeded = true;
  const count = await db.categories.count();
  if (count > 0) return; // never seed into a non-empty table

  const now = nowISO();
  const cat = (
    name: string,
    kind: Category["kind"],
    opts: Partial<Pick<Category, "parentId" | "isNeed" | "flow">> & { color: string },
  ): Category => ({
    id: uid(),
    name,
    kind,
    isNeed: opts.isNeed ?? null,
    flow: opts.flow,
    parentId: opts.parentId,
    color: opts.color,
    isArchived: false,
    createdAt: now,
  });

  const food = cat("Food & Dining", "expense", { isNeed: true, flow: "variable", color: "#f59e0b" });
  const transport = cat("Transport", "expense", { isNeed: true, flow: "variable", color: "#06b6d4" });
  const housing = cat("Housing & Utilities", "expense", { isNeed: true, flow: "fixed", color: "#6366f1" });
  const shopping = cat("Shopping", "expense", { isNeed: false, flow: "variable", color: "#ec4899" });
  const fun = cat("Entertainment", "expense", { isNeed: false, flow: "variable", color: "#8b5cf6" });
  const health = cat("Health", "expense", { isNeed: true, flow: "variable", color: "#10b981" });
  const subs = cat("Subscriptions", "expense", { isNeed: null, flow: "fixed", color: "#f97316" });
  const invest = cat("Investments", "expense", { isNeed: null, flow: "fixed", color: "#14b8a6" });
  const other = cat("Other", "expense", { isNeed: null, color: "#64748b" });

  const cats: Category[] = [
    food,
    cat("Groceries", "expense", { parentId: food.id, isNeed: true, flow: "variable", color: "#f59e0b" }),
    cat("Eating Out", "expense", { parentId: food.id, isNeed: false, flow: "variable", color: "#f59e0b" }),
    cat("Food Delivery", "expense", { parentId: food.id, isNeed: false, flow: "variable", color: "#f59e0b" }),
    transport,
    cat("Fuel", "expense", { parentId: transport.id, isNeed: true, flow: "variable", color: "#06b6d4" }),
    cat("Cabs & Auto", "expense", { parentId: transport.id, isNeed: false, flow: "variable", color: "#06b6d4" }),
    housing,
    cat("Rent", "expense", { parentId: housing.id, isNeed: true, flow: "fixed", color: "#6366f1" }),
    cat("Utilities & Bills", "expense", { parentId: housing.id, isNeed: true, flow: "fixed", color: "#6366f1" }),
    shopping, fun, health, subs, invest, other,
    cat("Salary", "income", { color: "#10b981" }),
    cat("Freelance & Side Income", "income", { color: "#84cc16" }),
    cat("Interest & Dividends", "income", { color: "#14b8a6" }),
    cat("Other Income", "income", { color: "#64748b" }),
  ];
  await db.categories.bulkAdd(cats);

  const pms: PaymentMethod[] = [
    { id: uid(), name: "UPI", type: "upi", isActive: true, createdAt: now },
    { id: uid(), name: "Cash", type: "cash", isActive: true, createdAt: now },
    { id: uid(), name: "Debit Card", type: "debit_card", isActive: true, createdAt: now },
  ];
  await db.paymentMethods.bulkAdd(pms);
}
