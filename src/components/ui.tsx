"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

// ── Card ──────────────────────────────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-card", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────

export function Stat({
  label, value, sub, tone = "default", icon,
}: {
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "bad" | "warn";
  icon?: ReactNode;
}) {
  const valueTone =
    tone === "good" ? "text-good" : tone === "bad" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <p className={cn("mt-1.5 text-xl font-bold tracking-tight tabular-nums", valueTone)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

// ── Button ────────────────────────────────────────────────────

export function Btn({
  className, variant = "primary", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        variant === "primary" && "bg-accent text-white hover:bg-accentstrong",
        variant === "ghost" && "text-ink hover:bg-cardhover",
        variant === "outline" && "border border-border text-ink hover:bg-cardhover",
        variant === "danger" && "bg-danger/10 text-danger hover:bg-danger/20",
        className
      )}
      {...props}
    />
  );
}

// ── Form controls ─────────────────────────────────────────────

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
        props.className
      )}
    />
  );
}

// ── Modal ─────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-cardhover">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Badge / progress ──────────────────────────────────────────

export function Badge({
  children, tone = "default",
}: { children: ReactNode; tone?: "default" | "good" | "bad" | "warn" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "default" && "bg-cardhover text-muted",
        tone === "good" && "bg-good/10 text-good",
        tone === "bad" && "bg-danger/10 text-danger",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "accent" && "bg-accent/10 text-accent"
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  const v = Math.min(100, Math.max(0, value));
  const auto = v >= 100 ? "var(--danger)" : v >= 90 ? "var(--warn)" : "var(--accent)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-cardhover">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${v}%`, backgroundColor: color ?? auto }}
      />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-xs text-muted">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DemoBadge() {
  return (
    <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn">
      DEMO DATA
    </span>
  );
}
