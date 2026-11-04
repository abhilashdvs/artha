"use client";

import type { DatePreset, DateRange } from "@/lib/dates";
import { Input, Select } from "./ui";
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
      <div className="relative w-44">
        <CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted" />
        <Select
          aria-label="Date range"
          value={preset}
          onChange={(e) => onChange(e.target.value as DatePreset)}
          className="bg-card pl-9 font-medium"
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
      </div>
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
