"use client";

import { useEffect } from "react";
import { seedDefaults } from "@/lib/db";
import { initSync } from "@/lib/sync";
import "@/lib/install"; // start listening for the browser's install prompt early

/** The one public address. Your login is remembered per address, so we always use this one. */
const SITE_HOST = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://artha-self.vercel.app").host;

/**
 * Starts cloud sync (if configured) and seeds default categories & payment
 * methods on first launch. A signed-in device gets its data from the cloud,
 * so it skips seeding to avoid duplicate default categories.
 */
export function DbInit() {
  useEffect(() => {
    // Vercel also serves every deploy on its own *.vercel.app address. Browsers keep
    // logins per address, so send those visitors to the main one where you're signed in.
    const host = window.location.host;
    if (host.endsWith(".vercel.app") && host !== SITE_HOST) {
      window.location.replace(`https://${SITE_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`);
      return;
    }

    // Ask the browser to keep Artha's storage (login + offline data) instead of clearing it under pressure.
    navigator.storage?.persist?.().catch(() => {});

    // Installable app: offline support (production only, so dev hot-reload isn't cached).
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    (async () => {
      const signedIn = await initSync().catch(() => false);
      if (!signedIn) await seedDefaults();
    })().catch(console.error);
  }, []);
  return null;
}
