"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3, CalendarCheck, FolderTree, FileSpreadsheet, HandCoins, Home,
  LayoutGrid, ListOrdered, Moon, Plus, Settings, Sun, Wallet, Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useDemoMode } from "@/lib/hooks";
import { Modal } from "./ui";
import { openQuickAdd } from "./QuickAdd";
import { useSyncStatus } from "@/lib/sync";

// Main sections — what you use every day.
const MAIN = [
  { href: "/", label: "Home", icon: Home, match: ["/"] },
  { href: "/transactions", label: "Activity", icon: ListOrdered, match: ["/transactions", "/income"] },
  { href: "/plan", label: "Plan", icon: CalendarCheck, match: ["/plan", "/budgets", "/subscriptions", "/goals"] },
  { href: "/lending", label: "People", icon: HandCoins, match: ["/lending"] },
];

// Everything else — setup and deeper analysis.
const MORE = [
  { href: "/analytics", label: "Insights", icon: BarChart3 },
  { href: "/accounts", label: "Accounts & cards", icon: Wallet },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  return (prefixes: string[]) =>
    prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-xl p-2 text-muted hover:bg-cardhover hover:text-ink"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function DemoNote() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <Link
      href="/settings"
      className="block rounded-xl bg-warn/10 px-3 py-2 text-[11px] font-medium text-warn hover:bg-warn/15"
    >
      You're viewing demo data · manage in Settings
    </Link>
  );
}

function SyncNote() {
  const s = useSyncStatus();
  if (!s.configured) return <p className="px-2 text-[10px] text-faint">Your data stays in this browser</p>;
  const label = !s.email
    ? "Sign in to sync across devices"
    : s.state === "error"
      ? "Sync problem — tap to retry"
      : s.state === "syncing"
        ? "Syncing…"
        : "Synced";
  return (
    <Link href="/settings" className="flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-cardhover hover:text-ink">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          !s.email ? "bg-faint" : s.state === "error" ? "bg-danger" : s.state === "syncing" ? "bg-warn" : "bg-good"
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const isActive = useIsActive();
  const link = (item: { href: string; label: string; icon: typeof Home }, active: boolean, small = false) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 font-medium transition-colors",
        small ? "py-2 text-[13px]" : "py-2.5 text-sm",
        active ? "bg-accent/10 text-accent" : "text-muted hover:bg-cardhover hover:text-ink"
      )}
    >
      <item.icon size={small ? 16 : 18} />
      {item.label}
    </Link>
  );
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white">
            <Zap size={16} />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">Artha</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="px-3">
        <button
          onClick={openQuickAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accentstrong"
        >
          <Plus size={16} /> Add transaction
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">{MAIN.map((i) => link(i, isActive(i.match)))}</div>
        <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">More</p>
        <div className="space-y-0.5">{MORE.map((i) => link(i, isActive([i.href]), true))}</div>
      </nav>

      <div className="space-y-2 px-3 pb-4">
        <DemoNote />
        <SyncNote />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = [MAIN[3], ...MORE];
  const moreActive = moreItems.some((n) => isActive([n.href]));

  const tab = (item: (typeof MAIN)[number]) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-1",
        isActive(item.match) ? "text-accent" : "text-muted"
      )}
    >
      <item.icon size={20} />
      <span className="text-[11px] font-medium">{item.label}</span>
    </Link>
  );

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {tab(MAIN[0])}
        {tab(MAIN[1])}
        <div className="flex flex-1 justify-center">
          <button
            onClick={openQuickAdd}
            aria-label="Add transaction"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:scale-95"
          >
            <Plus size={26} />
          </button>
        </div>
        {tab(MAIN[2])}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn("flex flex-1 flex-col items-center gap-1 py-1", moreActive ? "text-accent" : "text-muted")}
          aria-label="More pages"
        >
          <LayoutGrid size={20} />
          <span className="text-[11px] font-medium">More</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-2">
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border border-border px-2 py-4 text-center text-xs font-medium",
                isActive([item.href]) ? "border-accent bg-accent/10 text-accent" : "text-ink hover:bg-cardhover"
              )}
            >
              <item.icon size={22} />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <DemoNote />
          <SyncNote />
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted">Light / dark</span>
            <ThemeToggle />
          </div>
        </div>
      </Modal>
    </>
  );
}
