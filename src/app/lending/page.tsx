"use client";

import { useMemo, useState } from "react";
import { useAccounts, useCategories, useLoans, usePaymentMethods, useTxns } from "@/lib/hooks";
import { addLoan, addTxn, deleteLoan, updateLoan } from "@/lib/db";
import { loanSummaries, loanTransactions } from "@/lib/finance";
import { formatINR, toPaise } from "@/lib/money";
import { fmtDay, todayDateInput } from "@/lib/dates";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { TxnForm } from "@/components/TxnForm";
import { cn } from "@/lib/utils";
import type { Account, Loan, LoanSummary } from "@/lib/types";
import { differenceInDays, parseISO } from "date-fns";
import { CheckCircle2, HandCoins, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

export default function LendingPage() {
  const loans = useLoans();
  const txns = useTxns();
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const [loanModal, setLoanModal] = useState<Loan | "new" | null>(null);
  const [repayFor, setRepayFor] = useState<Loan | null>(null);
  const [historyFor, setHistoryFor] = useState<Loan | null>(null);
  const [delLoan, setDelLoan] = useState<Loan | null>(null);
  const [settleFor, setSettleFor] = useState<LoanSummary | null>(null);

  const summaries = useMemo(() => (loans && txns ? loanSummaries(loans, txns) : []), [loans, txns]);

  if (!loans || !txns || !accounts || !categories || !paymentMethods) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const lent = summaries.filter((s) => s.loan.direction === "lent" && s.loan.status !== "settled");
  const borrowed = summaries.filter((s) => s.loan.direction === "borrowed" && s.loan.status !== "settled");
  const settled = summaries.filter((s) => s.loan.status === "settled");
  const totalOut = lent.reduce((s, x) => s + x.outstanding, 0);
  const totalOwe = borrowed.reduce((s, x) => s + x.outstanding, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted">Money you've lent and borrowed</p>
        </div>
        <Btn size="sm" onClick={() => setLoanModal("new")}><Plus size={14} /> New person</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Owed to you</p>
          <p className="tnum mt-1 text-lg font-bold text-good">{formatINR(totalOut)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">You owe</p>
          <p className={cn("tnum mt-1 text-lg font-bold", totalOwe > 0 ? "text-warn" : "text-ink")}>{formatINR(totalOwe)}</p>
        </div>
      </div>

      {summaries.length === 0 ? (
        <Empty
          title="No lending tracked"
          sub="Add people you've lent to or borrowed from, then record lend/repayment transactions. Watch recovery rates and aging."
          action={<Btn onClick={() => setLoanModal("new")}><HandCoins size={14} /> Add your first entry</Btn>}
        />
      ) : (
        <>
          {[
            { title: "You lent", sub: "People who owe you", list: lent, empty: "Nothing outstanding" },
            { title: "You borrowed", sub: "People you owe", list: borrowed, empty: "You owe nothing 🎉" },
          ].map((section) => (
            <Card key={section.title}>
              <CardTitle title={section.title} sub={section.sub} />
              {section.list.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">{section.empty}</p>
              ) : (
                <div className="space-y-3">
                  {section.list.map((s) => (
                    <LoanRow
                      key={s.loan.id}
                      s={s}
                      onRepay={() => setRepayFor(s.loan)}
                      onEdit={() => setLoanModal(s.loan)}
                      onHistory={() => setHistoryFor(s.loan)}
                      onSettle={() => setSettleFor(s)}
                      onDelete={() => setDelLoan(s.loan)}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}

          {settled.length > 0 && (
            <Card>
              <CardTitle title="Settled" sub="Fully repaid / forgiven" />
              <ul className="divide-y divide-border">
                {settled.map((s) => (
                  <li key={s.loan.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted line-through">{s.loan.personName}</span>
                    <span className="flex items-center gap-2">
                      <span className="tnum text-xs text-muted">{formatINR(s.amount)}</span>
                      <button title="Re-open" onClick={() => updateLoan(s.loan.id, { status: "open" })} className="p-1 text-muted hover:text-ink">
                        <RotateCcw size={12} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <LoanModal open={loanModal !== null} initial={loanModal === "new" ? null : loanModal} accounts={accounts ?? []} onClose={() => setLoanModal(null)} />
      <SettleModal s={settleFor} accounts={accounts ?? []} onClose={() => setSettleFor(null)} />

      {/* repayment modal */}
      <Modal
        open={!!repayFor}
        onClose={() => setRepayFor(null)}
        title={repayFor?.direction === "lent" ? `Repayment from ${repayFor.personName}` : `Repay ${repayFor?.personName}`}
        wide
      >
        {repayFor && (
          <TxnForm
            accounts={accounts}
            categories={categories}
            paymentMethods={paymentMethods}
            loans={loans}
            fixedType={repayFor.direction === "lent" ? "lend_repayment" : "borrow_repayment"}
            fixedLoanId={repayFor.id}
            submitLabel="Record repayment"
            initial={{ description: repayFor.direction === "lent" ? `Repayment from ${repayFor.personName}` : `Repaid ${repayFor.personName}` }}
            onSubmit={async (values) => {
              await addTxn(values);
              const s = summaries.find((x) => x.loan.id === repayFor.id);
              if (s && values.amount >= s.outstanding) {
                await updateLoan(repayFor.id, { status: "settled" });
              }
              setRepayFor(null);
            }}
            onCancel={() => setRepayFor(null)}
          />
        )}
      </Modal>

      {/* delete confirm */}
      <Modal open={!!delLoan} onClose={() => setDelLoan(null)} title="Delete person?">
        {delLoan && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Delete <b className="text-ink">{delLoan.personName}</b>? Linked transactions are kept but detached from this record.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelLoan(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await deleteLoan(delLoan.id); setDelLoan(null); }}>
                Delete
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* history modal */}
      <Modal open={!!historyFor} onClose={() => setHistoryFor(null)} title={`History — ${historyFor?.personName}`} wide>
        {historyFor && (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {loanTransactions(txns, historyFor.id)
              .sort((a, b) => +parseISO(b.date) - +parseISO(a.date))
              .map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-ink">{t.description}</p>
                    <p className="text-[11px] text-muted">{fmtDay(t.date)} · {t.type.replace("_", " ")}</p>
                  </div>
                  <span className={cn("tnum font-semibold", ["lend", "borrow_repayment"].includes(t.type) ? "text-danger" : "text-good")}>
                    {["lend", "borrow_repayment"].includes(t.type) ? "−" : "+"}{formatINR(t.amount)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function LoanRow({
  s, onRepay, onEdit, onHistory, onSettle, onDelete,
}: {
  s: ReturnType<typeof loanSummaries>[number];
  onRepay: () => void; onEdit: () => void; onHistory: () => void; onSettle: () => void; onDelete: () => void;
}) {
  const age = differenceInDays(new Date(), parseISO(s.loan.createdAt));
  // principal is derived from linked transactions (loan rows store amount: 0)
  const paidPct = s.amount > 0 ? (s.paid / s.amount) * 100 : 0;
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="truncate" title={s.loan.personName}>{s.loan.personName}</span>
           
            {s.loan.status === "partial" && <Badge tone="accent">partially repaid</Badge>}
            {s.loan.direction === "lent" && age > 45 && s.outstanding > 0 && <Badge tone="warn">{age}d old</Badge>}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted" title={`${s.loan.direction === "lent" ? "Lent" : "Borrowed"} ${formatINR(s.amount)}${s.loan.dueDate ? ` · due ${fmtDay(s.loan.dueDate)}` : ""}${s.loan.notes ? ` · ${s.loan.notes}` : ""}`}>
            {s.loan.direction === "lent" ? "Lent" : "Borrowed"} {formatINR(s.amount)}
            {s.loan.dueDate ? ` · due ${fmtDay(s.loan.dueDate)}` : ""}
            {s.loan.notes ? ` · ${s.loan.notes}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-sm font-bold text-ink">{formatINR(s.outstanding)} <span className="text-[10px] font-normal text-muted">outstanding</span></p>
          <p className="text-[11px] text-muted">{s.recoveryRate.toFixed(0)}% {s.loan.direction === "lent" ? "recovered" : "repaid"}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cardhover">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, paidPct)}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Btn size="sm" variant="outline" onClick={onRepay}>
          {s.loan.direction === "lent" ? "Record repayment" : "Repay"}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onHistory}>History</Btn>
        <Btn size="sm" variant="ghost" onClick={onEdit}><Pencil size={12} /></Btn>
        {s.outstanding > 0 && <Btn size="sm" variant="ghost" onClick={onSettle}><CheckCircle2 size={12} /> Mark settled</Btn>}
        <Btn size="sm" variant="ghost" onClick={onDelete}><Trash2 size={12} /></Btn>
      </div>
    </div>
  );
}

function LoanModal({ open, initial, accounts, onClose }: { open: boolean; initial: Loan | null; accounts: Account[]; onClose: () => void }) {
  const defaultAccount = () => accounts.find((a) => a.isActive && a.type === "bank")?.id ?? accounts.find((a) => a.isActive)?.id ?? "";
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(defaultAccount);
  const [date, setDate] = useState(todayDateInput());
  const [name, setName] = useState(initial?.personName ?? "");
  const [direction, setDirection] = useState<"lent" | "borrowed">(initial?.direction ?? "lent");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setName(initial?.personName ?? "");
    setDirection(initial?.direction ?? "lent");
    setDueDate(initial?.dueDate ?? "");
    setNotes(initial?.notes ?? "");
    setAmount("");
    setAccountId(defaultAccount());
    setDate(todayDateInput());
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Person's name is required.");
    if (initial) {
      await updateLoan(initial.id, { personName: name.trim(), direction, dueDate: dueDate || undefined, notes: notes || undefined });
      return onClose();
    }
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter how much you " + (direction === "lent" ? "lent" : "borrowed") + ".");
    if (!accountId) return setError("Choose the account the money " + (direction === "lent" ? "came from" : "went into") + ".");
    // create the person AND record the money movement, so the account balance and "Owed" are right
    const loan = await addLoan({ personName: name.trim(), direction, amount: 0, dueDate: dueDate || undefined, notes: notes || undefined, status: "open" });
    await addTxn({
      type: direction === "lent" ? "lend" : "borrow",
      amount: amt,
      date: (date === todayDateInput() ? new Date() : new Date(`${date}T12:00:00`)).toISOString(),
      description: direction === "lent" ? `Lent to ${name.trim()}` : `Borrowed from ${name.trim()}`,
      accountId,
      loanId: loan.id,
      notes: notes || undefined,
      tags: [],
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit person" : "Add person"}>
      <div className="space-y-3">
        <Field label="Person's name"><Input placeholder="e.g. Rahul" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "lent" | "borrowed")}>
            <option value="lent">I lent them money</option>
            <option value="borrowed">I borrowed from them</option>
          </Select>
        </Field>
        {!initial && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={direction === "lent" ? "How much you lent (₹)" : "How much you borrowed (₹)"}>
                <Input inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="On">
                <Input type="date" value={date} max={todayDateInput()} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label={direction === "lent" ? "Paid from" : "Received into"}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select account…</option>
                {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </>
        )}
        <Field label="Due date (optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add person"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Mark settled": either record the money that came back (so the account
 * balance is right) or close the loan and forgive / write off the rest.
 */
function SettleModal({ s, accounts, onClose }: { s: LoanSummary | null; accounts: Account[]; onClose: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  if ((s?.loan.id ?? null) !== key) {
    setKey(s?.loan.id ?? null);
    setAccountId(accounts.find((a) => a.isActive && a.type === "bank")?.id ?? accounts.find((a) => a.isActive)?.id ?? "");
  }
  if (!s) return null;
  const lent = s.loan.direction === "lent";
  const who = s.loan.personName;

  async function settle(withMoney: boolean) {
    if (!s) return;
    setBusy(true);
    try {
      if (withMoney) {
        if (!accountId) return;
        await addTxn({
          type: lent ? "lend_repayment" : "borrow_repayment",
          amount: s.outstanding,
          date: new Date().toISOString(),
          description: lent ? `Repayment from ${who}` : `Repaid ${who}`,
          accountId,
          loanId: s.loan.id,
          tags: [],
        });
      }
      await updateLoan(s.loan.id, { status: "settled" });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Settle with ${who}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {formatINR(s.outstanding)} is still {lent ? `owed to you by ${who}` : `owed by you to ${who}`}. What happened?
        </p>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium text-ink">{lent ? `${who} paid back the rest` : `I paid ${who} back`}</p>
          <Field label={lent ? "Money went into" : "Paid from"}>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {accounts.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Btn className="w-full" disabled={busy || !accountId} onClick={() => settle(true)}>
            <CheckCircle2 size={14} /> Record {formatINR(s.outstanding)} {lent ? "received" : "paid"} and settle
          </Btn>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => settle(false)}
          className="w-full rounded-xl px-3 py-2 text-xs text-muted hover:bg-cardhover hover:text-ink"
        >
          {lent ? "They won't pay the rest — forgive it and close" : "They forgave the rest — just close it"}
        </button>
      </div>
    </Modal>
  );
}
