"use client";

import { useEffect, useState } from "react";
import { Modal } from "./ui";
import { TxnForm } from "./TxnForm";
import { addTxn } from "@/lib/db";
import { useAccounts, useCategories, useGoals, useLoans, usePaymentMethods } from "@/lib/hooks";

// ─────────────────────────────────────────────────────────────
// Add-transaction sheet. Opened from the sidebar button, the
// mobile "+" tab, or by pressing "n" anywhere.
// ─────────────────────────────────────────────────────────────

const OPEN_EVENT = "artha:quick-add";

export function openQuickAdd() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const loans = useLoans();
  const goals = useGoals();

  useEffect(() => {
    const show = () => {
      setFormKey((k) => k + 1);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const ready = accounts && categories && paymentMethods;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Add transaction">
      {ready ? (
        <TxnForm
          key={formKey}
          accounts={accounts}
          categories={categories}
          paymentMethods={paymentMethods}
          loans={loans ?? []}
          goals={goals ?? []}
          onSubmit={async (values) => {
            await addTxn(values);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </Modal>
  );
}
