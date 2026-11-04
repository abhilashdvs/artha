"use client";

import { useEffect } from "react";
import { seedDefaults } from "@/lib/db";
import { initSync } from "@/lib/sync";

/**
 * Starts cloud sync (if configured) and seeds default categories & payment
 * methods on first launch. A signed-in device gets its data from the cloud,
 * so it skips seeding to avoid duplicate default categories.
 */
export function DbInit() {
  useEffect(() => {
    (async () => {
      const signedIn = await initSync().catch(() => false);
      if (!signedIn) await seedDefaults();
    })().catch(console.error);
  }, []);
  return null;
}
