// Money helpers. Everything internally is integer paise.

export type Paise = number;

// Re-exported so pages can import { formatINR, pct } from "@/lib/money".
export { pct } from "./utils";

/** Parse user input ("1,234.50" | 1234.5 | "1234") into integer paise. */
export function toPaise(v: string | number): Paise {
  if (typeof v === "number") return Math.round(v * 100);
  const cleaned = v.replace(/[₹,\s]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function toRupees(p: Paise): number {
  return p / 100;
}

const inr0 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inr2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format paise as ₹ string. Hides decimals when the value is a whole rupee. */
export function formatINR(p: Paise, forceDecimals = false): string {
  const negative = p < 0;
  const abs = Math.abs(p);
  const s = !forceDecimals && abs % 100 === 0 ? inr0.format(abs / 100) : inr2.format(abs / 100);
  return negative ? `−${s}` : s;
}

/** Compact form for chart axes: 1.2k, 3.4L, 1.1Cr */
export function formatINRCompact(p: Paise): string {
  const r = p / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? "−" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0);
}
