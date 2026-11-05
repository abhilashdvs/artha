"use client";

import { LayoutGrid } from "lucide-react";
import { useSetting } from "@/lib/hooks";
import { setSetting } from "@/lib/db";
import { Card } from "./ui";
import { cn } from "@/lib/utils";

/** Settings switch: simple mode (default) vs every section visible. */
export function FeatureToggle() {
  const on = useSetting<boolean>("showAllFeatures", false);
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <LayoutGrid size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Show all features</h2>
          <p className="mt-1 text-xs text-muted">
            Off: Artha stays simple and shows Budgets, Goals, People and Insights once you start using them.
            On: every section is always visible, including Categories and Reports.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Show all features"
          onClick={() => setSetting("showAllFeatures", !on)}
          className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-accent" : "bg-border")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>
    </Card>
  );
}
