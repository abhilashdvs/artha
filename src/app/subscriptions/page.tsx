"use client";

import { useMemo, useRef, useState } from "react";
import { useAccounts, useCategories, usePaymentMethods, useSubscriptions, useTxns } from "@/lib/hooks";
import { addSubscription, addTxn, deleteSubscription, deleteTxn, updateSubscription } from "@/lib/db";
import { annualCost, radarLevel, subscriptionMonthlyCost, subscriptionYearlyCost, type RadarLevel } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { fmtDay, todayDateInput } from "@/lib/dates";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select, categoryOptions } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Account, BillingCycle, Category, PaymentMethod, PaymentMethodType, Subscription, Txn } from "@/lib/types";
import { addDays, addMonths, addYears, differenceInCalendarDays, format, parseISO, startOfToday } from "date-fns";
import { CalendarClock, Check, CreditCard, Pencil, Plus, Radar, Smartphone, Trash2, Wallet } from "lucide-react";

const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};

const PM_GROUP: Record<PaymentMethodType, string> = {
  upi: "UPI apps", credit_card: "Credit cards", debit_card: "Debit cards",
  netbanking: "Net banking", wallet: "Wallets", cash: "Cash", other: "Other",
};

const LEVEL_STYLE: Record<RadarLevel, { row: string; text: string; dot: string }> = {
  red: { row: "bg-danger/5", text: "text-danger", dot: "bg-danger" },
  yellow: { row: "bg-warn/10", text: "text-warn", dot: "bg-warn" },
  clear: { row: "", text: "text-muted", dot: "bg-border" },
};

function dueLabel(daysLeft: number) {
  return daysLeft < 0 ? `overdue ${-daysLeft}d` : daysLeft === 0 ? "due today" : daysLeft === 1 ? "due tomorrow" : `due in ${daysLeft}d`;
}

function PmIcon({ type }: { type?: PaymentMethodType }) {
  if (type === "upi") return <Smartphone size={12} className="shrink-0" />;
  if (type === "credit_card" || type === "debit_card") return <CreditCard size={12} className="shrink-0" />;
  return <Wallet size={12} className="shrink-0" />;
}

function advanceCycle(from: string, cycle: BillingCycle): string {
  const d = parseISO(from);
  const next =
    cycle === "weekly" ? addDays(d, 7) : cycle === "monthly" ? addMonths(d, 1) : cycle === "quarterly" ? addMonths(d, 3) : addYears(d, 1);
  return format(next, "yyyy-MM-dd");
}

function rewindCycle(from: string, cycle: BillingCycle): string {
  const d = parseISO(from);
  const prev =
    cycle === "weekly" ? addDays(d, -7) : cycle === "monthly" ? addMonths(d, -1) : cycle === "quarterly" ? addMonths(d, -3) : addYears(d, -1);
  return format(prev, "yyyy-MM-dd");
}

// A "Mark paid" payment is tagged with the subscription and the due date it paid,
// so the Radar knows a cycle is paid (no double payments) and can undo it.
const subTag = (id: string) => `sub:${id}`;
const dueTag = (date: string) => `due:${date}`;

export default function SubscriptionsPage() {
  const subs = useSubscriptions();
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const txns = useTxns();
  const [modal, setModal] = useState<Subscription | "new" | null>(null);
  const [delSub, setDelSub] = useState<Subscription | null>(null);
  const [paySub, setPaySub] = useState<(Subscription & { due: string }) | null>(null);

  const derived = useMemo(() => {
    if (!subs || !txns) return null;
    const active = subs.filter((s) => s.isActive);
    const monthly = subscriptionMonthlyCost(active);
    const yearly = subscriptionYearlyCost(active);
    const upcoming = active
      .map((s) => {
        // the stored due date as-is: a missed bill shows as overdue until you mark it paid
        const due = s.nextDueDate.slice(0, 10);
        const daysLeft = differenceInCalendarDays(parseISO(due), startOfToday());
        // the payment for the cycle just before this due date, if made with "Mark paid"
        // read the due date saved on the payment itself: stepping back a month from
        // e.g. 28 Feb would give 28 Jan, not the 31 Jan that was actually paid
        let prevDue = rewindCycle(due, s.cycle);
        let lastPaid: Txn | undefined;
        for (const t of txns) {
          if (!t.tags?.includes(subTag(s.id))) continue;
          const d = t.tags.find((x) => x.startsWith("due:"))?.slice(4);
          if (d && advanceCycle(d, s.cycle) === due && (!lastPaid || t.date > lastPaid.date)) {
            lastPaid = t;
            prevDue = d;
          }
        }
        return { ...s, due, daysLeft, level: radarLevel(daysLeft), lastPaid, prevDue };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const red = upcoming.filter((s) => s.level === "red");
    const yellow = upcoming.filter((s) => s.level === "yellow");
    return { active, monthly, yearly, upcoming, red, yellow, dailyBurn: yearly / 365 };
  }, [subs, txns]);

  if (!derived || !accounts || !categories || !paymentMethods) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radar size={22} className="text-accent" /> Subscription Radar
          </h1>
          <p className="text-sm text-muted">Every subscription, how it's paid, and what's due next</p>
        </div>
        <Btn size="sm" onClick={() => setModal("new")}><Plus size={14} /> Add</Btn>
      </div>

      {derived.active.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={cn("rounded-2xl border p-4", derived.red.length ? "border-danger/30 bg-danger/5" : "border-border bg-card")}>
            <p className="flex items-center gap-2 text-xs font-medium text-danger"><span className="h-2 w-2 rounded-full bg-danger" /> Due in under 3 days</p>
            <p className="tnum mt-1 text-lg font-bold">
              {derived.red.length} · {formatINR(derived.red.reduce((t, x) => t + x.amount, 0))}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{derived.red.map((x) => x.name).join(", ") || "Nothing urgent"}</p>
          </div>
          <div className={cn("rounded-2xl border p-4", derived.yellow.length ? "border-warn/30 bg-warn/10" : "border-border bg-card")}>
            <p className="flex items-center gap-2 text-xs font-medium text-warn"><span className="h-2 w-2 rounded-full bg-warn" /> Due within 10 days</p>
            <p className="tnum mt-1 text-lg font-bold">
              {derived.yellow.length} · {formatINR(derived.yellow.reduce((t, x) => t + x.amount, 0))}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{derived.yellow.map((x) => x.name).join(", ") || "Nothing coming up"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted">{derived.active.length} active · per month</p>
            <p className="tnum mt-1 text-lg font-bold">{formatINR(derived.monthly)}</p>
            <p className="mt-0.5 text-[11px] text-muted">{formatINR(derived.yearly)} a year</p>
          </div>
        </div>
      )}

      {derived.active.length === 0 ? (
        <Empty
          title="No subscriptions tracked"
          sub="Add Netflix, rent, SIPs, gym — anything recurring. Artha reminds you before each renewal and shows the true monthly cost."
          action={<Btn onClick={() => setModal("new")}><CalendarClock size={14} /> Add your first subscription</Btn>}
        />
      ) : (
        <Card>
          <CardTitle title="All subscriptions" sub="Soonest first · red under 3 days · yellow within 10 days" />
          <ul className="-mx-2 space-y-1">
            {derived.upcoming.map((s) => {
              const cat = s.categoryId ? categories.find((c) => c.id === s.categoryId) : undefined;
              const acct = s.accountId ? accounts.find((a) => a.id === s.accountId) : undefined;
              const pm = s.paymentMethodId ? paymentMethods.find((p) => p.id === s.paymentMethodId) : undefined;
              const style = LEVEL_STYLE[s.level];
              const paidVia = [pm?.name, acct && acct.id !== pm?.linkedAccountId ? acct.name : pm ? undefined : acct?.name]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={s.id} className={cn("flex items-center justify-between gap-3 rounded-xl px-2 py-3", style.row)}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", style.dot)} aria-hidden />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                         
                          <Badge>{CYCLE_LABEL[s.cycle]}</Badge>
                        </span>
                      </div>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted">
                        <PmIcon type={pm?.type} />
                        <span className="truncate">{paidVia || "Payment method not set"}</span>
                      </p>
                      <p className="truncate text-[11px] text-faint">
                        <span className="sm:hidden">{CYCLE_LABEL[s.cycle]} · </span>
                        {cat?.name ?? "Uncategorised"} · {fmtDay(s.due)}
                      </p>
                      {s.level === "clear" && s.lastPaid ? (
                        // this cycle is paid: say so, and allow undoing a mistaken tap
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-good/10 px-3 py-1 text-xs font-medium text-good">
                            <Check size={13} /> Paid {format(parseISO(s.lastPaid.date), "d MMM")}
                          </span>
                          <button
                            onClick={async () => {
                              await deleteTxn(s.lastPaid!.id);
                              await updateSubscription(s.id, { nextDueDate: s.prevDue });
                            }}
                            className="rounded-full px-2 py-1 text-xs text-muted hover:bg-cardhover hover:text-ink"
                          >
                            Undo
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPaySub(s)}
                          className={cn(
                            "mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors active:scale-95",
                            s.level === "clear"
                              ? "border border-border text-muted hover:bg-cardhover hover:text-ink"
                              : "bg-accent text-white hover:bg-accentstrong"
                          )}
                        >
                          <Check size={13} /> {s.daysLeft < 0 ? "Mark paid (overdue)" : "Mark paid"}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="tnum text-sm font-bold">{formatINR(s.amount)}</p>
                      <p className={cn("text-[11px] font-medium", style.text)}>{dueLabel(s.daysLeft)}</p>
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

      <PayModal sub={paySub} accounts={accounts} paymentMethods={paymentMethods} onClose={() => setPaySub(null)} />

      <SubModal open={modal !== null} initial={modal === "new" ? null : modal} accounts={accounts} categories={categories} paymentMethods={paymentMethods} onClose={() => setModal(null)} />

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
  open, initial, accounts, categories, paymentMethods, onClose,
}: {
  open: boolean; initial: Subscription | null;
  accounts: Account[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount / 100) : "");
  const [cycle, setCycle] = useState<BillingCycle>(initial?.cycle ?? "monthly");
  const [nextDue, setNextDue] = useState(initial?.nextDueDate ? initial.nextDueDate.slice(0, 10) : todayDateInput());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? "");
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
    setPaymentMethodId(initial?.paymentMethodId ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter an amount greater than zero.");
    const payload = {
      name: name.trim(), amount: amt, cycle, nextDueDate: nextDue,
      categoryId: categoryId || undefined, accountId: accountId || undefined,
      paymentMethodId: paymentMethodId || undefined,
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
          <Field label="Paid using" hint="UPI app, card or other method">
            <Select
              value={paymentMethodId}
              onChange={(e) => {
                const id = e.target.value;
                setPaymentMethodId(id);
                // a UPI app / card linked to an account fills in the account automatically
                const linked = paymentMethods.find((p) => p.id === id)?.linkedAccountId;
                if (linked) setAccountId(linked);
              }}
            >
              <option value="">Not set</option>
              {(Object.keys(PM_GROUP) as PaymentMethodType[]).map((t) => {
                const list = paymentMethods.filter((p) => p.isActive && p.type === t);
                return list.length ? (
                  <optgroup key={t} label={PM_GROUP[t]}>
                    {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </Select>
          </Field>
          <Field label="Bank account / card charged" hint="Where the money actually leaves">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Not set</option>
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {categoryOptions(categories.filter((c) => !c.isArchived && c.kind === "expense"))}
          </Select>
        </Field>
        {paymentMethods.filter((p) => p.isActive).length === 0 && (
          <p className="text-[11px] text-muted">Tip: add your UPI apps and cards under Accounts &amp; cards → Payment methods.</p>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add subscription"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Mark paid": records the payment as a normal spend (so it shows in Activity,
 * Home and category totals) and moves the subscription to its next due date.
 */
function PayModal({
  sub, accounts, paymentMethods, onClose,
}: {
  sub: (Subscription & { due: string }) | null;
  accounts: Account[];
  paymentMethods: PaymentMethod[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDateInput());
  const [accountId, setAccountId] = useState("");
  const [pmId, setPmId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // a second tap while the first is saving must not record a second payment
  const saving = useRef(false);

  // re-fill whenever a different subscription is opened (key-state pattern)
  const [key, setKey] = useState<string | null>(null);
  if ((sub?.id ?? null) !== key) {
    setKey(sub?.id ?? null);
    if (sub) {
      setAmount(String(sub.amount / 100));
      setDate(todayDateInput());
      setAccountId(sub.accountId ?? accounts.find((a) => a.isActive && a.type === "bank")?.id ?? "");
      setPmId(sub.paymentMethodId ?? "");
      setError(null);
    }
  }
  if (!sub) return null;
  const next = advanceCycle(sub.due, sub.cycle);

  async function confirm() {
    if (!sub || saving.current) return;
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter the amount you paid.");
    if (!accountId) return setError("Choose the account the money came from.");
    saving.current = true;
    setBusy(true);
    try {
      const now = new Date();
      const when = date === todayDateInput() ? now : new Date(`${date}T12:00:00`);
      await addTxn({
        type: "expense",
        amount: amt,
        date: when.toISOString(),
        description: sub.name,
        merchant: sub.name,
        categoryId: sub.categoryId,
        accountId,
        paymentMethodId: pmId || undefined,
        tags: ["subscription", subTag(sub.id), dueTag(sub.due)],
      });
      await updateSubscription(sub.id, { nextDueDate: next });
      onClose();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Mark ${sub.name} paid`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Adds this payment to your spending, then moves {sub.name} to its next due date: <b className="text-ink">{fmtDay(next)}</b>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Paid on"><Input type="date" value={date} max={todayDateInput()} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Paid using">
            <Select
              value={pmId}
              onChange={(e) => {
                setPmId(e.target.value);
                const linked = paymentMethods.find((p) => p.id === e.target.value)?.linkedAccountId;
                if (linked) setAccountId(linked);
              }}
            >
              <option value="">Not set</option>
              {paymentMethods.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="From account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Btn>
          <Btn onClick={confirm} disabled={busy} className="flex-1 py-2.5 sm:ml-auto sm:flex-none">
            <Check size={15} /> {busy ? "Saving…" : `Paid ${formatINR(toPaise(amount) || 0)}`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
