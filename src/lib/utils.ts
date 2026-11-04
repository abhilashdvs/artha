import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AccountType, PaymentMethodType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Deterministic PRNG for demo data so it's stable across reseeds. */
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function downloadFile(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ACCOUNT_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  credit_card: "Credit card",
  wallet: "Wallet",
  investment: "Investment",
};

export const PAYMENT_TYPE_LABEL: Record<PaymentMethodType, string> = {
  upi: "UPI",
  debit_card: "Debit card",
  credit_card: "Credit card",
  netbanking: "Net banking",
  cash: "Cash",
  wallet: "Wallet",
  other: "Other",
};

export const CHART_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#64748b",
];
