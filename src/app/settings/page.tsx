"use client";

import { useState } from "react";
import { useDemoMode, useTxns } from "@/lib/hooks";
import { clearDemo, seedDemo, wipeAllData } from "@/lib/demo";
import { exportTxnsCsv } from "@/lib/csv";
import { downloadFile } from "@/lib/utils";
import { Btn, Card, CardTitle, Modal } from "@/components/ui";
import { format } from "date-fns";
import { AlertTriangle, Download, Sparkles, Trash2 } from "lucide-react";
import { AccountSync } from "@/components/AccountSync";
import { InstallApp } from "@/components/InstallApp";
import { isSignedIn, wipeCloud } from "@/lib/sync";

export default function SettingsPage() {
  const demo = useDemoMode();
  const txns = useTxns();
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Account, sync, demo data and backups</p>
      </div>

      <AccountSync />

      <InstallApp />

      <Card>
        <CardTitle title="Demo Mode" sub="Explore with realistic sample data" />
        <p className="mb-4 text-xs text-muted">
          Demo data covers 6 months: salary, expenses across categories, budgets, subscriptions, lending, goals and credit cards.
          Demo rows are flagged and never mix with real data.
        </p>
        <div className="flex flex-wrap gap-2">
          {!demo ? (
            <Btn
              disabled={busy}
              onClick={async () => { setBusy(true); await seedDemo(); setBusy(false); }}
            >
              <Sparkles size={14} /> {busy ? "Loading…" : "Load demo data"}
            </Btn>
          ) : (
            <Btn
              variant="outline"
              disabled={busy}
              onClick={async () => { setBusy(true); await clearDemo(); setBusy(false); }}
            >
              <Trash2 size={14} /> {busy ? "Removing…" : "Remove demo data"}
            </Btn>
          )}
          <Btn
            variant="ghost"
            onClick={async () => txns && downloadFile(`artha-backup-${format(new Date(), "yyyy-MM-dd")}.csv`, await exportTxnsCsv(txns))}
          >
            <Download size={14} /> Backup all transactions
          </Btn>
        </div>
      </Card>

      <Card className="border-danger/30">
        <CardTitle title="Danger Zone" sub="Irreversible actions" />
        <p className="mb-4 text-xs text-muted">
          Wipes <b className="text-ink">all</b> data — accounts, transactions, budgets, loans, subscriptions, goals, custom categories — and resets the app to factory state.
          {isSignedIn() && " This also deletes your synced copy in the cloud, on every device."}
        </p>
        <Btn variant="danger" onClick={() => setWipeOpen(true)}>
          <AlertTriangle size={14} /> Wipe all data
        </Btn>
      </Card>

      <Modal open={wipeOpen} onClose={() => setWipeOpen(false)} title="Wipe ALL data?">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This permanently deletes everything stored in this browser{isSignedIn() ? " and in your cloud account" : ""}. There is no undo.
            Type <b className="text-ink">DELETE</b> to confirm.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-danger focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setWipeOpen(false)}>Cancel</Btn>
            <Btn
              variant="danger"
              disabled={confirmText !== "DELETE"}
              onClick={async () => {
                if (isSignedIn()) await wipeCloud();
                await wipeAllData();
                setWipeOpen(false);
              }}
            >
              Wipe everything
            </Btn>
          </div>
        </div>
      </Modal>

      <p className="text-center text-[11px] text-faint">Artha · अर्थ · built for clarity about money</p>
    </div>
  );
}
