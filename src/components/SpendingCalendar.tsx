"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addMonths, endOfMonth, format, getDay, isAfter, startOfMonth, startOfToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Txn } from "@/lib/types";
import { formatINR, formatINRCompact } from "@/lib/money";
import { Card } from "./ui";
import { cn } from "@/lib/utils";

/** Month calendar of daily spending — busier days are darker. Tap a day to see its entries. */
export function SpendingCalendar({ txns }: { txns: Txn[] }) {
  const [offset, setOffset] = useState(0);
  const month = startOfMonth(addMonths(new Date(), -offset));
  const today = startOfToday();

  const { days, max, total, top } = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const t of txns) {
      if (t.type !== "expense" && t.type !== "refund") continue;
      const key = format(new Date(t.date), "yyyy-MM-dd");
      if (!key.startsWith(format(month, "yyyy-MM"))) continue;
      byDay.set(key, (byDay.get(key) ?? 0) + (t.type === "expense" ? t.amount : -t.amount));
    }
    const last = endOfMonth(month).getDate();
    const days = Array.from({ length: last }, (_, i) => {
      const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
      const key = format(d, "yyyy-MM-dd");
      return { d, key, amount: Math.max(byDay.get(key) ?? 0, 0), future: isAfter(d, today) };
    });
    const max = Math.max(1, ...days.map((x) => x.amount));
    const total = days.reduce((s, x) => s + x.amount, 0);
    const top = [...days].sort((a, b) => b.amount - a.amount)[0];
    return { days, max, total, top };
  }, [txns, month, today]);

  const lead = (getDay(month) + 6) % 7; // Monday-first
  const shade = (a: number) => {
    if (a <= 0) return "bg-cardhover";
    const r = a / max;
    return r > 0.75 ? "bg-danger/80 text-white" : r > 0.5 ? "bg-warn/70 text-white" : r > 0.25 ? "bg-accent/45" : "bg-accent/20";
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Spending calendar</h3>
          <p className="text-xs text-muted">
            {formatINR(total)} in {format(month, "MMMM")}
            {top && top.amount > 0 ? ` · biggest day ${format(top.d, "d MMM")} (${formatINR(top.amount)})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset((o) => o + 1)} aria-label="Previous month" className="rounded-lg p-1.5 text-muted hover:bg-cardhover"><ChevronLeft size={16} /></button>
          <span className="w-16 text-center text-xs font-medium">{format(month, "MMM yy")}</span>
          <button onClick={() => setOffset((o) => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Next month" className="rounded-lg p-1.5 text-muted hover:bg-cardhover disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-faint">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {days.map((x) => (
          <Link
            key={x.key}
            href={`/transactions?from=${x.key}&to=${x.key}`}
            title={`${format(x.d, "d MMM")}: ${formatINR(x.amount)}`}
            className={cn(
              "flex aspect-square flex-col items-center justify-center rounded-lg text-[10px] leading-tight transition-transform active:scale-95",
              x.future ? "pointer-events-none opacity-30" : shade(x.amount)
            )}
          >
            <span className="font-medium">{x.d.getDate()}</span>
            {x.amount > 0 && <span className="hidden opacity-90 sm:block">{formatINRCompact(x.amount)}</span>}
          </Link>
        ))}
      </div>
    </Card>
  );
}
