"use client";

import type { DatePreset, DateRange } from "@/lib/dates";
import { Input } from "./ui";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "week", label: "This week" },
  { key: "today", label: "Today" },
  { key: "3m", label: "Last 3 months" },
  { key: "6m", label: "Last 6 months" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates…" },
];

/** One compact dropdown instead of a row of chips. */
export function DateFilter({
  preset, onChange, custom, onCustomChange,
}: {
  preset: DatePreset;
  onChange: (p: DatePreset) => void;
  custom: DateRange;
  onCustomChange: (r: DateRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative inline-flex items-center">
        <CalendarDays size={15} className="pointer-events-none absolute left-3 text-muted" />
        <select
          aria-label="Date range"
          value={preset}
          onChange={(e) => onChange(e.target.value as DatePreset)}
          className="cursor-pointer appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-8 text-sm font-medium text-ink hover:bg-cardhover focus:border-accent focus:outline-none"
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 text-xs text-muted">▾</span>
      </label>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="From"
            className="w-auto px-2 py-1.5 text-xs"
            value={format(custom.start, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && onCustomChange({ ...custom, start: parseISO(e.target.value) })}
          />
          <span className="text-xs text-faint">→</span>
          <Input
            type="date"
            aria-label="To"
            className="w-auto px-2 py-1.5 text-xs"
            value={format(custom.end, "yyyy-MM-dd")}
            onChange={(e) => e.target.value && onCustomChange({ ...custom, end: parseISO(e.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
