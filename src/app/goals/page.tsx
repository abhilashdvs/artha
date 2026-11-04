"use client";

import { useState } from "react";
import { useAccounts, useCategories, useGoals, usePaymentMethods } from "@/lib/hooks";
import { addGoal, addTxn, deleteGoal, updateGoal } from "@/lib/db";
import { formatINR, pct, toPaise } from "@/lib/money";
import { fmtDay } from "@/lib/dates";
import { Badge, Btn, Card, Empty, Field, Input, Modal, Progress, Textarea } from "@/components/ui";
import { TxnForm } from "@/components/TxnForm";
import { cn } from "@/lib/utils";
import type { Goal } from "@/lib/types";
import { differenceInMonths, parseISO } from "date-fns";
import { CheckCircle2, Pencil, Plus, Target, Trash2 } from "lucide-react";

export default function GoalsPage() {
  const goals = useGoals();
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const [modal, setModal] = useState<Goal | "new" | null>(null);
  const [contributeFor, setContributeFor] = useState<Goal | null>(null);

  if (!goals || !accounts || !categories || !paymentMethods) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const open = goals.filter((g) => !g.isCompleted);
  const done = goals.filter((g) => g.isCompleted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Savings Goals</h1>
          <p className="text-sm text-muted">Trips, gadgets, emergency fund — track progress toward each</p>
        </div>
        <Btn size="sm" onClick={() => setModal("new")}><Plus size={14} /> New goal</Btn>
      </div>

      {goals.length === 0 ? (
        <Empty
          title="No goals yet"
          sub="Create a goal, then add Investment/Savings transactions linked to it. Progress updates automatically."
          action={<Btn onClick={() => setModal("new")}><Target size={14} /> Create your first goal</Btn>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((g) => {
            const p = pct(g.currentAmount, g.targetAmount);
            const monthsLeft = g.targetDate ? differenceInMonths(parseISO(g.targetDate), new Date()) : null;
            const monthlyNeeded =
              monthsLeft !== null && monthsLeft > 0 ? Math.ceil((g.targetAmount - g.currentAmount) / monthsLeft) : null;
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {g.name} {g.isDemo && <Badge tone="warn">demo</Badge>}
                    </p>
                    <p className="text-[11px] text-muted">
                      {g.targetDate ? `target ${fmtDay(g.targetDate)}` : "no deadline"}
                      {g.notes ? ` · ${g.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal(g)} className="rounded-lg p-1.5 text-muted hover:bg-cardhover hover:text-ink"><Pencil size={13} /></button>
                    <button onClick={() => deleteGoal(g.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="tnum mt-3 text-lg font-bold">
                  {formatINR(g.currentAmount)} <span className="text-sm font-normal text-muted">/ {formatINR(g.targetAmount)}</span>
                </p>
                <div className="mt-2"><Progress value={p} color="#8b5cf6" /></div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span className={cn("font-semibold", p >= 100 ? "text-good" : "text-accent")}>{p.toFixed(0)}%</span>
                  {monthlyNeeded !== null && p < 100 && <span>needs ≈ {formatINR(monthlyNeeded)}/mo</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Btn size="sm" variant="outline" onClick={() => setContributeFor(g)}>Contribute</Btn>
                  {p >= 100 && (
                    <Btn size="sm" variant="ghost" onClick={() => updateGoal(g.id, { isCompleted: true })}>
                      <CheckCircle2 size={12} /> Complete
                    </Btn>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <Card>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Completed</p>
          <ul className="divide-y divide-border">
            {done.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-muted line-through">{g.name}</span>
                <span className="tnum text-xs text-muted">{formatINR(g.targetAmount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <GoalModal open={modal !== null} initial={modal === "new" ? null : modal} onClose={() => setModal(null)} />

      <Modal open={!!contributeFor} onClose={() => setContributeFor(null)} title={`Contribute to ${contributeFor?.name}`} wide>
        {contributeFor && (
          <TxnForm
            accounts={accounts}
            categories={categories}
            paymentMethods={paymentMethods}
            goals={goals}
            fixedType="investment"
            initial={{ description: `Contribution: ${contributeFor.name}`, goalId: contributeFor.id }}
            submitLabel="Add contribution"
            onSubmit={async (values) => {
              await addTxn({ ...values, goalId: contributeFor.id });
              setContributeFor(null);
            }}
            onCancel={() => setContributeFor(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function GoalModal({ open, initial, onClose }: { open: boolean; initial: Goal | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.targetAmount / 100) : "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setName(initial?.name ?? "");
    setTarget(initial ? String(initial.targetAmount / 100) : "");
    setTargetDate(initial?.targetDate ?? "");
    setNotes(initial?.notes ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    const amt = toPaise(target);
    if (amt <= 0) return setError("Enter a target amount greater than zero.");
    if (initial) {
      await updateGoal(initial.id, { name: name.trim(), targetAmount: amt, targetDate: targetDate || undefined, notes: notes || undefined });
    } else {
      await addGoal({ name: name.trim(), targetAmount: amt, targetDate: targetDate || undefined, notes: notes || undefined, currentAmount: 0, isCompleted: false });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit goal" : "New goal"}>
      <div className="space-y-3">
        <Field label="Goal name"><Input placeholder="e.g. Japan trip, Emergency fund" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount (₹)"><Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
          <Field label="Target date (optional)"><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
        </div>
        <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Create goal"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
