"use client";

import { useMemo } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useBudgets, useGoals, useLoans, useSettingState, useTxns } from "./hooks";

/**
 * Simple mode: new users see only the essentials (Home, Activity, Add,
 * Subscription Radar, Accounts, Settings). Other sections appear once
 * they're useful, or all at once with Settings → "Show all features".
 * Demo data always shows everything, since it exists to explore.
 */
export interface Features {
  /** false until everything below is known — render nav only once ready (no jumping) */
  ready: boolean;
  showAll: boolean;
  people: boolean;
  insights: boolean;
  budgets: boolean;
  goals: boolean;
  categories: boolean;
  reports: boolean;
}

export function useFeatures(): Features {
  const showAllS = useSettingState<boolean>("showAllFeatures", false);
  const demoS = useSettingState<boolean>("demoMode", false);
  const txns = useTxns();
  const loans = useLoans();
  const budgets = useBudgets();
  const goals = useGoals();

  return useMemo(() => {
    const all = showAllS.value || demoS.value;
    const ready = showAllS.loaded && demoS.loaded && !!txns && !!loans && !!budgets && !!goals;
    const real = (txns ?? []).filter((t) => !t.isDemo);
    // Insights become worthwhile after ~2 weeks of entries
    let insights = false;
    if (real.length >= 10) {
      const times = real.map((t) => parseISO(t.date).getTime());
      insights = differenceInCalendarDays(Math.max(...times), Math.min(...times)) >= 14;
    }
    return {
      ready,
      showAll: all,
      people: all || (loans ?? []).length > 0,
      insights: all || insights,
      budgets: all || (budgets ?? []).length > 0,
      goals: all || (goals ?? []).length > 0,
      categories: all,
      reports: all,
    };
  }, [showAllS, demoS, txns, loans, budgets, goals]);
}
