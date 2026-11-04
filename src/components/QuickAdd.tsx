"use client";

import { useEffect, useState } from "react";
import { Plus, Zap } from "lucide-react";
import { Modal } from "./ui";
import { TxnForm } from "./TxnForm";
import { addTxn } from "@/lib/db";
import { useAccounts, useCategories, useGoals, useLoans, usePaymentMethods } from "@/lib/hooks";

// ─────────────────────────────────────────────────────────────
// Floating quick-add. Keyboard: press "n" anywhere to open.
// ─────────────────────────────────────────────────────────────

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const loans = useLoans();
  const goals = useGoals();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const ready = accounts && categories && paymentMethods;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-transform hover:scale-105 lg:bottom-8"
        aria-label="Quick add transaction"
      >
        <Plus size={18} />
        Add
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add transaction" wide>
        {ready ? (
          <>
            <p className="mb-3 hidden items-center gap-1.5 text-[11px] text-faint sm:flex">
              <Zap size={12} /> Tip: press <kbd className="rounded border border-border px-1">N</kbd> anywhere to open this.
            </p>
            <TxnForm
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
          </>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Modal>
    </>
  );
}
