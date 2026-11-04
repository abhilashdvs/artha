"use client";

import { useEffect } from "react";
import { seedDefaults } from "@/lib/db";

/** Seeds default categories & payment methods on first launch. */
export function DbInit() {
  useEffect(() => {
    seedDefaults().catch(console.error);
  }, []);
  return null;
}
