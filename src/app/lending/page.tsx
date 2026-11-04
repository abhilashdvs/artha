"use client";

import { useMemo, useState } from "react";
import { useAccounts, useCategories, useLoans, usePaymentMethods, useTxns } from "@/lib/hooks";
import { addLoan, addTxn, deleteLoan, updateLoan } from "@/lib/db";
import { loanSummaries, loanTransactions } from "@/lib/finance";
import { formatINR } from "@/lib/money";
import { fmtDay } from "@/lib/dates";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { TxnForm } from "@/components/TxnForm";
import { cn } from "@/lib/utils";
import type { Loan } from "@/lib/types";
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
          <h1 className="text-2xl font-bold tracking-tight">Lending & Borrowing</h1>
          <p className="text-sm text-muted">Lent money is an asset — never counted as spending. Borrowed is a liability — never income.</p>
        </div>
        <Btn size="sm" onClick={() => setLoanModal("new")}><Plus size={14} /> New person</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">You're owed</p>
          <p className="tnum mt-1 text-lg font-bold text-good">{formatINR(totalOut)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">You owe</p>
          <p className={cn("tnum mt-1 text-lg font-bold", totalOwe > 0 ? "text-warn" : "text-ink")}>{formatINR(totalOwe)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Net position</p>
          <p className={cn("tnum mt-1 text-lg font-bold", totalOut - totalOwe >= 0 ? "text-good" : "text-danger")}>
            {formatINR(totalOut - totalOwe)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted">Recovery rate (lent)</p>
          <p className="tnum mt-1 truncate text-lg font-bold" title={lent.length > 0 ? "weighted by principal" : undefined}>
            {(() => {
              const paid = lent.reduce((s, x) => s + x.paid, 0);
              const base = lent.reduce((s, x) => s + x.paid + x.outstanding, 0);
              return base > 0 ? `${((paid / base) * 100).toFixed(0)}%` : "—";
            })()}
          </p>
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
            { title: "Money You've Lent", sub: "Receivable assets", list: lent, empty: "Nothing outstanding" },
            { title: "Money You've Borrowed", sub: "Liabilities to repay", list: borrowed, empty: "You owe nothing 🎉" },
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
                      onSettle={() => updateLoan(s.loan.id, { status: "settled" })}
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

      <LoanModal open={loanModal !== null} initial={loanModal === "new" ? null : loanModal} onClose={() => setLoanModal(null)} />

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
            {s.loan.isDemo && <Badge tone="warn">demo</Badge>}
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

function LoanModal({ open, initial, onClose }: { open: boolean; initial: Loan | null; onClose: () => void }) {
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
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Person's name is required.");
    if (initial) {
      await updateLoan(initial.id, { personName: name.trim(), direction, dueDate: dueDate || undefined, notes: notes || undefined });
    } else {
      await addLoan({ personName: name.trim(), direction, amount: 0, dueDate: dueDate || undefined, notes: notes || undefined, status: "open" });
    }
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
        <Field label="Due date (optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {!initial && (
          <p className="rounded-xl bg-accent/5 px-3 py-2 text-[11px] text-muted">
            After adding the person, use Quick Add (+ button) → type "Lend Money" / "Borrow Money" to record the amount.
          </p>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add person"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
