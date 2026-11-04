"use client";

import { useMemo, useState } from "react";
import { useBudgets, useCategories, useTxns } from "@/lib/hooks";
import { addBudget, deleteBudget, updateBudget } from "@/lib/db";
import { budgetProgress } from "@/lib/finance";
import { formatINR, pct, toPaise } from "@/lib/money";
import { daysLeftInMonth } from "@/lib/dates";
import { Badge, Btn, Card, Empty, Field, Input, Modal, Progress, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Budget, Category } from "@/lib/types";
import { Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";

export default function BudgetsPage() {
  const budgets = useBudgets();
  const categories = useCategories();
  const txns = useTxns();
  const [modal, setModal] = useState<Budget | "new" | null>(null);
  const [delBudget, setDelBudget] = useState<Budget | null>(null);

  const progress = useMemo(
    () => (budgets && txns ? budgetProgress(budgets, txns, undefined, categories) : []),
    [budgets, txns, categories]
  );

  if (!budgets || !categories || !txns) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const active = budgets.filter((b) => b.isActive);
  const totalBudget = active.reduce((s, b) => s + b.amount, 0);
  const totalSpent = progress.reduce((s, p) => s + p.spent, 0);
  const overCount = progress.filter((p) => p.pctUsed >= 100).length;
  const nearCount = progress.filter((p) => p.pctUsed >= 90 && p.pctUsed < 100).length;
  const dLeft = daysLeftInMonth();

  const expenseCats = categories.filter((c) => !c.isArchived && c.kind === "expense");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted">{dLeft} days left this month · refunds reduce spend automatically</p>
        </div>
        <Btn size="sm" onClick={() => setModal("new")}><Plus size={14} /> New budget</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Total budgeted</p>
          <p className="tnum mt-1 truncate text-lg font-bold" title={formatINR(totalBudget)}>{formatINR(totalBudget)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Spent this month</p>
          <p className="tnum mt-1 truncate text-lg font-bold text-danger" title={formatINR(totalSpent)}>{formatINR(totalSpent)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Remaining</p>
          <p className={cn("tnum mt-1 truncate text-lg font-bold", totalBudget - totalSpent >= 0 ? "text-good" : "text-danger")} title={formatINR(totalBudget - totalSpent)}>
            {formatINR(totalBudget - totalSpent)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Status</p>
          <p className="mt-1 text-lg font-bold">
            {overCount > 0 ? <span className="text-danger">{overCount} over</span> : nearCount > 0 ? <span className="text-warn">{nearCount} near limit</span> : <span className="text-good">All on track</span>}
          </p>
        </div>
      </div>

      {active.length === 0 ? (
        <Empty
          title="No budgets yet"
          sub="Set a monthly limit per category. Artha warns you at 90% and shows when you cross the line."
          action={<Btn onClick={() => setModal("new")}><PiggyBank size={14} /> Create your first budget</Btn>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {progress.map((p) => {
            const dailyLeft = dLeft > 0 ? p.remaining / dLeft : 0;
            return (
              <Card key={p.budget.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink" title={p.budget.categoryId ? categories.find((c) => c.id === p.budget.categoryId)?.name ?? "?" : "Overall spending"}>
                      {p.budget.categoryId ? categories.find((c) => c.id === p.budget.categoryId)?.name ?? "?" : "Overall spending"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {p.budget.categoryId ? "Category budget" : "Total across all categories"}
                      {p.budget.isDemo && <Badge tone="warn">demo</Badge>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setModal(p.budget)} title="Edit budget" aria-label="Edit budget" className="rounded-lg p-2 text-muted hover:bg-cardhover hover:text-ink"><Pencil size={13} /></button>
                    <button onClick={() => setDelBudget(p.budget)} title="Delete budget" aria-label="Delete budget" className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <p className="tnum text-lg font-bold">
                    <span className={p.pctUsed >= 100 ? "text-danger" : "text-ink"}>{formatINR(p.spent)}</span>
                    <span className="text-sm font-normal text-muted"> / {formatINR(p.budget.amount)}</span>
                  </p>
                  <span className={cn("tnum text-xs font-semibold", p.pctUsed >= 100 ? "text-danger" : p.pctUsed >= 90 ? "text-warn" : "text-muted")}>
                    {p.pctUsed.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-2"><Progress value={p.pctUsed} /></div>
                <div className="mt-2 flex justify-between text-[11px] text-muted">
                  <span>{p.pctUsed >= 100 ? `Over by ${formatINR(-p.remaining)}` : `${formatINR(p.remaining)} left`}</span>
                  {p.remaining > 0 && dLeft > 0 && <span>≈ {formatINR(dailyLeft)}/day</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetModal open={modal !== null} initial={modal === "new" ? null : modal} categories={expenseCats} onClose={() => setModal(null)} />

      {/* delete confirm */}
      <Modal open={!!delBudget} onClose={() => setDelBudget(null)} title="Delete budget?">
        {delBudget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Delete the budget for <b className="text-ink">{delBudget.categoryId ? expenseCats.find((c) => c.id === delBudget.categoryId)?.name ?? "this category" : "overall spending"}</b>? Transactions are unaffected.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelBudget(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await deleteBudget(delBudget.id); setDelBudget(null); }}>
                Delete
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BudgetModal({
  open, initial, categories, onClose,
}: { open: boolean; initial: Budget | null; categories: Category[]; onClose: () => void }) {
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100) : "");
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setCategoryId(initial?.categoryId ?? "");
    setAmount(initial ? String(initial.amount / 100) : "");
    setError(null);
  }

  async function save() {
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter a monthly amount greater than zero.");
    if (initial) {
      await updateBudget(initial.id, { amount: amt, categoryId: categoryId || undefined });
    } else {
      await addBudget({ categoryId: categoryId || undefined, amount: amt, isActive: true });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit budget" : "New budget"}>
      <div className="space-y-3">
        <Field label="Category" hint="Leave as Overall to budget total monthly spending.">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Overall (all expenses)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Monthly limit (₹)">
          <Input inputMode="decimal" placeholder="10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Create budget"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
