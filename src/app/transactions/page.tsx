"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAccounts, useCategories, useGoals, useLoans, usePaymentMethods, useTxns,
} from "@/lib/hooks";
import { filterByRange, fmtDay, monthKeyOf, rangeForPreset, type DatePreset, type DateRange } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { addTxn, deleteTxn, updateTxn } from "@/lib/db";
import { exportTxnsCsv, parseCsvFile, previewImport, runImport, type ImportItem, type ImportPlan, type SkippedRow } from "@/lib/csv";
import { Card, CardTitle, Btn, Empty, Input, Modal, Select, Badge, categoryOptions } from "@/components/ui";
import { DateFilter } from "@/components/DateFilter";
import { TxnForm } from "@/components/TxnForm";
import { cn, downloadFile } from "@/lib/utils";
import { ArrowDownUp, Download, Pencil, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { endOfDay, startOfMonth, format, parseISO } from "date-fns";
import type { Txn, TxnType } from "@/lib/types";

const TYPE_LABEL: Record<TxnType, string> = {
  expense: "Spent", income: "Received", transfer: "Moved", cc_payment: "Card bill",
  lend: "Lent", lend_repayment: "Got back", borrow: "Borrowed", borrow_repayment: "Paid back",
  refund: "Refund", investment: "Saved",
};

function TransactionsInner() {
  const params = useSearchParams();
  const accounts = useAccounts();
  const categories = useCategories();
  const paymentMethods = usePaymentMethods();
  const loans = useLoans();
  const goals = useGoals();
  const txns = useTxns();

  // Links from Home can open Activity already filtered:
  //   ?type=income  ?cat=<id>  ?acct=<id>  ?from=yyyy-MM-dd&to=yyyy-MM-dd  ?edit=<txn id>
  // otherwise, come back to the filters you last used (this session only)
  const linked = ["type", "cat", "acct", "from", "to", "edit"].some((k) => params.has(k));
  const saved = (() => {
    if (linked || typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("artha:activity") || "null") as
        | { preset: DatePreset; start: string; end: string; q: string; type: string; cat: string; acct: string }
        | null;
    } catch { return null; }
  })();
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const [preset, setPreset] = useState<DatePreset>(fromParam && toParam ? "custom" : saved?.preset ?? "month");
  const [custom, setCustom] = useState<DateRange>(
    fromParam && toParam
      ? { start: parseISO(fromParam), end: endOfDay(parseISO(toParam)) }
      : saved?.preset === "custom"
        ? { start: parseISO(saved.start), end: parseISO(saved.end) }
        : { start: startOfMonth(new Date()), end: new Date() }
  );
  const [q, setQ] = useState(saved?.q ?? "");
  const [typeFilter, setTypeFilter] = useState<string>(params.get("type") ?? saved?.type ?? "all");
  const [catFilter, setCatFilter] = useState<string>(params.get("cat") ?? saved?.cat ?? "all");
  const [acctFilter, setAcctFilter] = useState<string>(params.get("acct") ?? saved?.acct ?? "all");
  const [showFilters, setShowFilters] = useState(
    Boolean(params.get("type") || params.get("cat") || params.get("acct") || (saved && (saved.type !== "all" || saved.cat !== "all" || saved.acct !== "all")))
  );
  useEffect(() => {
    try {
      sessionStorage.setItem("artha:activity", JSON.stringify({
        preset, start: custom.start.toISOString(), end: custom.end.toISOString(), q, type: typeFilter, cat: catFilter, acct: acctFilter,
      }));
    } catch { /* ignore */ }
  }, [preset, custom, q, typeFilter, catFilter, acctFilter]);
  const activeFilterCount = [typeFilter, catFilter, acctFilter].filter((f) => f !== "all").length;
  const [sortDesc, setSortDesc] = useState(true);
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [delTxn, setDelTxn] = useState<Txn | null>(null);
  const [importOpen, setImportOpen] = useState(params.get("import") === "1");

  // ?edit=<id>: open that transaction once the data has loaded (only once)
  const editParam = params.get("edit");
  const [editHandled, setEditHandled] = useState(false);
  useEffect(() => {
    if (!editParam || editHandled || !txns) return;
    setEditHandled(true);
    const t = txns.find((x) => x.id === editParam);
    if (t) setEditTxn(t);
  }, [editParam, editHandled, txns]);

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);

  const filtered = useMemo(() => {
    if (!txns) return [];
    let list = filterByRange(txns, range);
    if (typeFilter !== "all") list = list.filter((t) => t.type === typeFilter);
    if (catFilter !== "all") list = list.filter((t) => t.categoryId === catFilter);
    if (acctFilter !== "all") list = list.filter((t) => t.accountId === acctFilter || t.toAccountId === acctFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((t) =>
        [t.description, t.merchant ?? "", t.notes ?? "", (t.tags ?? []).join(" ")]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    list.sort((a, b) => (sortDesc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return list;
  }, [txns, range, typeFilter, catFilter, acctFilter, q, sortDesc]);

  const grouped = useMemo(() => {
    const map = new Map<string, Txn[]>();
    for (const t of filtered) {
      const key = format(parseISO(t.date), "yyyy-MM-dd"); // local day, not UTC slice
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()];
  }, [filtered]);

  const totals = useMemo(() => {
    const exp = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const refunds = filtered.filter((t) => t.type === "refund").reduce((s, t) => s + t.amount, 0);
    const inc = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const inv = filtered.filter((t) => t.type === "investment").reduce((s, t) => s + t.amount, 0);
    return { exp, refunds, inc, inv, net: exp - refunds };
  }, [filtered]);

  if (!txns || !accounts || !categories || !paymentMethods) {
    return <div className="py-20 text-center text-sm text-muted">Loading…</div>;
  }

  const acctName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const catName = (id?: string) => (id ? categories.find((c) => c.id === id)?.name : undefined);
  const pmName = (id?: string) => (id ? paymentMethods.find((p) => p.id === id)?.name : undefined);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <div className="flex items-center gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setImportOpen(true)}>
            <Upload size={13} /> Import
          </Btn>
          <Btn variant="ghost" size="sm" onClick={async () => downloadFile(`artha-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`, await exportTxnsCsv(filtered))}>
            <Download size={13} /> Export
          </Btn>
        </div>
      </div>

      {/* search + date + optional filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input className="pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <DateFilter preset={preset} onChange={setPreset} custom={custom} onCustomChange={setCustom} />
          <Btn
            variant={showFilters || activeFilterCount > 0 ? "outline" : "ghost"}
            size="sm"
            className="py-2.5"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={13} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Btn>
        </div>
        {showFilters && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Everything</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="all">All categories</option>
              {categoryOptions(categories.filter((c) => !c.isArchived))}
            </Select>
            <Select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)}>
              <option value="all">All accounts</option>
              {accounts.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {/* one-line totals */}
      <p className="text-sm text-muted">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · spent <b className="tnum text-ink">{formatINR(totals.net)}</b>
        {totals.inc > 0 && <> · received <b className="tnum text-good">{formatINR(totals.inc)}</b></>}
        {totals.inv > 0 && <> · invested <b className="tnum text-ink">{formatINR(totals.inv)}</b></>}
      </p>

      {filtered.length === 0 ? (
        <Empty
          title="No transactions found"
          sub="Add transactions with the + button, import a CSV, or widen the filters."
          action={<Btn variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload size={13} /> Import CSV</Btn>}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium text-muted">Entries</span>
            <button
              onClick={() => setSortDesc((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
            >
              <ArrowDownUp size={12} /> {sortDesc ? "Newest first" : "Oldest first"}
            </button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {grouped.map(([day, list]) => (
              <div key={day}>
                <p className="sticky top-0 z-10 border-b border-border bg-card px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {fmtDay(list[0].date)}
                </p>
                <ul className="divide-y divide-border">
                  {list.map((t) => {
                    const isOut = ["expense", "lend", "borrow_repayment", "investment"].includes(t.type);
                    const isIn = ["income", "lend_repayment", "borrow", "refund"].includes(t.type);
                    return (
                      <li key={t.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-cardhover">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-ink">{t.description}</p>
                            {t.type !== "expense" && t.type !== "income" && (
                              <Badge tone={t.type === "refund" ? "good" : t.type === "investment" ? "accent" : "default"}>
                                {TYPE_LABEL[t.type]}
                              </Badge>
                            )}
                           
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {acctName(t.accountId)}
                            {t.toAccountId ? ` → ${acctName(t.toAccountId)}` : ""}
                            {pmName(t.paymentMethodId) ? ` · ${pmName(t.paymentMethodId)}` : ""}
                            {catName(t.categoryId) ? ` · ${catName(t.categoryId)}` : ""}
                            {t.merchant ? ` · ${t.merchant}` : ""}
                          </p>
                        </div>
                        <span className={cn("tnum text-sm font-semibold", isOut ? "text-danger" : isIn ? "text-good" : "text-ink")}>
                          {isOut ? "−" : isIn ? "+" : ""}{formatINR(t.amount)}
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => setEditTxn(t)} title="Edit transaction" aria-label="Edit transaction" className="rounded-lg p-2 text-muted hover:bg-bg hover:text-ink">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => setDelTxn(t)} title="Delete transaction" aria-label="Delete transaction" className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* edit modal */}
      <Modal open={!!editTxn} onClose={() => setEditTxn(null)} title="Edit transaction" wide>
        {editTxn && (
          <TxnForm
            accounts={accounts}
            categories={categories}
            paymentMethods={paymentMethods}
            loans={loans ?? []}
            goals={goals ?? []}
            initial={editTxn}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              await updateTxn(editTxn.id, values);
              setEditTxn(null);
            }}
            onCancel={() => setEditTxn(null)}
          />
        )}
      </Modal>

      {/* delete confirm */}
      <Modal open={!!delTxn} onClose={() => setDelTxn(null)} title="Delete transaction?">
        {delTxn && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Delete <b className="text-ink">{delTxn.description}</b> ({formatINR(delTxn.amount)})? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDelTxn(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={async () => { await deleteTxn(delTxn.id); setDelTxn(null); }}>
                Delete
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

// ── CSV import wizard ─────────────────────────────────────────

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts();
  const categories = useCategories();
  const txns = useTxns();
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ items: ImportItem[]; skipped: SkippedRow[]; plan: ImportPlan; total: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; dupes: number; skipped: number; total: number } | null>(null);

  async function handleFile(file: File) {
    if (!accountId) return setError("Choose the account these transactions belong to first.");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const rows = await parseCsvFile(file);
      if (rows.length === 0) return setError("Could not find any valid rows. Check the column format.");
      const plan: ImportPlan = {
        accountId,
        kind: "generic",
        dateCol: "auto", descCol: "auto", amountCol: "auto", typeCol: "auto", categoryCol: "auto",
      };
      const { items, skipped } = previewImport(rows, plan, categories ?? []);
      if (items.length === 0) {
        return setError(
          `No importable rows found${skipped.length > 0 ? ` — all ${skipped.length} rows were skipped (e.g. ${skipped[0].reason.toLowerCase()})` : ""}. Check the column format.`,
        );
      }
      setPending({ items, skipped, plan, total: rows.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runImport(pending.items, pending.plan, txns ?? [], categories ?? []);
      setResult({ ...res, skipped: pending.skipped.length, total: pending.total });
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import CSV / Excel">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-bg p-3 text-xs text-muted">
          <p className="font-semibold text-ink">Expected columns</p>
          <p className="mt-1">date · description · amount · type (optional: debit/credit) · category (optional)</p>
          <p className="mt-1 text-faint">Works with most bank exports. Duplicates are skipped automatically. Categories are auto-suggested from keywords and your past imports.</p>
        </div>
        <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Import into account…</option>
          {(accounts ?? []).filter((a) => a.isActive && a.type !== "credit_card").map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accentstrong"
        />
        {busy && <p className="text-xs text-muted">Importing…</p>}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        {pending && (
          <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
            <p className="text-xs font-medium text-ink">
              Ready to import <b>{pending.items.length}</b> of {pending.total} rows.
              {pending.skipped.length > 0 && (
                <span className="text-warn"> {pending.skipped.length} row{pending.skipped.length === 1 ? "" : "s"} will be skipped:</span>
              )}
            </p>
            {pending.skipped.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-bg p-2 text-[11px] text-muted">
                {pending.skipped.slice(0, 20).map((s) => (
                  <li key={s.row} className="flex gap-2">
                    <span className="tnum shrink-0 text-faint">#{s.row}</span>
                    <span className="min-w-0 flex-1 truncate" title={s.description}>{s.description}</span>
                    <span className="shrink-0 text-warn">{s.reason}</span>
                  </li>
                ))}
                {pending.skipped.length > 20 && (
                  <li className="text-faint">…and {pending.skipped.length - 20} more</li>
                )}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Btn size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Btn>
              <Btn size="sm" onClick={confirmImport} disabled={busy}>Import {pending.items.length} rows</Btn>
            </div>
          </div>
        )}
        {result && (
          <div className="rounded-xl bg-good/10 px-3 py-2.5 text-xs text-good">
            <b>{result.inserted}</b> of {result.total} rows imported · {result.dupes} duplicates skipped
            {result.skipped > 0 ? ` · ${result.skipped} invalid rows skipped` : ""}.
            <div className="mt-2">
              <Btn size="sm" variant="outline" onClick={() => { setResult(null); onClose(); }}>Done</Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-muted">Loading…</div>}>
      <TransactionsInner />
    </Suspense>
  );
}
