"use client";

import { useMemo, useState } from "react";
import { useAccounts, useBalances, usePaymentMethods, useTxns } from "@/lib/hooks";
import { formatINR, toPaise } from "@/lib/money";
import { ccOutstanding, computeBalances } from "@/lib/finance";
import { addAccount, addPaymentMethod, updateAccount, updatePaymentMethod } from "@/lib/db";
import { Badge, Btn, Card, CardTitle, Empty, Field, Input, Modal, Select } from "@/components/ui";
import { ACCOUNT_TYPE_LABEL, PAYMENT_TYPE_LABEL, uid } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Account, AccountType, PaymentMethod, PaymentMethodType } from "@/lib/types";
import { Banknote, CreditCard, Landmark, Pencil, PiggyBank, Plus, Smartphone, Wallet } from "lucide-react";

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
          <h1 className="text-2xl font-bold tracking-tight">Accounts & Cards</h1>
          <p className="text-sm text-muted">Where your money actually lives</p>
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
                {a.isDemo && <span className="absolute right-3 top-3"><Badge tone="warn">demo</Badge></span>}
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
                <div className="mt-3 flex gap-2">
                  <Btn size="sm" variant="outline" onClick={() => setAcctModal(a)}><Pencil size={12} /> Edit</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setArchiveAcct(a)}>Archive</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* payment methods */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Payment Methods</h2>
          <p className="text-xs text-muted">UPI apps & payment rails — these never hold balances, only linked accounts move</p>
        </div>
        <Btn size="sm" variant="outline" onClick={() => setPmModal("new")}><Plus size={14} /> Add method</Btn>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {activePMs.map((p) => (
          <Card key={p.id} className="!p-4">
            <div className="flex items-center gap-2">
              <Smartphone size={15} className="text-muted" />
              <p className="min-w-0 truncate text-sm font-semibold text-ink" title={p.name}>{p.name}</p>
              {p.isDemo && <Badge tone="warn">demo</Badge>}
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
              Archive <b className="text-ink">{archiveAcct.name}</b>? It will be hidden everywhere, but its
              transactions and history are kept. You can re-enable it later by editing.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setArchiveAcct(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await updateAccount(archiveAcct.id, { isActive: false }); setArchiveAcct(null); }}>
                Archive
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* remove payment method confirm */}
      <Modal open={!!removePm} onClose={() => setRemovePm(null)} title="Remove payment method?">
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
    <Modal open={open} onClose={onClose} title={initial ? "Edit payment method" : "Add payment method"}>
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
          <Btn onClick={save}>{initial ? "Save" : "Add method"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
