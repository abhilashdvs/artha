"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3, CalendarClock, CreditCard, FolderTree, HandCoins, Home,
  ListOrdered, Moon, PiggyBank, ReceiptText, Sun, Target, Wallet, Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useDemoMode } from "@/lib/hooks";
import { DemoBadge } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ListOrdered },
  { href: "/accounts", label: "Accounts & Cards", icon: Wallet },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/analytics", label: "Analytics & Insights", icon: BarChart3 },
  { href: "/lending", label: "Lending & Borrowing", icon: HandCoins },
  { href: "/income", label: "Income", icon: ReceiptText },
  { href: "/subscriptions", label: "Subscriptions & Bills", icon: CalendarClock },
  { href: "/goals", label: "Savings Goals", icon: Target },
  { href: "/reports", label: "Reports", icon: ReceiptText },
  { href: "/settings", label: "Settings", icon: CreditCard },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-xl border border-border p-2 text-muted hover:bg-cardhover"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const demo = useDemoMode();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white">
            <Zap size={16} />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">Artha</span>
        </Link>
        <ThemeToggle />
      </div>
      {demo && (
        <div className="mx-4 mb-2 flex items-center justify-between rounded-xl border border-warn/30 bg-warn/10 px-3 py-2">
          <span className="text-[11px] font-medium text-warn">Viewing demo data</span>
          <DemoBadge />
        </div>
      )}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-cardhover hover:text-ink"
              )}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3">
        <p className="text-[10px] text-faint">Local-first · INR · Your data stays in this browser</p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const items = [NAV[0], NAV[1], NAV[2], NAV[5], NAV[6]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card py-2 lg:hidden">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex flex-col items-center gap-0.5 px-2", active ? "text-accent" : "text-muted")}
          >
            <item.icon size={18} />
            <span className="text-[9px] font-medium">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
