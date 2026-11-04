"use client";

import { useMemo, useState } from "react";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

// Friendly icons, matched on the category name (works for custom categories too).
const ICONS: [RegExp, string][] = [
  [/grocer|vegetable|fruit|kirana|bigbasket/i, "🛒"],
  [/deliver|zomato|swiggy|zepto|blinkit|instamart/i, "🛵"],
  [/eating out|restaurant|cafe|coffee|snack/i, "🍽️"],
  [/food|dining/i, "🍔"],
  [/fuel|petrol|diesel/i, "⛽"],
  [/cab|auto|uber|ola|taxi|rapido/i, "🚕"],
  [/transport|travel|commute|metro|bus|train/i, "🚌"],
  [/rent/i, "🏠"],
  [/utilit|bill|electric|water|wifi|broadband|recharge|mobile/i, "💡"],
  [/housing|home/i, "🏡"],
  [/shop|amazon|flipkart|cloth|electronic/i, "🛍️"],
  [/entertain|movie|ott|netflix|game|outing/i, "🎬"],
  [/health|medic|doctor|gym|fitness|pharma/i, "💊"],
  [/subscri/i, "🔁"],
  [/invest|sip|mutual|fund|fd|rd|stock/i, "📈"],
  [/salary|pay ?check|wage/i, "💼"],
  [/freelanc|side|business/i, "🧑‍💻"],
  [/interest|dividend/i, "🏦"],
  [/gift|family|parent/i, "🎁"],
  [/educat|course|book/i, "📚"],
  [/friend|party|social|celebrat/i, "🎉"],
  [/emi|loan|insurance/i, "🧾"],
];
export function categoryIcon(name: string): string {
  return ICONS.find(([re]) => re.test(name))?.[1] ?? "🏷️";
}

// everyday categories first, "Other" last; everything else alphabetical in between
const ORDER = [/food|dining/i, /grocer/i, /deliver/i, /eating/i, /transport/i, /fuel/i, /cab/i, /shop/i, /housing/i, /rent/i,
  /utilit|bill/i, /health/i, /entertain/i, /subscri/i, /salary/i, /freelanc/i, /invest/i, /interest/i];
function rank(name: string) {
  if (/^other/i.test(name)) return 999;
  const i = ORDER.findIndex((re) => re.test(name));
  return i === -1 ? 500 : i;
}
function byEveryday(a: Category, b: Category) {
  return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
}

/**
 * Tap-to-pick categories: main categories as tiles, then that category's
 * sub-types as chips. Replaces the long native dropdown on phones.
 */
export function CategoryPicker({
  categories, value, onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
}) {
  const roots = useMemo(() => categories.filter((c) => !c.parentId).sort(byEveryday), [categories]);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id).sort(byEveryday);

  // which main category is open: the selected one's parent, or the selected root itself
  const selected = categories.find((c) => c.id === value);
  const [openRoot, setOpenRoot] = useState<string | null>(selected ? selected.parentId ?? selected.id : null);
  const kids = openRoot ? childrenOf(openRoot) : [];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {roots.map((c) => {
          const active = openRoot === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (active && value === c.id) {
                  // tap again to clear
                  setOpenRoot(null);
                  onChange("");
                } else {
                  setOpenRoot(c.id);
                  onChange(c.id);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-center transition-colors active:scale-95",
                active ? "border-accent bg-accent/10" : "border-border bg-bg hover:bg-cardhover"
              )}
            >
              <span className="text-xl leading-none" aria-hidden>{categoryIcon(c.name)}</span>
              <span className={cn("line-clamp-2 text-[11px] leading-tight", active ? "font-semibold text-accent" : "text-ink")}>
                {c.name}
              </span>
            </button>
          );
        })}
      </div>

      {kids.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[{ id: openRoot!, name: "General" }, ...kids].map((k) => {
            const active = value === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => onChange(k.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors active:scale-95",
                  active ? "border-accent bg-accent text-white" : "border-border bg-card text-ink hover:bg-cardhover"
                )}
              >
                {k.id !== openRoot && <span aria-hidden>{categoryIcon(k.name)} </span>}
                {k.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
