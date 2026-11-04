"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { sendPasswordReset, signIn, signUp } from "@/lib/sync";
import { Btn, Input } from "./ui";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "reset";

function errText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/invalid login/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first — check your inbox for the link.";
  if (/already registered/i.test(msg)) return "That email already has an account. Sign in instead.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Wait a few minutes and try again.";
  return msg;
}

/** Email + password sign in / sign up / reset. */
export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.includes("@")) return setError("Enter your email address.");
    if (mode !== "reset" && password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordReset(email);
        setNotice("Check your inbox for a link to reset your password.");
      } else if (mode === "signup") {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) {
          setNotice("Almost there — open the confirmation link we emailed you, then sign in.");
          setMode("signin");
        }
        setPassword("");
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {mode !== "reset" ? (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-cardhover p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={cn(
                "rounded-lg py-2 text-sm font-medium transition-colors",
                mode === m ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink"
              )}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-5 text-sm text-muted">Enter your email and we'll send you a link to choose a new password.</p>
      )}

      <form onSubmit={submit} className="space-y-3">
        <Input
          type="email"
          aria-label="Email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="py-3"
        />
        {mode !== "reset" && (
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              aria-label="Password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="py-3 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        )}

        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
        {notice && <p className="rounded-xl bg-good/10 px-3 py-2 text-xs font-medium text-good">{notice}</p>}

        <Btn type="submit" disabled={busy} className="w-full py-3 text-[15px]">
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </Btn>
      </form>

      <div className="mt-4 text-center">
        {mode === "reset" ? (
          <button type="button" onClick={() => switchTo("signin")} className="text-xs font-medium text-accent hover:underline">
            Back to sign in
          </button>
        ) : mode === "signin" ? (
          <button type="button" onClick={() => switchTo("reset")} className="text-xs text-muted hover:text-ink hover:underline">
            Forgot password?
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Full-screen front door shown to anyone who isn't signed in. */
export function AuthScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-[0.3em] text-accent">ARTHA</h1>
          <p className="mt-3 text-base text-muted">Know your money. Own your future.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <AuthForm />
        </div>
        <div className="mt-8 border-t border-border pt-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            What does Artha mean?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">Artha (अर्थ)</span> is Sanskrit for{" "}
            <span className="text-ink">wealth</span> — and also for <span className="text-ink">meaning</span> and{" "}
            <span className="text-ink">purpose</span>. In Indian philosophy it is one of the four aims of a good
            life: earning and managing money wisely.
          </p>
        </div>
        <p className="mt-5 text-center text-[11px] text-faint">Your data is private to your account.</p>
      </div>
    </div>
  );
}

/** Quiet full-screen placeholder while we check for an existing session. */
export function AuthSplash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg">
      <p className="animate-pulse text-2xl font-bold tracking-[0.3em] text-accent">ARTHA</p>
    </div>
  );
}
