"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import type { Account, PaymentMethod, Txn } from "@/lib/types";
import { setSetting } from "@/lib/db";
import { seedDemo } from "@/lib/demo";
import { openQuickAdd } from "./QuickAdd";
import { Card } from "./ui";
import { cn } from "@/lib/utils";

/** Three-step guide on Home for new users. Disappears when done or dismissed. */
// Home passes in data it has already loaded, so the card appears together with the page (no jump).
export function GetStarted({
  big = false, accounts, methods, txns, dismissed,
}: { big?: boolean; accounts: Account[]; methods: PaymentMethod[]; txns: Txn[]; dismissed: boolean }) {

  const realAccounts = accounts.filter((a) => a.isActive && !a.isDemo);
  const steps = [
    {
      done: realAccounts.length > 0,
      title: "Add your bank account",
      sub: "Name and current balance — takes 20 seconds",
      href: "/accounts?new=account",
    },
    {
      done: methods.some((m) => !m.isDemo && m.isActive && m.linkedAccountId),
      title: "Add the apps & cards you pay with",
      sub: "GPay, PhonePe, credit cards… linked to that account",
      href: "/accounts?new=app",
    },
    {
      done: txns.some((t) => !t.isDemo),
      title: "Add your first expense",
      sub: "Tap + any time you spend",
      action: openQuickAdd,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length || (dismissed && !big)) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <Card className={cn(big ? "p-6" : "")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className={cn("font-bold text-ink", big ? "text-xl" : "text-base")}>Get started</h2>
          <p className="text-xs text-muted">{doneCount} of 3 done</p>
        </div>
        {!big && (
          <button
            onClick={() => setSetting("onboardingDismissed", true)}
            aria-label="Hide this guide"
            className="rounded-lg p-1.5 text-faint hover:bg-cardhover hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-cardhover">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / 3) * 100}%` }} />
      </div>
      <ol className="-mx-2 space-y-1">
        {steps.map((s, i) => {
          const body = (
            <>
              {s.done ? (
                <CheckCircle2 size={22} className="shrink-0 text-good" />
              ) : (
                <span className={cn("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                  i === next ? "border-accent text-accent" : "border-border text-faint")}>{i + 1}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done ? "text-muted line-through" : "text-ink")}>{s.title}</span>
                {!s.done && <span className="block text-xs text-muted">{s.sub}</span>}
              </span>
              {!s.done && <ChevronRight size={16} className="shrink-0 text-faint" />}
            </>
          );
          const cls = cn(
            "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
            !s.done && "hover:bg-cardhover active:bg-cardhover",
            i === next && "bg-accent/5"
          );
          return (
            <li key={s.title}>
              {s.done ? (
                <div className={cls}>{body}</div>
              ) : s.href ? (
                <Link href={s.href} className={cls}>{body}</Link>
              ) : (
                <button type="button" onClick={s.action} className={cls}>{body}</button>
              )}
            </li>
          );
        })}
      </ol>
      {big && (
        <p className="mt-4 text-center text-xs text-muted">
          Just looking?{" "}
          <button onClick={() => seedDemo()} className="font-medium text-accent hover:underline">
            Try it with sample data
          </button>{" "}
          — you can remove it any time in Settings.
        </p>
      )}
    </Card>
  );
}

