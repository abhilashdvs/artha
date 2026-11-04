"use client";

import { useEffect, useMemo, useState } from "react";
import type { Account, Category, Goal, Loan, PaymentMethod, Txn, TxnType } from "@/lib/types";
import { toPaise } from "@/lib/money";
import { todayDateInput } from "@/lib/dates";
import { Btn, Field, Input, Select, Textarea } from "./ui";
import { format, parseISO } from "date-fns";

// ─────────────────────────────────────────────────────────────
// Shared transaction editor. Used by QuickAdd, Transactions page
// and Lending page (repayments).
// ─────────────────────────────────────────────────────────────

export const TXN_TYPE_META: Record<TxnType, { label: string; help?: string }> = {
  expense: { label: "Expense" },
  income: { label: "Income" },
  transfer: { label: "Transfer (own accounts)", help: "Never counted as income or expense." },
  cc_payment: { label: "Credit Card Bill Payment", help: "Not an expense — card purchases already counted." },
  lend: { label: "Lend Money", help: "Becomes a receivable asset, not consumption." },
  lend_repayment: { label: "Loan Repayment Received", help: "Not income — reduces what you're owed." },
  borrow: { label: "Borrow Money", help: "A liability, not income." },
  borrow_repayment: { label: "Repay Borrowed Money", help: "Not an expense — reduces your debt." },
  refund: { label: "Refund", help: "Reduces the original expense category, not income." },
  investment: { label: "Investment / Savings", help: "Counted as savings deployed, not consumption." },
};

interface Props {
  accounts: Account[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  loans?: Loan[];
  goals?: Goal[];
  initial?: Partial<Txn>;
  fixedType?: TxnType;
  fixedLoanId?: string;
  submitLabel?: string;
  onSubmit: (values: Omit<Txn, "id" | "createdAt">) => Promise<void> | void;
  onCancel?: () => void;
}

export function TxnForm({
  accounts, categories, paymentMethods, loans = [], goals = [],
  initial, fixedType, fixedLoanId, submitLabel = "Save transaction", onSubmit, onCancel,
}: Props) {
  const [type, setType] = useState<TxnType>(fixedType ?? (initial?.type as TxnType) ?? "expense");
  const [amountStr, setAmountStr] = useState(initial?.amount ? String(initial.amount / 100) : "");
  const [date, setDate] = useState(initial?.date ? format(parseISO(initial.date), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? "");
  const [loanId, setLoanId] = useState(fixedLoanId ?? initial?.loanId ?? "");
  const [goalId, setGoalId] = useState(initial?.goalId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsStr, setTagsStr] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const fromAccounts = useMemo(
    () => activeAccounts.filter((a) => type !== "cc_payment" || a.type !== "credit_card"),
    [activeAccounts, type]
  );
  const toAccounts = useMemo(
    () =>
      activeAccounts.filter((a) => {
        if (a.id === accountId) return false;
        if (type === "cc_payment") return a.type === "credit_card";
        return true;
      }),
    [activeAccounts, accountId, type]
  );
  const expenseCats = categories.filter((c) => !c.isArchived && c.kind === "expense");
  const incomeCats = categories.filter((c) => !c.isArchived && c.kind === "income");
  const shownCats = type === "income" ? incomeCats : expenseCats;
  const needsCategory = ["expense", "income", "refund", "investment"].includes(type);
  const needsTo = ["transfer", "cc_payment"].includes(type);
  const needsLoan = ["lend", "lend_repayment", "borrow", "borrow_repayment"].includes(type);

  // auto-link payment method account
  useEffect(() => {
    if (!paymentMethodId) return;
    const pm = paymentMethods.find((p) => p.id === paymentMethodId);
    if (pm?.linkedAccountId && pm.linkedAccountId !== accountId) setAccountId(pm.linkedAccountId);
  }, [paymentMethodId, paymentMethods, accountId]);

  // reset destination whenever the type changes (valid options differ per type)
  useEffect(() => {
    setToAccountId("");
  }, [type]);

  // clear destination if it points at the source account or is invalid for the type
  useEffect(() => {
    if (!toAccountId) return;
    if (toAccountId === accountId) setToAccountId("");
    else if (type === "cc_payment") {
      const dest = accounts.find((a) => a.id === toAccountId);
      if (dest?.type !== "credit_card") setToAccountId("");
    }
  }, [accountId, toAccountId, type, accounts]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = toPaise(amountStr);
    if (amount <= 0) return setError("Enter an amount greater than zero.");
    if (!accountId) return setError("Choose an account.");
    if (needsTo && !toAccountId) return setError("Choose the destination account.");
    if (needsTo && accountId === toAccountId) return setError("Source and destination accounts must be different.");
    if (!date) return setError("Pick a date & time.");
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return setError("Pick a valid date & time.");
    if (needsLoan && !loanId) return setError("Link this to a person/loan. Create one on the Lending page first.");
    if (!description.trim()) return setError("Add a short description.");
    setBusy(true);
    try {
      await onSubmit({
        type,
        amount,
        date: parsedDate.toISOString(),
        description: description.trim(),
        merchant: merchant.trim() || undefined,
        categoryId: needsCategory && categoryId ? categoryId : undefined,
        accountId,
        toAccountId: needsTo ? toAccountId : undefined,
        paymentMethodId: paymentMethodId || undefined,
        loanId: needsLoan ? loanId : undefined,
        goalId: type === "investment" && goalId ? goalId : undefined,
        notes: notes.trim() || undefined,
        tags: tagsStr.split(",").map((t) => t.trim()).filter(Boolean),
      });
    } finally {
      setBusy(false);
    }
  }

  const meta = TXN_TYPE_META[type];

  return (
    <form onSubmit={submit} className="space-y-3">
      {!fixedType && (
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as TxnType)}>
            {Object.entries(TXN_TYPE_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
          {meta.help && <span className="mt-1 block text-[11px] text-faint">{meta.help}</span>}
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)">
          <Input inputMode="decimal" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} autoFocus />
        </Field>
        <Field label="Date & time">
          <Input type="datetime-local" required value={date} max={`${todayDateInput()}T23:59`} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Description">
        <Input placeholder="e.g. Dinner at Truffles" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={type === "income" || type === "lend_repayment" || type === "borrow" || type === "refund" ? "Received into" : "Paid from"}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {fromAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        {needsTo ? (
          <Field label={type === "cc_payment" ? "Credit card" : "To account"}>
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Select…</option>
              {toAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Payment method (optional)" hint="UPI apps are rails — the account balance is what moves.">
            <Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
              <option value="">None</option>
              {paymentMethods.filter((p) => p.isActive).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {needsCategory && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {shownCats.filter((c) => !c.parentId).map((c) => (
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name} (general)</option>
                  {shownCats.filter((s) => s.parentId === c.id).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Merchant / source">
            <Input placeholder="e.g. Zomato" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </Field>
        </div>
      )}

      {needsLoan && !fixedLoanId && (
        <Field label="Person / loan">
          <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
            <option value="">Select person…</option>
            {loans
              .filter((l) =>
                ["lend", "lend_repayment"].includes(type) ? l.direction === "lent" : l.direction === "borrowed"
              )
              .map((l) => (
                <option key={l.id} value={l.id}>{l.personName}</option>
              ))}
          </Select>
        </Field>
      )}

      {type === "investment" && goals.length > 0 && (
        <Field label="Link to goal (optional)">
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">No goal</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Tags (comma separated, optional)">
        <Input placeholder="work, trip, friends" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} />
      </Field>
      <Field label="Notes (optional)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Btn type="button" variant="ghost" onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</Btn>
      </div>
    </form>
  );
}
