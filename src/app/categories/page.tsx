"use client";

import { useMemo, useState } from "react";
import { useCategories, useTxns } from "@/lib/hooks";
import { addCategory, deleteCategoryWith, updateCategory } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { filterByRange, monthRange } from "@/lib/dates";
import { expenseTotal } from "@/lib/finance";
import { Badge, Btn, Card, Field, Input, Modal, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";

export default function CategoriesPage() {
  const categories = useCategories();
  const txns = useTxns();
  const [modal, setModal] = useState<Category | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [mergeInto, setMergeInto] = useState("");

  const monthTxns = useMemo(() => (txns ? filterByRange(txns, monthRange(0)) : []), [txns]);

  const spendByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTxns) {
      if (t.type !== "expense" || !t.categoryId) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
    }
    return map;
  }, [monthTxns]);

  if (!categories || !txns) return <div className="py-20 text-center text-sm text-muted">Loading…</div>;

  const active = categories.filter((c) => !c.isArchived);
  const roots = active.filter((c) => !c.parentId);
  const childrenOf = (id: string) => active.filter((c) => c.parentId === id);
  const usageCount = (id: string) => txns.filter((t) => t.categoryId === id).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted">Organize spending your way — custom categories & sub-categories</p>
        </div>
        <Btn size="sm" onClick={() => setModal("new")}><Plus size={14} /> New category</Btn>
      </div>

      <div className="space-y-3">
        {roots.map((root) => {
          const subs = childrenOf(root.id);
          const rootSpend = (spendByCat.get(root.id) ?? 0) + subs.reduce((s, c) => s + (spendByCat.get(c.id) ?? 0), 0);
          return (
            <Card key={root.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: root.color }} />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {root.name}
                      <Badge tone={root.kind === "income" ? "good" : "default"}>{root.kind}</Badge>
                      {root.isNeed != null && (
                        <Badge tone={root.isNeed ? "good" : "warn"}>{root.isNeed ? "need" : "want"}</Badge>
                      )}
                    </p>
                    <p className="text-[11px] text-muted">
                      {usageCount(root.id) + subs.reduce((s, c) => s + usageCount(c.id), 0)} transactions · this month {formatINR(rootSpend)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Btn size="sm" variant="ghost" onClick={() => setModal({ ...root, parentId: root.id, id: "", name: "" } as unknown as Category)}>
                    <Plus size={12} /> Sub
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setModal(root)}><Pencil size={12} /></Btn>
                  <Btn size="sm" variant="ghost" onClick={() => { setDeleteTarget(root); setMergeInto(""); }}><Trash2 size={12} /></Btn>
                </div>
              </div>
              {subs.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {subs.map((sub) => (
                    <li key={sub.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-ink">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sub.color }} />
                        {sub.name}
                        <span className="text-[11px] text-faint">{usageCount(sub.id)} txns</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tnum text-xs text-muted">{formatINR(spendByCat.get(sub.id) ?? 0)}</span>
                        <button onClick={() => setModal(sub)} className="p-1 text-muted hover:text-ink"><Pencil size={12} /></button>
                        <button onClick={() => { setDeleteTarget(sub); setMergeInto(""); }} className="p-1 text-muted hover:text-danger"><Trash2 size={12} /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <CategoryModal open={modal !== null} initial={modal === "new" ? null : modal} categories={active} onClose={() => setModal(null)} />

      {/* delete / merge modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete "${deleteTarget?.name}"?`}>
        {deleteTarget && (
          <div className="space-y-4">
            {usageCount(deleteTarget.id) > 0 ? (
              <>
                <p className="text-sm text-muted">
                  This category is used by <b className="text-ink">{usageCount(deleteTarget.id)}</b> transactions.
                  Choose another category to move them to:
                </p>
                <Select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                  <option value="">Select replacement…</option>
                  {active
                    .filter((c) => c.id !== deleteTarget.id && c.parentId !== deleteTarget.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>
                    ))}
                </Select>
              </>
            ) : (
              <p className="text-sm text-muted">No transactions use this category. Safe to delete.</p>
            )}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Btn>
              <Btn
                variant="danger"
                disabled={usageCount(deleteTarget.id) > 0 && !mergeInto}
                onClick={async () => {
                  await deleteCategoryWith(deleteTarget.id, mergeInto || undefined);
                  setDeleteTarget(null);
                }}
              >
                {usageCount(deleteTarget.id) > 0 ? "Merge & delete" : "Delete"}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CategoryModal({
  open, initial, categories, onClose,
}: { open: boolean; initial: Category | null; categories: Category[]; onClose: () => void }) {
  // initial with empty id means "new sub-category under initial.parentId"
  const isNewSub = initial !== null && initial.id === "";
  const [name, setName] = useState(isNewSub || !initial ? "" : initial.name);
  const [kind, setKind] = useState<"expense" | "income">(isNewSub || !initial ? "expense" : initial.kind);
  const [parentId, setParentId] = useState(isNewSub ? initial.parentId ?? "" : initial?.parentId ?? "");
  const [isNeed, setIsNeed] = useState<string>(
    isNewSub || !initial ? "" : initial.isNeed == null ? "" : initial.isNeed ? "need" : "want"
  );
  const [error, setError] = useState<string | null>(null);

  const [key, setKey] = useState(`${initial?.id}-${isNewSub}`);
  if (`${initial?.id}-${isNewSub}` !== key) {
    setKey(`${initial?.id}-${isNewSub}`);
    setName(isNewSub || !initial ? "" : initial.name);
    setKind(isNewSub || !initial ? "expense" : initial.kind);
    setParentId(isNewSub ? initial.parentId ?? "" : initial?.parentId ?? "");
    setIsNeed(isNewSub || !initial ? "" : initial.isNeed == null ? "" : initial.isNeed ? "need" : "want");
    setError(null);
  }

  async function save() {
    if (!name.trim()) return setError("Name is required.");
    const payload = {
      name: name.trim(),
      kind,
      parentId: parentId || undefined,
      isNeed: kind === "expense" ? (isNeed === "" ? null : isNeed === "need") : null,
    };
    if (initial && !isNewSub) {
      await updateCategory(initial.id, payload);
    } else {
      await addCategory(payload);
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial && !isNewSub ? "Edit category" : isNewSub ? "New sub-category" : "New category"}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "expense" | "income")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
          {!isNewSub && (
            <Field label="Parent (optional)">
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Top-level</option>
                {categories
                  .filter((c) => !c.parentId && c.kind === kind && c.id !== initial?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </Select>
            </Field>
          )}
          {kind === "expense" && (
            <Field label="Need or want?">
              <Select value={isNeed} onChange={(e) => setIsNeed(e.target.value)}>
                <option value="">Unspecified</option>
                <option value="need">Need</option>
                <option value="want">Want</option>
              </Select>
            </Field>
          )}
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save}>{initial && !isNewSub ? "Save" : "Create"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
