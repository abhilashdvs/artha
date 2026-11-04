"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting } from "./db";
import type { Account, Budget, Category, Goal, Loan, PaymentMethod, Subscription, Txn } from "./types";
import { computeBalances } from "./finance";
import { useMemo } from "react";

// Reactive data hooks — UI updates automatically when IndexedDB changes.

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(() => db.accounts.toArray(), []);
}

export function usePaymentMethods(): PaymentMethod[] | undefined {
  return useLiveQuery(() => db.paymentMethods.toArray(), []);
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.toArray(), []);
}

export function useTxns(): Txn[] | undefined {
  return useLiveQuery(() => db.transactions.toArray(), []);
}

export function useLoans(): Loan[] | undefined {
  return useLiveQuery(() => db.loans.toArray(), []);
}

export function useBudgets(): Budget[] | undefined {
  return useLiveQuery(() => db.budgets.toArray(), []);
}

export function useSubscriptions(): Subscription[] | undefined {
  return useLiveQuery(() => db.subscriptions.toArray(), []);
}

export function useGoals(): Goal[] | undefined {
  return useLiveQuery(() => db.goals.toArray(), []);
}

export function useSetting<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.settings.get(key), [key]);
  return row ? (row.value as T) : fallback;
}

export function useDemoMode(): boolean {
  return useSetting<boolean>("demoMode", false);
}

/** Derived: balances for all accounts, memoised on inputs. */
export function useBalances(accounts: Account[] | undefined, txns: Txn[] | undefined) {
  return useMemo(() => {
    if (!accounts || !txns) return new Map<string, number>();
    return computeBalances(accounts, txns);
  }, [accounts, txns]);
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

/** Categories organised as a tree; archived hidden by default. */
export function useCategoryTree(kind?: "expense" | "income"): CategoryNode[] | undefined {
  const cats = useCategories();
  return useMemo(() => {
    if (!cats) return undefined;
    const visible = cats.filter((c) => !c.isArchived && (!kind || c.kind === kind));
    const byId = new Map(visible.map((c) => [c.id, { ...c, children: [] as CategoryNode[] }]));
    const roots: CategoryNode[] = [];
    for (const c of byId.values()) {
      if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children.push(c);
      else roots.push(c);
    }
    roots.sort((a, b) => a.name.localeCompare(b.name));
    for (const r of roots) r.children.sort((a, b) => a.name.localeCompare(b.name));
    return roots;
  }, [cats, kind]);
}

/** categoryId → name lookup */
export function useCategoryNames(): Map<string, string> {
  const cats = useCategories();
  return useMemo(() => new Map((cats ?? []).map((c) => [c.id, c.name])), [cats]);
}

export { getSetting };
