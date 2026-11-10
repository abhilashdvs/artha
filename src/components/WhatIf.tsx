"use client";

import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import type { Category, Subscription, Txn } from "@/lib/types";
import { categoryBreakdown } from "@/lib/analytics";
import { annualCost } from "@/lib/finance";
import { monthKeyOf } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Card } from "./ui";

/** paise → rounded to whole rupees (still paise), for friendlier averages */
const rupees = (paise: number) => Math.round(paise / 100) * 100;

/**
 * What-if savings: cut spending in your top categories and/or cancel
 * subscriptions, and see the monthly + yearly saving. Based on your average
 * monthly spend over the last 3 complete months.
 */
export function WhatIf({ txns, categories, subscriptions }: { txns: Txn[]; categories: Category[]; subscriptions: Subscription[] }) {
  const base = useMemo(() => {
    const keys = [1, 2, 3].map((i) => format(subMonths(new Date(), i), "yyyy-MM"));
    const scoped = txns.filter((t) => keys.includes(monthKeyOf(t.date)));
    const months = new Set(scoped.filter((t) => t.type === "expense").map((t) => monthKeyOf(t.date))).size || 1;
    // only things you can realistically cut — skip fixed costs like rent, EMIs and bills
    const isFixed = (id: string) => {
      const c = categories.find((x) => x.id === id);
      const parent = c?.parentId ? categories.find((x) => x.id === c.parentId) : undefined;
      return (c?.flow ?? parent?.flow) === "fixed";
    };
    return categoryBreakdown(scoped, categories)
      .filter((c) => !isFixed(c.categoryId))
      .slice(0, 5)
      .map((c) => ({ ...c, monthly: rupees(c.value / months) }));
  }, [txns, categories]);
  // bills you can't really cancel (rent, EMIs…) are left out
  const subs = subscriptions.filter((s) => {
    if (!s.isActive) return false;
    const c = categories.find((x) => x.id === s.categoryId);
    const parent = c?.parentId ? categories.find((x) => x.id === c.parentId) : undefined;
    return !/rent|emi|loan|insurance/i.test(`${s.name} ${c?.name ?? ""}`) || (c?.flow ?? parent?.flow) !== "fixed";
  });

  const [cuts, setCuts] = useState<Record<string, number>>({});
  const [cancel, setCancel] = useState<Record<string, boolean>>({});

  const monthly =
    base.reduce((s, c) => s + rupees((c.monthly * (cuts[c.categoryId] ?? 0)) / 100), 0) +
    subs.reduce((s, x) => s + (cancel[x.id] ? rupees(annualCost(x) / 12) : 0), 0);

  if (base.length === 0 && subs.length === 0) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold text-ink">What if I spent less?</h3>
      <p className="text-xs text-muted">Your average month over the last 3 months (fixed costs like rent and EMIs left out).</p>

      <div className="mt-4 space-y-4">
        {base.map((c) => {
          const cut = cuts[c.categoryId] ?? 0;
          return (
            <div key={c.categoryId}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate text-ink">{c.name} <span className="text-xs text-muted">· {formatINR(c.monthly)}/mo</span></span>
                <span className="tnum shrink-0 text-xs font-semibold text-accent">{cut > 0 ? `−${cut}% · ${formatINR(rupees((c.monthly * cut) / 100))}` : "no change"}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={cut}
                aria-label={`Cut ${c.name} by percent`}
                onChange={(e) => setCuts((x) => ({ ...x, [c.categoryId]: Number(e.target.value) }))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </div>
          );
        })}
      </div>

      {subs.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-muted">Cancel subscriptions</p>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setCancel((c) => ({ ...c, [x.id]: !c[x.id] }))}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${cancel[x.id] ? "border-accent bg-accent text-white" : "border-border text-ink hover:bg-cardhover"}`}
              >
                {x.name} · {formatINR(rupees(annualCost(x) / 12))}/mo
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-accent/10 p-4 text-center">
        <p className="text-xs text-muted">You'd save</p>
        <p className="tnum text-2xl font-bold text-accent">{formatINR(monthly)}<span className="text-sm font-medium"> / month</span></p>
        <p className="tnum text-xs text-muted">{formatINR(monthly * 12)} a year</p>
      </div>
    </Card>
  );
}
