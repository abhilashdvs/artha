"use client";

import { formatINR, formatINRCompact } from "@/lib/money";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Recharts wrappers themed via CSS vars.
// ─────────────────────────────────────────────────────────────

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
        <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart<T extends { label: string }>({ data, dataKey = "expense", color = "#6366f1", name = "Spending" }: {
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
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} strokeWidth={0}>
          {data.map((d, i) => (
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
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} formatter={inrTooltip} />
        <Bar dataKey="total" name={name} fill="#6366f1" radius={[0, 4, 4, 0]} />
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
        <Line type="monotone" dataKey="savingsRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
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
        <Line type="monotone" dataKey="score" name="Health score" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
