"use client";

import type { ReactNode } from "react";
import { useSyncStatus } from "@/lib/sync";
import { AuthScreen, AuthSplash } from "./AuthScreen";

/**
 * The app is only shown to signed-in users. Until we know whether a session
 * exists we show a quiet splash, then either the app or the sign-in screen.
 * (If Supabase isn't configured, the app runs in local-only mode, ungated.)
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const s = useSyncStatus();
  if (!s.configured) return <>{children}</>;
  if (!s.authReady) return <AuthSplash />;
  if (!s.email) return <AuthScreen />;
  return <>{children}</>;
}
