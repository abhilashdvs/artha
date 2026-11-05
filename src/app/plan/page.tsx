"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import BudgetsPage from "../budgets/page";
import SubscriptionsPage from "../subscriptions/page";
import GoalsPage from "../goals/page";
import { useFeatures } from "@/lib/features";

const TABS = [
  { key: "bills", label: "Subscription Radar", Page: SubscriptionsPage, feature: null },
  { key: "budgets", label: "Budgets", Page: BudgetsPage, feature: "budgets" },
  { key: "goals", label: "Goals", Page: GoalsPage, feature: "goals" },
] as const;

function PlanInner() {
  const params = useSearchParams();
  const router = useRouter();
  const f = useFeatures();
  // simple mode: Budgets / Goals tabs appear once you use them (or "Show all features")
  const tabs = TABS.filter((t) => !t.feature || f[t.feature] || params.get("tab") === t.key);
  const current = tabs.find((t) => t.key === params.get("tab")) ?? tabs[0];
  return (
    <div className="space-y-5">
      {tabs.length > 1 && (
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-cardhover p-1 sm:inline-flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => router.replace(`/plan?tab=${t.key}`, { scroll: false })}
            className={cn(
              "flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none",
              current.key === t.key ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      )}
      <current.Page />
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-muted">Loading…</div>}>
      <PlanInner />
    </Suspense>
  );
}
