"use client";

import { useMemo, useState } from "react";
import { useAccounts, useCategories, useSubscriptions } from "@/lib/hooks";
import { addSubscription, deleteSubscription, updateSubscription } from "@/lib/db";
import { annualCost, subscriptionMonthlyCost, subscriptionYearlyCost } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { fmtDay, todayDateInput } from "@/lib/dates";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { BillingCycle, Subscription } from "@/lib/types";
import { addDays, addMonths, addYears, differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};

function advanceCycle(from: string, cycle: BillingCycle): string {
  const d = parseISO(from);
  const next =
    cycle === "weekly" ? addDays(d, 7) : cycle === "monthly" ? addMonths(d, 1) : cycle === "quarterly" ? addMonths(d, 3) : addYears(d, 1);
  return format(next, "yyyy-MM-dd");
}

/** Roll a subscription's due date forward by its cycle until it is today or later. */
function currentDue(nextDueDate: string, cycle: BillingCycle): string {
  const today = todayDateInput();
  let d = nextDueDate.slice(0, 10);
  let guard = 0;
  while (d < today && guard++ < 500) d = advanceCycle(d, cycle);
  return d;
}

export default function SubscriptionsPage() {
  const subs = useSubscriptions();
  const accounts = useAccounts();
  const categories = useCategories();
  const [modal, setModal] = useState<Subscription | "new" | null>(null);
  const [delSub, setDelSub] = useState<Subscription | null>(null);

  const derived = useMemo(() => {
    if (!subs) return null;
    const active = subs.filter((s) => s.isActive);
    const monthly = subscriptionMonthlyCost(active);
    const yearly = subscriptionYearlyCost(active);
    const upcoming = active
      .map((s) => {
        const due = currentDue(s.nextDueDate, s.cycle);
        return { ...s, due, daysLeft: differenceInCalendarDays(parseISO(due), startOfToday()) };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return { active, monthly, yearly, upcoming, dailyBurn: yearly / 365 };
  }, [subs]);

  if (!derived || !accounts || !categories) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions & Bills</h1>
          <p className="text-sm text-muted">Recurring expenses, tracked and forecasted</p>
        </div>
        <Btn size="sm" onClick={() => setModal("new")}><Plus size={14} /> Add subscription</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Monthly cost</p>
          <p className="tnum mt-1 truncate text-lg font-bold" title={formatINR(derived.monthly)}>{formatINR(derived.monthly)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Yearly cost</p>
          <p className="tnum mt-1 truncate text-lg font-bold" title={formatINR(derived.yearly)}>{formatINR(derived.yearly)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Daily burn</p>
          <p className="tnum mt-1 truncate text-lg font-bold" title={formatINR(Math.round(derived.dailyBurn))}>{formatINR(Math.round(derived.dailyBurn))}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Active subscriptions</p>
          <p className="tnum mt-1 truncate text-lg font-bold">{derived.active.length}</p>
        </div>
      </div>

      {derived.active.length === 0 ? (
        <Empty
          title="No subscriptions tracked"
          sub="Add Netflix, rent, SIPs, gym — anything recurring. Artha reminds you before each renewal and shows the true monthly cost."
          action={<Btn onClick={() => setModal("new")}><CalendarClock size={14} /> Add your first subscription</Btn>}
        />
      ) : (
        <Card>
          <CardTitle title="All Subscriptions" sub="Sorted by next due date" />
          <ul className="divide-y divide-border">
            {derived.upcoming.map((s) => {
              const cat = s.categoryId ? categories.find((c) => c.id === s.categoryId) : undefined;
              const acct = s.accountId ? accounts.find((a) => a.id === s.accountId) : undefined;
              const dueTone = s.daysLeft <= 2 ? "text-danger" : s.daysLeft <= 7 ? "text-warn" : "text-muted";
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                      {/* badges only where there's room; on phones the cycle moves into the line below */}
                      <span className="hidden shrink-0 items-center gap-2 sm:flex">
                        {s.isDemo && <Badge tone="warn">demo</Badge>}
                        <Badge>{CYCLE_LABEL[s.cycle]}</Badge>
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted" title={`${cat?.name ?? "Uncategorised"}${acct ? ` · ${acct.name}` : ""} · due ${fmtDay(s.due)}`}>
                      <span className="sm:hidden">{CYCLE_LABEL[s.cycle]} · </span>
                      {cat?.name ?? "Uncategorised"}{acct ? ` · ${acct.name}` : ""} · due {fmtDay(s.due)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="tnum text-sm font-bold">{formatINR(s.amount)}</p>
                      <p className={cn("text-[11px]", dueTone)}>
                        {s.daysLeft < 0 ? `overdue ${-s.daysLeft}d` : s.daysLeft === 0 ? "due today" : `due in ${s.daysLeft}d`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setModal(s)} title="Edit subscription" aria-label="Edit subscription" className="rounded-lg p-2 text-muted hover:bg-cardhover hover:text-ink"><Pencil size={13} /></button>
                      <button onClick={() => setDelSub(s)} title="Delete subscription" aria-label="Delete subscription" className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <SubModal open={modal !== null} initial={modal === "new" ? null : modal} accounts={accounts} categories={categories} onClose={() => setModal(null)} />

      {/* delete confirm */}
      <Modal open={!!delSub} onClose={() => setDelSub(null)} title="Delete subscription?">
        {delSub && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Delete <b className="text-ink">{delSub.name}</b>? This only removes the reminder — past payments are untouched.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelSub(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await deleteSubscription(delSub.id); setDelSub(null); }}>
                Delete
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SubModal({
  open, initial, accounts, categories, onClose,
}: {
  open: boolean; initial: Subscription | null;
  accounts: import("@/lib/types").Account[];
  categories: import("@/lib/types").Category[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100) : "");
  const [cycle, setCycle] = useState<BillingCycle>(initial?.cycle ?? "monthly");
  const [nextDue, setNextDue] = useState(initial?.nextDueDate ? initial.nextDueDate.slice(0, 10) : todayDateInput());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setName(initial?.name ?? "");
    setAmount(initial ? String(initial.amount / 100) : "");
    setCycle(initial?.cycle ?? "monthly");
    setNextDue(initial?.nextDueDate ? initial.nextDueDate.slice(0, 10) : todayDateInput());
    setCategoryId(initial?.categoryId ?? "");
    setAccountId(initial?.accountId ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter an amount greater than zero.");
    const payload = {
      name: name.trim(), amount: amt, cycle, nextDueDate: nextDue,
      categoryId: categoryId || undefined, accountId: accountId || undefined,
      isActive: initial?.isActive ?? true,
    };
    if (initial) {
      await updateSubscription(initial.id, payload);
    } else {
      await addSubscription(payload);
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit subscription" : "Add subscription"}>
      <div className="space-y-3">
        <Field label="Name"><Input placeholder="e.g. Netflix, Rent, Gym" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Billing cycle">
            <Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
              {Object.entries(CYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Next due date" hint="We'll compute the following renewals from here.">
          <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.filter((c) => !c.isArchived && c.kind === "expense").map((c) => (
                <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Paid from">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None</option>
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add subscription"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
