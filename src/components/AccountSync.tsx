"use client";

import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Cloud, CloudOff, LogOut, RefreshCw } from "lucide-react";
import {
  sendPasswordReset, setNewPassword, signIn, signOut, signUp, syncNow, useSyncStatus,
} from "@/lib/sync";
import { useDemoMode } from "@/lib/hooks";
import { Btn, Card, Field, Input } from "./ui";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "reset";

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox for the link.";
  if (/already registered/i.test(msg)) return "That email already has an account. Sign in instead.";
  return msg;
}

/** Sign in / sign up / sync status — lives at the top of Settings. */
export function AccountSync() {
  const s = useSyncStatus();
  const demo = useDemoMode();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!s.configured) {
    return (
      <Card>
        <div className="flex items-start gap-3 text-sm text-muted">
          <CloudOff size={18} className="mt-0.5 shrink-0" />
          <p>
            Your data is stored only in this browser. Cloud sync isn't set up for this copy of Artha
            (missing Supabase settings).
          </p>
        </div>
      </Card>
    );
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  // ── choosing a new password after a reset link ──
  if (s.recovering) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-semibold">Choose a new password</h2>
        <p className="mb-4 text-xs text-muted">At least 8 characters.</p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) return setError("Use at least 8 characters.");
            void run(async () => {
              await setNewPassword(password);
              setPassword("");
              setNotice("Password updated.");
            });
          }}
        >
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Btn type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Btn>
        </form>
      </Card>
    );
  }

  // ── signed in ──
  if (s.email) {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Cloud size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{s.email}</p>
              <p className={cn("text-xs", s.state === "error" ? "text-danger" : "text-muted")}>
                {s.state === "syncing" && "Syncing…"}
                {s.state === "synced" && `Synced${s.lastSynced ? ` ${formatDistanceToNow(parseISO(s.lastSynced), { addSuffix: true })}` : ""}`}
                {s.state === "error" && `Sync problem: ${s.error ?? "unknown error"}`}
                {s.state === "off" && "Connecting…"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" disabled={busy || s.state === "syncing"} onClick={() => run(syncNow)}>
              <RefreshCw size={13} className={s.state === "syncing" ? "animate-spin" : ""} /> Sync now
            </Btn>
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => run(signOut)}>
              <LogOut size={13} /> Sign out
            </Btn>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Your data syncs across every device you sign in on. Signing out removes it from this browser only —
          it stays in your account.{demo ? " Demo data stays on this device and is never uploaded." : ""}
        </p>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </Card>
    );
  }

  // ── signed out ──
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Cloud size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">
            {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in to sync"}
          </h2>
          <p className="text-xs text-muted">
            Use Artha on your phone and laptop with the same data. Without signing in, data stays in this browser only.
          </p>
        </div>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.includes("@")) return setError("Enter your email address.");
          if (mode === "reset") {
            return void run(async () => {
              await sendPasswordReset(email);
              setNotice("Check your inbox for a reset link.");
            });
          }
          if (password.length < 8) return setError("Password must be at least 8 characters.");
          void run(async () => {
            if (mode === "signup") {
              const { needsConfirmation } = await signUp(email, password);
              if (needsConfirmation) setNotice("Almost done — open the confirmation link we emailed you, then sign in here.");
            } else {
              await signIn(email, password);
            }
            setPassword("");
          });
        }}
      >
        <Field label="Email">
          <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== "reset" && (
          <Field label="Password">
            <Input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        {notice && <p className="rounded-xl bg-good/10 px-3 py-2 text-xs font-medium text-good">{notice}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Btn type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
          </Btn>
          {mode === "signin" ? (
            <>
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>
                New here? Create an account
              </button>
              <button type="button" className="text-xs text-muted hover:underline" onClick={() => { setMode("reset"); setError(null); setNotice(null); }}>
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
