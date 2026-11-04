"use client";

import { formatINR, formatINRCompact } from "@/lib/money";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Recharts wrappers themed via CSS vars (var(--accent) etc. are
// defined per-theme in globals.css, so fills follow dark/light).
// ─────────────────────────────────────────────────────────────

const ACCENT = "var(--accent)";
const GOOD = "var(--good)";
const DANGER = "var(--danger)";

/** Truncate long tick labels (full name still shows in tooltip). */
const truncName = (s: string, max = 14) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  fontSize: "12px",
  color: "var(--ink)",
};

const axisStyle = { fontSize: 11, fill: "var(--muted)" } as const;

function inrTooltip(value: unknown): string {
  return formatINR(Number(value ?? 0));
}

export function IncomeExpenseChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip contentStyle={tooltipStyle} formatter={inrTooltip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={GOOD} radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Expenses" fill={DANGER} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart<T extends { label: string }>({ data, dataKey = "expense", color = ACCENT, name = "Spending" }: {
  data: T[]; dataKey?: string; color?: string; name?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => formatINRCompact(v)} width={56} />
        <Tooltip contentStyle={tooltipStyle} formatter={inrTooltip} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }: { data: { name: string; value: number; color?: string }[] }) {
  // Cap legend/slice count: merge the tail into "Other" so long category
  // lists don't produce an unreadable legend.
  const MAX_SLICES = 8;
  const sliced =
    data.length > MAX_SLICES
      ? [
          ...data.slice(0, MAX_SLICES - 1),
          {
            name: "Other",
            value: data.slice(MAX_SLICES - 1).reduce((s, d) => s + d.value, 0),
          },
        ]
      : data;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={sliced} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} strokeWidth={0}>
          {sliced.map((d, i) => (
            <Cell key={i} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: unknown, name: unknown) => [
            `${formatINR(Number(v ?? 0))} (${total > 0 ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`,
            String(name),
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, name = "Amount" }: { data: { name: string; total: number }[]; name?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => formatINRCompact(v)} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={110} tickFormatter={(v) => truncName(String(v))} />
        <Tooltip contentStyle={tooltipStyle} formatter={inrTooltip} />
        <Bar dataKey="total" name={name} fill={ACCENT} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SavingsRateChart({ data }: { data: { label: string; savingsRate: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [`${Number(v ?? 0)}%`, "Savings rate"]} />
        <Line type="monotone" dataKey="savingsRate" stroke={GOOD} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScoreLineChart({ data }: { data: { label: string; score: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="score" name="Health score" stroke="var(--violet)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
