"use client";

import { cn } from "@/lib/utils";
import { Check, ChevronDown, X } from "lucide-react";
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

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
      <p className={cn("mt-1.5 truncate text-xl font-bold tracking-tight tabular-nums", valueTone)} title={value}>{value}</p>
      {sub && <p className="mt-0.5 line-clamp-2 text-xs text-muted" title={sub}>{sub}</p>}
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
        size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm",
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

// text-base (16px) on mobile prevents iOS Safari auto-zoom on focus; sm:text-sm restores desktop density.
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-bg px-3 py-2 text-base text-ink placeholder:text-faint sm:text-sm",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
        props.className
      )}
    />
  );
}

// ── Select ─────────────────────────────────────────────────────
// Custom picker used everywhere instead of the browser's native dropdown, so it
// looks the same on every phone and computer. Same API as <select>: pass
// <option>/<optgroup> children; onChange receives { target: { value } }.

interface PickOption { value: string; label: string; disabled?: boolean }
interface PickGroup { label?: string; options: PickOption[] }

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function parseOptions(children: ReactNode): PickGroup[] {
  const groups: PickGroup[] = [];
  let loose: PickGroup | null = null;
  const add = (el: ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>, into: PickGroup) => {
    const label = textOf(el.props.children);
    into.options.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled });
  };
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "optgroup") {
      loose = null;
      const p = child.props as { label?: string; children?: ReactNode };
      const g: PickGroup = { label: p.label, options: [] };
      Children.forEach(p.children, (o) => isValidElement(o) && add(o as ReactElement<{ value?: string }>, g));
      groups.push(g);
    } else if (child.type === "option") {
      if (!loose) { loose = { options: [] }; groups.push(loose); }
      add(child as ReactElement<{ value?: string }>, loose);
    } else if (child.type === Fragment) {
      groups.push(...parseOptions((child.props as { children?: ReactNode }).children));
    }
  });
  return groups;
}

export function Select({
  value, onChange, children, className, disabled, "aria-label": ariaLabel, title,
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  // desktop panel position (fixed to the screen so pop-up forms can't clip it)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const groups = parseOptions(children);
  const all = groups.flatMap((g) => g.options);
  const current = all.find((o) => o.value === String(value ?? ""));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation(); // close just the picker, not the form around it
      setOpen(false);
    };
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const width = Math.max(r.width, 192);
      const left = Math.min(r.left, window.innerWidth - width - 8);
      setPos(below >= 220 || below >= above
        ? { left, width, top: r.bottom + 4, maxH: Math.min(288, below) }
        : { left, width, bottom: window.innerHeight - r.top + 4, maxH: Math.min(288, above) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onDown = (e: MouseEvent) => {
      if (window.innerWidth >= 640 && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    // bring the selected option into view
    requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const choose = (v: string) => {
    setOpen(false);
    if (v !== String(value ?? "")) onChange?.({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-left text-base text-ink sm:text-sm",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50",
          open && "border-accent ring-2 ring-accent/20",
          className
        )}
      >
        <span className={cn("truncate", !current?.value && "text-muted")}>{current?.label ?? "Select…"}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          {/* phones: dim background + bottom sheet; computers: small panel under the field */}
          <div className="fixed inset-0 z-[60] bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
          <div
            ref={listRef}
            role="listbox"
            style={
              pos && typeof window !== "undefined" && window.innerWidth >= 640
                ? { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }
                : undefined
            }
            className={cn(
              "fixed inset-x-0 bottom-0 z-[61] max-h-[70vh] overflow-y-auto rounded-t-2xl border border-border bg-card p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl",
              "sm:inset-x-auto sm:bottom-auto sm:rounded-xl sm:pb-2 sm:shadow-lg"
            )}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" />
            {groups.map((g, gi) => (
              <div key={gi} className={cn(gi > 0 && "mt-1 border-t border-border pt-1")}>
                {g.label && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.label}</p>}
                {g.options.filter((o) => !(o.value === "" && o.label.trim().endsWith("…"))).map((o) => {
                  const selected = o.value === String(value ?? "");
                  return (
                    <button
                      key={o.value + o.label}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={o.disabled}
                      onClick={() => choose(o.value)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-[15px] sm:py-2 sm:text-sm",
                        selected ? "bg-accent/10 font-semibold text-accent" : "text-ink hover:bg-cardhover",
                        o.disabled && "opacity-40"
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {selected && <Check size={16} className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-border bg-bg px-3 py-2 text-base text-ink placeholder:text-faint sm:text-sm",
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
    // lock body scroll while the modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-cardhover">
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

/**
 * <option>s for a category picker, grouped under each main category
 * (main category first, then its sub-categories). Works with <Select>.
 */
export function categoryOptions(list: { id: string; name: string; parentId?: string }[]) {
  const ids = new Set(list.map((c) => c.id));
  const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId)).sort((a, b) => a.name.localeCompare(b.name));
  return roots.map((r) => {
    const kids = list.filter((c) => c.parentId === r.id).sort((a, b) => a.name.localeCompare(b.name));
    return (
      <optgroup key={r.id} label={r.name}>
        <option value={r.id}>{kids.length ? `All ${r.name}` : r.name}</option>
        {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
      </optgroup>
    );
  });
}
