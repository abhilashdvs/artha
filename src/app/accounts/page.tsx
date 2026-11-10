"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccounts, useBalances, usePaymentMethods, useTxns } from "@/lib/hooks";
import { formatINR, toPaise } from "@/lib/money";
import { ccOutstanding, computeBalances } from "@/lib/finance";
import { addAccount, addPaymentMethod, addTxn, updateAccount, updatePaymentMethod } from "@/lib/db";
import { todayDateInput } from "@/lib/dates";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select } from "@/components/ui";
import { ACCOUNT_TYPE_LABEL, PAYMENT_TYPE_LABEL, uid } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Account, AccountType, PaymentMethod, PaymentMethodType } from "@/lib/types";
import { Banknote, Check, CreditCard, Landmark, Pencil, PiggyBank, Plus, Smartphone, Wallet } from "lucide-react";

const ACCT_ICON: Record<AccountType, typeof Landmark> = {
  bank: Landmark, credit_card: CreditCard, cash: Banknote, wallet: Wallet, investment: PiggyBank,
};

export default function AccountsPage() {
  const accounts = useAccounts();
  const txns = useTxns();
  const paymentMethods = usePaymentMethods();
  const balances = useBalances(accounts, txns);
  const [acctModal, setAcctModal] = useState<Account | "new" | null>(null);
  const [pmModal, setPmModal] = useState<PaymentMethod | "new" | null>(null);
  const [archiveAcct, setArchiveAcct] = useState<Account | null>(null);
  const [removePm, setRemovePm] = useState<PaymentMethod | null>(null);
  const [payCard, setPayCard] = useState<{ card: Account; outstanding: number } | null>(null);

  // the Get started guide links here with ?new=account or ?new=app to open the right form
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("new");
    if (want === "account") setAcctModal("new");
    if (want === "app") setPmModal("new");
  }, []);

  const derived = useMemo(() => {
    if (!accounts || !balances) return null;
    const active = accounts.filter((a) => a.isActive);
    const balOf = (a: Account) => balances.get(a.id) ?? a.openingBalance;
    const bankCash = active.filter((a) => a.type === "bank" || a.type === "cash" || a.type === "wallet").reduce((s, a) => s + balOf(a), 0);
    const ccOut = active.filter((a) => a.type === "credit_card").reduce((s, a) => s + ccOutstanding(balOf(a)), 0);
    const cashTotal = active.filter((a) => a.type === "cash").reduce((s, a) => s + balOf(a), 0);
    return { bankCash, ccOut, cashTotal };
  }, [accounts, balances]);

  if (!accounts || !txns || !balances || !paymentMethods || !derived) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const activeAccounts = accounts.filter((a) => a.isActive);
  const activePMs = paymentMethods.filter((p) => p.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts &amp; cards</h1>
          <p className="text-sm text-muted">Your bank accounts, cash and cards</p>
        </div>
        <Btn size="sm" onClick={() => setAcctModal("new")}><Plus size={14} /> Add account</Btn>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] text-muted sm:text-xs">Bank + Cash + Wallets</p>
          <p className={cn("tnum mt-1 truncate text-base font-bold sm:text-lg", derived.bankCash >= 0 ? "text-ink" : "text-danger")} title={formatINR(derived.bankCash)}>{formatINR(derived.bankCash)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] text-muted sm:text-xs">Cash in hand</p>
          <p className="tnum mt-1 truncate text-base font-bold text-ink sm:text-lg" title={formatINR(derived.cashTotal)}>{formatINR(derived.cashTotal)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[11px] text-muted sm:text-xs">Credit card outstanding</p>
          <p className={cn("tnum mt-1 truncate text-base font-bold sm:text-lg", derived.ccOut > 0 ? "text-danger" : "text-good")} title={formatINR(derived.ccOut)}>{formatINR(derived.ccOut)}</p>
        </div>
      </div>

      {/* accounts grid */}
      {activeAccounts.length === 0 ? (
        <Empty
          title="No accounts yet"
          sub="Add your bank accounts, credit cards, cash and wallets. Balances update automatically from transactions."
          action={<Btn onClick={() => setAcctModal("new")}><Plus size={14} /> Add your first account</Btn>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activeAccounts.map((a) => {
            const bal = balances.get(a.id) ?? a.openingBalance;
            const outstanding = a.type === "credit_card" ? ccOutstanding(bal) : 0;
            const Icon = ACCT_ICON[a.type];
            return (
              <Card key={a.id} className="relative">
                
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink" title={a.name}>{a.name}</p>
                    <p className="text-[11px] text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                  </div>
                </div>
                <p className={cn("tnum mt-3 text-xl font-bold", a.type === "credit_card" ? (outstanding > 0 ? "text-danger" : "text-good") : bal < 0 ? "text-danger" : "text-ink")}>
                  {a.type === "credit_card" ? formatINR(outstanding) : formatINR(bal)}
                </p>
                {a.type === "credit_card" && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    outstanding{a.creditLimit ? ` · limit ${formatINR(a.creditLimit)}` : ""}
                    {a.billingDay ? ` · bills on ${a.billingDay}th` : ""}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.type === "credit_card" && outstanding > 0 && (
                    <Btn size="sm" onClick={() => setPayCard({ card: a, outstanding })}><Check size={12} /> Pay bill</Btn>
                  )}
                  <Btn size="sm" variant="outline" onClick={() => setAcctModal(a)}><Pencil size={12} /> Edit</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setArchiveAcct(a)}>Archive</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* archived accounts — visible and restorable */}
      {accounts.some((a) => !a.isActive) && (
        <details className="rounded-2xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            Archived accounts ({accounts.filter((a) => !a.isActive).length})
          </summary>
          <ul className="mt-2 divide-y divide-border">
            {accounts.filter((a) => !a.isActive).map((a) => {
              const bal = balances.get(a.id) ?? a.openingBalance;
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{a.name}</span>
                    <span className="block text-[11px] text-muted">
                      {a.type === "credit_card" ? `${formatINR(ccOutstanding(bal))} outstanding` : `${formatINR(bal)} balance`} · not counted in totals
                    </span>
                  </span>
                  <Btn size="sm" variant="outline" onClick={() => updateAccount(a.id, { isActive: true })}>Restore</Btn>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* payment methods */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Apps &amp; cards</h2>
          <p className="text-xs text-muted">The ways you pay — GPay, PhonePe, cards. Money always comes from the bank account each one is linked to.</p>
        </div>
        <Btn size="sm" variant="outline" onClick={() => setPmModal("new")}><Plus size={14} /> Add app or card</Btn>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {activePMs.map((p) => (
          <Card key={p.id} className="!p-4">
            <div className="flex items-center gap-2">
              <Smartphone size={15} className="text-muted" />
              <p className="min-w-0 truncate text-sm font-semibold text-ink" title={p.name}>{p.name}</p>
             
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {PAYMENT_TYPE_LABEL[p.type]}
              {p.linkedAccountId ? ` → ${accounts.find((a) => a.id === p.linkedAccountId)?.name ?? "?"}` : ""}
            </p>
            <div className="mt-2.5 flex gap-2">
              <Btn size="sm" variant="ghost" onClick={() => setPmModal(p)} aria-label={`Edit ${p.name}`}><Pencil size={12} /></Btn>
              <Btn size="sm" variant="ghost" onClick={() => setRemovePm(p)}>Remove</Btn>
            </div>
          </Card>
        ))}
      </div>

      <AccountModal
        open={acctModal !== null}
        initial={acctModal === "new" ? null : acctModal}
        onClose={() => setAcctModal(null)}
      />
      <PaymentMethodModal
        open={pmModal !== null}
        initial={pmModal === "new" ? null : pmModal}
        accounts={accounts}
        onClose={() => setPmModal(null)}
      />

      {/* archive confirm */}
      <Modal open={!!archiveAcct} onClose={() => setArchiveAcct(null)} title="Archive account?">
        {archiveAcct && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Archive <b className="text-ink">{archiveAcct.name}</b>? It will be hidden and left out of your totals.
              Its transactions and history are kept, and you can restore it any time from "Archived accounts".
            </p>
            {(() => {
              const bal = balances.get(archiveAcct.id) ?? archiveAcct.openingBalance;
              const left = archiveAcct.type === "credit_card" ? ccOutstanding(bal) : bal;
              return left !== 0 ? (
                <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
                  It still has {formatINR(Math.abs(left))} {archiveAcct.type === "credit_card" ? "outstanding" : "in it"} — that amount will
                  disappear from your totals. Move the money (or pay the card) first if it's still in use.
                </p>
              ) : null;
            })()}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setArchiveAcct(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await updateAccount(archiveAcct.id, { isActive: false }); setArchiveAcct(null); }}>
                Archive
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <PayBillModal p={payCard} accounts={activeAccounts} onClose={() => setPayCard(null)} />

      {/* remove payment method confirm */}
      <Modal open={!!removePm} onClose={() => setRemovePm(null)} title="Remove this app or card?">
        {removePm && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Remove <b className="text-ink">{removePm.name}</b>? Past transactions recorded via this method are kept.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setRemovePm(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await updatePaymentMethod(removePm.id, { isActive: false }); setRemovePm(null); }}>
                Remove
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── modals ────────────────────────────────────────────────────

function AccountModal({ open, initial, onClose }: { open: boolean; initial: Account | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "bank");
  const [balance, setBalance] = useState(initial ? String(initial.openingBalance / 100) : "");
  const [limit, setLimit] = useState(initial?.creditLimit ? String(initial.creditLimit / 100) : "");
  const [billingDay, setBillingDay] = useState(initial?.billingDay ? String(initial.billingDay) : "");
  const [error, setError] = useState<string | null>(null);

  // re-init when a different account is opened
  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setName(initial?.name ?? "");
    setType(initial?.type ?? "bank");
    setBalance(initial ? String(initial.openingBalance / 100) : "");
    setLimit(initial?.creditLimit ? String(initial.creditLimit / 100) : "");
    setBillingDay(initial?.billingDay ? String(initial.billingDay) : "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    if (type === "credit_card" && billingDay) {
      const day = Number(billingDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) return setError("Billing day must be a whole number between 1 and 31.");
    }
    const openingBalance = toPaise(balance || "0");
    if (initial) {
      await updateAccount(initial.id, {
        name: name.trim(), type,
        openingBalance,
        creditLimit: type === "credit_card" && limit ? toPaise(limit) : undefined,
        billingDay: type === "credit_card" && billingDay ? Number(billingDay) : undefined,
      });
    } else {
      await addAccount({
        name: name.trim(), type, openingBalance,
        creditLimit: type === "credit_card" && limit ? toPaise(limit) : undefined,
        billingDay: type === "credit_card" && billingDay ? Number(billingDay) : undefined,
        isActive: true,
      });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit account" : "Add account"}>
      <div className="space-y-3">
        <Field label="Name">
          <Input placeholder="e.g. HDFC Savings, Amex Platinum, Wallet" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field
          label={initial ? "Opening balance (₹)" : "Current balance (₹)"}
          hint={type === "credit_card" ? "Use negative if you currently owe money, e.g. -5000" : undefined}
        >
          <Input inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        {type === "credit_card" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Credit limit (₹)">
              <Input inputMode="decimal" placeholder="100000" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
            <Field label="Billing day of month">
              <Input inputMode="numeric" placeholder="15" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
            </Field>
          </div>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add account"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PaymentMethodModal({
  open, initial, accounts, onClose,
}: { open: boolean; initial: PaymentMethod | null; accounts: Account[]; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<PaymentMethodType>(initial?.type ?? "upi");
  const [linked, setLinked] = useState(initial?.linkedAccountId ?? "");
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(initial?.id ?? "new");
  if ((initial?.id ?? "new") !== key) {
    setKey(initial?.id ?? "new");
    setName(initial?.name ?? "");
    setType(initial?.type ?? "upi");
    setLinked(initial?.linkedAccountId ?? "");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    if (initial) {
      await updatePaymentMethod(initial.id, { name: name.trim(), type, linkedAccountId: linked || undefined });
    } else {
      await addPaymentMethod({ name: name.trim(), type, linkedAccountId: linked || undefined, isActive: true });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit app or card" : "Add an app or card"}>
      <div className="space-y-3">
        <Field label="Name"><Input placeholder="e.g. GPay, PhonePe, Cred" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)}>
            {Object.entries(PAYMENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Linked account" hint="Payments via this method debit/credit this account.">
          <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="">None</option>
            {accounts.filter((a) => a.isActive).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial ? "Save" : "Add"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Pay a credit card bill: moves money from a bank account to the card.
 * Not counted as spending — the purchases on the card already were.
 */
function PayBillModal({ p, accounts, onClose }: { p: { card: Account; outstanding: number } | null; accounts: Account[]; onClose: () => void }) {
  const banks = accounts.filter((a) => a.type !== "credit_card");
  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState("");
  const [date, setDate] = useState(todayDateInput());
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  if ((p?.card.id ?? null) !== key) {
    setKey(p?.card.id ?? null);
    if (p) {
      setAmount(String(p.outstanding / 100));
      setFromId(banks.find((a) => a.type === "bank")?.id ?? banks[0]?.id ?? "");
      setDate(todayDateInput());
      setError(null);
    }
  }
  if (!p) return null;

  async function pay() {
    if (!p) return;
    const amt = toPaise(amount);
    if (amt <= 0) return setError("Enter the amount you paid.");
    if (!fromId) return setError("Choose the account you paid from.");
    await addTxn({
      type: "cc_payment",
      amount: amt,
      date: (date === todayDateInput() ? new Date() : new Date(`${date}T12:00:00`)).toISOString(),
      description: `${p.card.name} bill`,
      accountId: fromId,
      toAccountId: p.card.id,
      tags: [],
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Pay ${p.card.name} bill`}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Outstanding: <b className="text-ink">{formatINR(p.outstanding)}</b>. Paying the bill isn't counted as spending — your card purchases already were.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Paid on"><Input type="date" value={date} max={todayDateInput()} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Paid from">
          <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">Select account…</option>
            {banks.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">Cancel</Btn>
          <Btn onClick={pay} className="flex-1 py-2.5 sm:ml-auto sm:flex-none"><Check size={15} /> Pay {formatINR(toPaise(amount) || 0)}</Btn>
        </div>
      </div>
    </Modal>
  );
}
