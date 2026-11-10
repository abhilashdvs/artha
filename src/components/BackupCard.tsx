"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Download, FileDown, Upload } from "lucide-react";
import { exportBackup, readBackup, restoreBackup, type Backup } from "@/lib/backup";
import { exportTxnsCsv } from "@/lib/csv";
import { useTxns } from "@/lib/hooks";
import { isSignedIn } from "@/lib/sync";
import { downloadFile } from "@/lib/utils";
import { Btn, Card, Modal } from "./ui";

/** Settings: full backup (download), restore from a backup, and a CSV of transactions. */
export function BackupCard() {
  const txns = useTxns();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stamp = () => format(new Date(), "yyyy-MM-dd");

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink">Backup &amp; restore</h2>
      <p className="mt-1 text-xs text-muted">
        One file with everything: accounts, transactions, budgets, people, subscriptions, goals and categories. Keep a copy somewhere safe.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn size="sm" onClick={async () => downloadFile(`artha-backup-${stamp()}.json`, await exportBackup(), "application/json")}>
          <Download size={14} /> Download backup
        </Btn>
        <Btn size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Restore from backup
        </Btn>
        <Btn
          size="sm"
          variant="ghost"
          onClick={async () => txns && downloadFile(`artha-transactions-${stamp()}.csv`, await exportTxnsCsv(txns.filter((t) => !t.isDemo)))}
        >
          <FileDown size={14} /> Transactions (CSV)
        </Btn>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            setError(null);
            setDone(null);
            if (!f) return;
            try {
              setPending(readBackup(await f.text()));
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>
      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
      {done && <p className="mt-3 rounded-xl bg-good/10 px-3 py-2 text-xs font-medium text-good">{done}</p>}

      <Modal open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        {pending && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              From {format(new Date(pending.backup.exportedAt), "d MMM yyyy, h:mm a")}: {pending.counts.transactions} transactions,{" "}
              {pending.counts.accounts} accounts, {pending.counts.subscriptions} subscriptions, {pending.counts.loans} people,{" "}
              {pending.counts.budgets} budgets, {pending.counts.goals} goals.
            </p>
            <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
              This replaces your current data on this device{isSignedIn() ? " and in your account (all your devices)" : ""}. Download a
              backup of what you have now first if you might need it.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setPending(null)}>Cancel</Btn>
              <Btn
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await restoreBackup(pending.backup);
                    setDone(`Restored ${pending.counts.transactions} transaction${pending.counts.transactions === 1 ? "" : "s"} and the rest of your data.`);
                    setPending(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Restoring…" : "Replace with backup"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
