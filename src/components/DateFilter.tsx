"use client";

import { useState } from "react";
import type { DatePreset, DateRange } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Input } from "./ui";
import { format, parseISO } from "date-fns";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All" },
];

export function DateFilter({
  preset, onChange, custom, onCustomChange,
}: {
  preset: DatePreset;
  onChange: (p: DatePreset) => void;
  custom: DateRange;
  onCustomChange: (r: DateRange) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => { setShowCustom(false); onChange(p.key); }}
          className={cn(
            "rounded-full px-3 py-2 text-xs font-medium transition-colors",
            preset === p.key && !showCustom
              ? "bg-accent text-white"
              : "border border-border text-muted hover:bg-cardhover"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => { setShowCustom(true); onChange("custom"); }}
        className={cn(
          "rounded-full px-3 py-2 text-xs font-medium transition-colors",
          preset === "custom" ? "bg-accent text-white" : "border border-border text-muted hover:bg-cardhover"
        )}
      >
        Custom
      </button>
      {preset === "custom" && (
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Input
            type="date"
            className="min-w-0 flex-1 px-2 py-1 text-xs sm:w-auto sm:flex-none"
            value={format(custom.start, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && onCustomChange({ ...custom, start: parseISO(e.target.value) })}
          />
          <span className="text-xs text-faint">→</span>
          <Input
            type="date"
            className="min-w-0 flex-1 px-2 py-1 text-xs sm:w-auto sm:flex-none"
            value={format(custom.end, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && onCustomChange({ ...custom, end: parseISO(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
