"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Account, Category, Goal, Loan, PaymentMethod, Txn, TxnType } from "@/lib/types";
import { toPaise } from "@/lib/money";
import { todayDateInput } from "@/lib/dates";
import { Btn, Field, Input, Select, Textarea } from "./ui";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryPicker } from "./CategoryPicker";

// ─────────────────────────────────────────────────────────────
// Shared transaction editor. Used by QuickAdd, Transactions page
// and Lending page (repayments).
// ─────────────────────────────────────────────────────────────

export const TXN_TYPE_META: Record<TxnType, { label: string; help?: string }> = {
  expense: { label: "Spent" },
  income: { label: "Received" },
  transfer: { label: "Moved", help: "Between your own accounts — not counted as spending or income." },
  cc_payment: { label: "Paid card bill", help: "Not spending — the purchases on the card were already counted." },
  lend: { label: "Lent to someone", help: "They owe you this — it isn't counted as spending." },
  lend_repayment: { label: "Got money back", help: "Someone paid back what you lent — not counted as income." },
  borrow: { label: "Borrowed", help: "You owe this — it isn't counted as income." },
  borrow_repayment: { label: "Paid back a loan", help: "Reduces what you owe — not counted as spending." },
  refund: { label: "Refund", help: "Takes the amount off the original category's spending." },
  investment: { label: "Saved / invested", help: "Kept separate from spending." },
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
  const [accountId, setAccountId] = useState(
    initial?.accountId ??
      (accounts.find((a) => a.isActive && a.type === "bank") ?? accounts.find((a) => a.isActive))?.id ??
      ""
  );
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? "");
  const [loanId, setLoanId] = useState(fixedLoanId ?? initial?.loanId ?? "");
  const [goalId, setGoalId] = useState(initial?.goalId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tagsStr, setTagsStr] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const [showMoreTypes, setShowMoreTypes] = useState(false);
  // optional fields stay folded away unless the transaction already uses them
  const [showDetails, setShowDetails] = useState(
    Boolean(initial?.merchant || initial?.notes || initial?.tags?.length || initial?.paymentMethodId)
  );
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
  // when the user changes the type (not on first open — editing must keep its values)
  const prevType = useRef(type);
  useEffect(() => {
    if (prevType.current === type) return;
    prevType.current = type;
    setToAccountId("");
    // a spending category doesn't apply to income (and vice versa)
    setCategoryId((c) => (c && !categories.some((x) => x.id === c && x.kind === (type === "income" ? "income" : "expense")) ? "" : c));
  }, [type, categories]);

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
    if (amount > 100_000_000_00) return setError("That amount looks too big — check for an extra zero.");
    if (!accountId) return setError("Choose an account.");
    if (needsTo && !toAccountId) return setError("Choose the destination account.");
    if (needsTo && accountId === toAccountId) return setError("Source and destination accounts must be different.");
    if (!date) return setError("Pick a date & time.");
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return setError("Pick a valid date & time.");
    if (needsLoan && !loanId) return setError("Link this to a person/loan. Create one on the Lending page first.");
    // no description? use the category (or merchant / type) so saving is quick
    const label =
      description.trim() ||
      (needsCategory && categoryId ? categories.find((c) => c.id === categoryId)?.name : undefined) ||
      merchant.trim() ||
      TXN_TYPE_META[type].label;
    // a fast double tap must not save the same transaction twice
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await onSubmit({
        type,
        amount,
        date: parsedDate.toISOString(),
        description: label,
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
      saving.current = false;
      setBusy(false);
    }
  }

  const meta = TXN_TYPE_META[type];
  const mainTypes: TxnType[] = ["expense", "income", "transfer"];
  const isOtherType = !mainTypes.includes(type);

  return (
    <form onSubmit={submit} className="space-y-4">
      {!fixedType && (
        <div>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-cardhover p-1">
            {mainTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors",
                  type === t ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
                )}
              >
                {TXN_TYPE_META[t].label}
              </button>
            ))}
            <button
              type="button"
              aria-expanded={showMoreTypes}
              onClick={() => setShowMoreTypes((v) => !v)}
              className={cn(
                "flex items-center justify-center gap-0.5 rounded-lg py-2 text-sm font-medium transition-colors",
                isOtherType ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
              )}
            >
              More <ChevronDown size={13} className={cn("transition-transform", showMoreTypes && "rotate-180")} />
            </button>
          </div>
          {(showMoreTypes || isOtherType) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(TXN_TYPE_META) as TxnType[]).filter((t) => !mainTypes.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors active:scale-95",
                    type === t ? "border-accent bg-accent text-white" : "border-border bg-card text-ink hover:bg-cardhover"
                  )}
                >
                  {TXN_TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}
          {meta.help && <p className="mt-1.5 text-[11px] text-muted">{isOtherType && <b className="text-ink">{meta.label}: </b>}{meta.help}</p>}
        </div>
      )}

      <div className="flex items-baseline gap-2 border-b border-border pb-2">
        <span className="text-2xl font-semibold text-muted">₹</span>
        <input
          inputMode="decimal"
          placeholder="0"
          aria-label="Amount"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          autoFocus
          className="tnum w-full bg-transparent text-3xl font-bold text-ink placeholder:text-faint focus:outline-none"
        />
      </div>

      <Field label="What was it for? (optional)">
        <Input placeholder={type === "income" ? "e.g. Salary" : "e.g. Dinner at Truffles"} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {needsCategory && (
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Category</span>
          <CategoryPicker key={type === "income" ? "income" : "expense"} categories={shownCats} value={categoryId} onChange={setCategoryId} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={type === "income" || type === "lend_repayment" || type === "borrow" || type === "refund" ? "Received into" : "Paid from"}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {fromAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        {needsTo && (
          <Field label={type === "cc_payment" ? "Credit card" : "To account"}>
            <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Select…</option>
              {toAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {needsLoan && !fixedLoanId && (
          <Field label="Person">
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
          <Field label="Towards goal (optional)">
            <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {!showDetails ? (
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          <ChevronDown size={14} /> Add date, merchant, notes…
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date & time">
              <Input type="datetime-local" required value={date} max={`${todayDateInput()}T23:59`} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {needsCategory && (
              <Field label="Merchant / source">
                <Input placeholder="e.g. Zomato" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </Field>
            )}
            {!needsTo && (
              <Field label="Paid using (optional)" hint="UPI app or card — the account balance is what moves.">
                <Select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                  <option value="">Not specified</option>
                  {paymentMethods.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Tags (optional)">
              <Input placeholder="work, trip, friends" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      )}

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        {onCancel && <Btn type="button" variant="ghost" onClick={onCancel} className="flex-1 sm:flex-none">Cancel</Btn>}
        <Btn type="submit" disabled={busy} className="flex-1 py-2.5 sm:ml-auto sm:flex-none">{busy ? "Saving…" : submitLabel}</Btn>
      </div>
    </form>
  );
}
