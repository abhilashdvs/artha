"use client";

import { createClient, isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { Table, Transaction } from "dexie";
import { useSyncExternalStore } from "react";
import { db, seedDefaults } from "./db";

// ─────────────────────────────────────────────────────────────
// Cloud sync (Supabase).
//
// The browser (Dexie/IndexedDB) stays the app's working copy, so the UI is
// instant and works offline. When you're signed in:
//   • every committed local change is queued (outbox) and pushed up;
//   • on start-up, sign-in, focus and reconnect we push the queue, then pull
//     everything down — the cloud is the source of truth.
// The first time a device links to an account whose cloud is empty, the
// device's existing (non-demo) data is uploaded instead.
// Demo rows and the demoMode flag never leave the device.
// ─────────────────────────────────────────────────────────────

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const syncConfigured = Boolean(SB_URL && KEY);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!syncConfigured || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(SB_URL!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

// ── Table mapping (local camelCase ↔ remote snake_case) ──────

type LocalTable =
  | "accounts" | "paymentMethods" | "categories" | "transactions"
  | "loans" | "budgets" | "subscriptions" | "goals";

const TABLES: Record<LocalTable, { remote: string; fields: string[] }> = {
  accounts: {
    remote: "accounts",
    fields: ["name", "type", "subtype", "bankName", "openingBalance", "color", "creditLimit", "billingDay", "isActive"],
  },
  paymentMethods: { remote: "payment_methods", fields: ["name", "type", "linkedAccountId", "isActive"] },
  categories: {
    remote: "categories",
    fields: ["name", "parentId", "kind", "isNeed", "flow", "color", "isArchived"],
  },
  transactions: {
    remote: "transactions",
    fields: [
      "type", "amount", "date", "description", "accountId", "toAccountId", "categoryId", "paymentMethodId",
      "goalId", "loanId", "merchant", "notes", "tags", "linkedTxnIds",
    ],
  },
  loans: { remote: "loans", fields: ["personName", "direction", "amount", "dueDate", "notes", "status"] },
  budgets: { remote: "budgets", fields: ["categoryId", "amount", "isActive"] },
  subscriptions: {
    remote: "subscriptions",
    fields: ["name", "amount", "cycle", "nextDueDate", "accountId", "paymentMethodId", "categoryId", "isActive", "notes"],
  },
  goals: { remote: "goals", fields: ["name", "targetAmount", "currentAmount", "targetDate", "notes", "isCompleted"] },
};
const LOCAL_TABLES = Object.keys(TABLES) as LocalTable[];

/** Settings that stay on this device only. */
const LOCAL_ONLY_SETTINGS = new Set(["demoMode"]);
const DATE_ONLY = new Set(["dueDate", "nextDueDate", "targetDate"]);
const TIMESTAMPS = new Set(["date", "createdAt"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function toRemote(t: LocalTable, obj: Row, userId: string): Row {
  const out: Row = { id: obj.id, user_id: userId, created_at: obj.createdAt || new Date().toISOString(), updated_at: new Date().toISOString() };
  for (const f of TABLES[t].fields) {
    let v = obj[f];
    if (v === undefined || v === "") v = null;
    if (f === "tags") v = Array.isArray(v) ? v : [];
    out[snake(f)] = v;
  }
  return out;
}

function toLocal(t: LocalTable, row: Row): Row {
  const out: Row = { id: row.id, createdAt: new Date(row.created_at).toISOString() };
  for (const f of TABLES[t].fields) {
    let v = row[snake(f)];
    if (v === null) {
      if (f === "isNeed") out[f] = null; // null is meaningful ("unspecified")
      continue;
    }
    if (TIMESTAMPS.has(f)) v = new Date(v).toISOString();
    if (DATE_ONLY.has(f) && typeof v === "string") v = v.slice(0, 10);
    out[f] = v;
  }
  if (t === "transactions" && !out.tags) out.tags = [];
  return out;
}

function table(t: LocalTable): Table<Row, string> {
  return db[t] as unknown as Table<Row, string>;
}

// ── Status (for the UI) ──────────────────────────────────────

export type SyncState = "off" | "syncing" | "synced" | "error";
export interface SyncStatus {
  configured: boolean;
  email: string | null;
  state: SyncState;
  lastSynced: string | null;
  error: string | null;
  /** set when the auth flow needs the user to choose a new password */
  recovering: boolean;
  /** true once we know whether a session exists (avoids a sign-in flash on load) */
  authReady: boolean;
}

/** The login supabase-js saved in this browser (read synchronously so the app can open instantly). */
function storedSession(): { id: string; email: string | null } | null {
  if (!syncConfigured || typeof window === "undefined") return null;
  try {
    const ref = new URL(SB_URL!).host.split(".")[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const u = j?.user ?? j?.currentSession?.user;
    return j?.refresh_token && u?.id ? { id: u.id, email: u.email ?? null } : null;
  } catch {
    return null;
  }
}
const remembered = storedSession();

let status: SyncStatus = {
  configured: syncConfigured,
  // a saved login opens the app straight away; we verify it in the background
  email: remembered?.email ?? null,
  state: "off",
  lastSynced: null,
  error: null,
  recovering: false,
  authReady: !syncConfigured || remembered !== null,
};
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => status,
    () => status,
  );
}

// ── Outbox (committed local changes waiting to be pushed) ────

const OUTBOX_KEY = "artha:sync:outbox";
const LINKED_KEY = "artha:sync:linkedUser";
let userId: string | null = null;
let applyingRemote = false;

function readOutbox(): string[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch { return []; }
}
function writeOutbox(items: string[]) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify([...new Set(items)])); } catch { /* ignore */ }
}
function enqueue(keys: string[]) {
  if (keys.length === 0) return;
  writeOutbox([...readOutbox(), ...keys]);
  scheduleFlush();
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush(delay = 400) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, delay);
}

/** Queue a key now, but only add it to the outbox once its transaction commits. */
const pendingByTxn = new WeakMap<Transaction, string[]>();
function track(key: string, trans: Transaction) {
  if (!userId || applyingRemote) return;
  let list = pendingByTxn.get(trans);
  if (!list) {
    list = [];
    pendingByTxn.set(trans, list);
    trans.on("complete", () => enqueue(list!));
  }
  list.push(key);
}

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const t of LOCAL_TABLES) {
    const tbl = table(t);
    tbl.hook("creating", (pk, obj, trans) => {
      if (!obj.isDemo) track(`${t}|${obj.id ?? pk}`, trans);
    });
    tbl.hook("updating", (mods: Row, pk, obj, trans) => {
      if (!obj.isDemo || mods.isDemo === false) track(`${t}|${pk}`, trans);
      return undefined;
    });
    tbl.hook("deleting", (pk, obj, trans) => {
      if (!obj?.isDemo) track(`${t}|${pk}`, trans);
    });
  }
  db.settings.hook("creating", (pk, obj, trans) => {
    if (!LOCAL_ONLY_SETTINGS.has(obj.key)) track(`settings|${obj.key}`, trans);
  });
  db.settings.hook("updating", (_m, pk, _o, trans) => {
    if (!LOCAL_ONLY_SETTINGS.has(String(pk))) track(`settings|${pk}`, trans);
    return undefined;
  });
  db.settings.hook("deleting", (pk, _o, trans) => {
    if (!LOCAL_ONLY_SETTINGS.has(String(pk))) track(`settings|${pk}`, trans);
  });
}

// ── Push ─────────────────────────────────────────────────────

let flushing: Promise<void> | null = null;

export function flush(): Promise<void> {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}

async function doFlush(): Promise<void> {
  const c = supabase();
  if (!c || !userId) return;
  const items = readOutbox();
  if (items.length === 0) return;
  setStatus({ state: "syncing" });
  const rejected: string[] = [];
  try {
    const byTable = new Map<string, string[]>();
    for (const it of items) {
      const [t, ...rest] = it.split("|");
      const id = rest.join("|");
      byTable.set(t, [...(byTable.get(t) ?? []), id]);
    }
    for (const [t, ids] of byTable) {
      if (t === "settings") {
        const rows = await db.settings.bulkGet(ids);
        const ups = rows.filter((r): r is NonNullable<typeof r> => !!r)
          .map((r) => ({ user_id: userId, key: r.key, value: r.value ?? null, updated_at: new Date().toISOString() }));
        const dels = ids.filter((_, i) => !rows[i]);
        if (ups.length) { const { error } = await c.from("settings").upsert(ups, { onConflict: "user_id,key" }); if (error) throw error; }
        if (dels.length) { const { error } = await c.from("settings").delete().in("key", dels); if (error) throw error; }
        continue;
      }
      const lt = t as LocalTable;
      if (!TABLES[lt]) continue;
      const valid = ids.filter((id) => UUID.test(id));
      const rows = await table(lt).bulkGet(valid);
      const ups = rows.filter((r): r is Row => !!r && !r.isDemo).map((r) => toRemote(lt, r, userId!));
      const dels = valid.filter((_, i) => !rows[i]);
      for (let i = 0; i < ups.length; i += 500) {
        await upsertResilient(c, TABLES[lt].remote, ups.slice(i, i + 500), rejected);
      }
      for (let i = 0; i < dels.length; i += 200) {
        const { error } = await c.from(TABLES[lt].remote).delete().in("id", dels.slice(i, i + 200));
        if (error) throw error;
      }
    }
    // drop what we pushed; keep anything queued meanwhile
    const done = new Set(items);
    writeOutbox(readOutbox().filter((k) => !done.has(k)));
    setStatus(
      rejected.length
        ? { state: "error", error: `${rejected.length} item(s) couldn't be saved to the cloud: ${rejected[0]}` }
        : { state: "synced", lastSynced: new Date().toISOString(), error: null },
    );
  } catch (e) {
    setStatus({ state: "error", error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
  }
}

/**
 * Upsert a batch. If the database rejects it because of bad data in one row
 * (constraint / type errors), retry row by row and skip only the bad rows so
 * a single bad record can never block syncing forever. Network and auth
 * errors are re-thrown so the whole batch is retried later.
 */
async function upsertResilient(c: SupabaseClient, remote: string, rows: Row[], rejected: string[]) {
  const { error } = await c.from(remote).upsert(rows, { onConflict: "id" });
  if (!error) return;
  const isDataError = (code?: string) => !!code && (code.startsWith("22") || code.startsWith("23"));
  if (!isDataError(error.code)) throw error;
  for (const row of rows) {
    const r = await c.from(remote).upsert(row, { onConflict: "id" });
    if (r.error) {
      if (!isDataError(r.error.code)) throw r.error;
      rejected.push(`${remote} ${row.id}: ${r.error.message}`);
      console.warn("[artha sync] skipped row", remote, row.id, r.error.message);
    }
  }
}

// ── Pull ─────────────────────────────────────────────────────

const CURSOR_KEY = "artha:sync:cursor";
/** Re-read a few minutes before the last change we saw, so nothing committed late is missed. */
const OVERLAP_MS = 5 * 60_000;

function readCursors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CURSOR_KEY) || "{}"); } catch { return {}; }
}
function writeCursors(c: Record<string, string> | null) {
  try {
    if (c) localStorage.setItem(CURSOR_KEY, JSON.stringify(c));
    else localStorage.removeItem(CURSOR_KEY);
  } catch { /* ignore */ }
}

async function fetchPaged(
  c: SupabaseClient, remote: string, columns: string, since?: string,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = c.from(remote).select(columns);
    if (since) q = q.gte("updated_at", since);
    const { data, error } = await q.order(remote === "settings" ? "key" : "id").range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Pull the cloud copy. After the first full download, only rows changed since
 * the last sync are downloaded, plus the list of ids (to notice deletions) —
 * a few KB instead of your whole history on every open.
 */
async function pull(): Promise<void> {
  const c = supabase();
  if (!c || !userId) return;
  const cursors = readCursors();
  const next: Record<string, string> = { ...cursors };
  const changed: Partial<Record<LocalTable, Row[]>> = {};
  const ids: Partial<Record<LocalTable, Set<string>>> = {};
  for (const t of LOCAL_TABLES) {
    const remote = TABLES[t].remote;
    const since = cursors[t] ? new Date(Date.parse(cursors[t]) - OVERLAP_MS).toISOString() : undefined;
    changed[t] = await fetchPaged(c, remote, "*", since);
    ids[t] = since
      ? new Set((await fetchPaged(c, remote, "id")).map((r) => r.id as string))
      : new Set(changed[t]!.map((r) => r.id as string));
    const newest = changed[t]!.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), cursors[t] ?? "");
    if (newest) next[t] = newest;
  }
  const settings = await fetchPaged(c, "settings", "*");

  applyingRemote = true;
  try {
    await db.transaction("rw", [...LOCAL_TABLES.map(table), db.settings], async () => {
      for (const t of LOCAL_TABLES) {
        const localReal = await table(t).filter((r) => !r.isDemo).primaryKeys();
        const gone = localReal.filter((id) => !ids[t]!.has(String(id)));
        if (gone.length) await table(t).bulkDelete(gone);
        if (changed[t]!.length) await table(t).bulkPut(changed[t]!.map((r) => toLocal(t, r)));
      }
      for (const s of settings) await db.settings.put({ key: s.key, value: s.value });
    });
  } finally {
    applyingRemote = false;
  }
  writeCursors(next);
  try {
    for (const s of settings) localStorage.setItem("artha:setting:" + s.key, JSON.stringify(s.value));
  } catch { /* ignore */ }
}

async function cloudIsEmpty(c: SupabaseClient): Promise<boolean> {
  for (const remote of ["categories", "accounts", "transactions"]) {
    const { count, error } = await c.from(remote).select("id", { count: "exact", head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) return false;
  }
  return true;
}

/** Push pending changes, then pull the latest copy. */
export async function syncNow(): Promise<void> {
  const c = supabase();
  if (!c || !userId) return;
  setStatus({ state: "syncing" });
  try {
    await flush();
    if (readOutbox().length > 0) return; // push failed — don't overwrite unsynced local edits
    await pull();
    setStatus({ state: "synced", lastSynced: new Date().toISOString(), error: null });
  } catch (e) {
    setStatus({ state: "error", error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
  }
}

async function link(uid: string, email: string | null) {
  const c = supabase();
  if (!c) return;
  userId = uid;
  setStatus({ email, state: "syncing", error: null });
  try {
    const previous = localStorage.getItem(LINKED_KEY);
    if (previous !== uid) {
      // First time this browser links to this account.
      writeOutbox([]);
      if (previous) {
        // Another account used this browser before (e.g. its session expired):
        // never upload their data into this account — clear it locally instead.
        await clearLocalAccountData();
      }
      if (await cloudIsEmpty(c)) {
        if (previous) {
          // brand-new account on a shared browser: start from fresh defaults (queued for upload by the hooks)
          await seedDefaults(true);
        } else {
          const keys: string[] = [];
          for (const t of LOCAL_TABLES) {
            const ids = await table(t).filter((r) => !r.isDemo).primaryKeys();
            keys.push(...ids.map((id) => `${t}|${id}`));
          }
          const settingKeys = await db.settings.toCollection().primaryKeys();
          keys.push(...settingKeys.map(String).filter((k) => !LOCAL_ONLY_SETTINGS.has(k)).map((k) => `settings|${k}`));
          writeOutbox(keys);
        }
      }
      localStorage.setItem(LINKED_KEY, uid);
    }
    await syncNow();
  } catch (e) {
    setStatus({ state: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

// ── Lifecycle ────────────────────────────────────────────────

let started = false;
let lastPull = 0;

/**
 * Start sync. Resolves to true when a signed-in session exists (the device's
 * data will come from the cloud, so callers should skip first-run seeding).
 */
export async function initSync(): Promise<boolean> {
  const c = supabase();
  if (!c || started) return Boolean(userId);
  started = true;
  installHooks();

  c.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") setStatus({ recovering: true });
    if (event === "SIGNED_IN" && session && session.user.id !== userId) {
      void link(session.user.id, session.user.email ?? null);
    }
    if (event === "SIGNED_OUT") {
      userId = null;
      setStatus({ email: null, state: "off", lastSynced: null, error: null });
    }
  });

  const refresh = () => {
    if (!userId || Date.now() - lastPull < 30_000) return;
    lastPull = Date.now();
    void syncNow();
  };
  window.addEventListener("focus", refresh);
  // iPhone home-screen apps don't always fire "focus" when reopened
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
  window.addEventListener("online", () => { lastPull = 0; refresh(); });
  setInterval(() => { if (userId) void flush(); }, 60_000);

  // If there's a saved login, start syncing with it right away — the app is already showing.
  if (remembered && remembered.id !== userId) {
    lastPull = Date.now();
    void link(remembered.id, remembered.email);
  }

  const { data, error } = await c.auth.getSession().catch((e) => ({ data: { session: null }, error: e }));
  const s = data.session;
  if (s) {
    setStatus({ email: s.user.email ?? null });
    if (s.user.id !== userId) {
      lastPull = Date.now();
      void link(s.user.id, s.user.email ?? null);
    }
  } else if (remembered && isAuthRetryableFetchError(error)) {
    // offline / flaky network: keep you signed in; sync resumes when you're back online
  } else if (remembered) {
    // the saved login is no longer valid (e.g. signed out elsewhere) → show sign-in
    userId = null;
    setStatus({ email: null, state: "off" });
  }
  setStatus({ authReady: true });
  return Boolean(s) || Boolean(remembered && isAuthRetryableFetchError(error));
}

// ── Auth actions (used by the Account card) ──────────────────

function redirectTo() {
  return `${window.location.origin}/settings`;
}

export async function signUp(email: string, password: string) {
  const c = supabase();
  if (!c) throw new Error("Cloud sync isn't configured.");
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const c = supabase();
  if (!c) throw new Error("Cloud sync isn't configured.");
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const c = supabase();
  if (!c) throw new Error("Cloud sync isn't configured.");
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

export async function setNewPassword(password: string) {
  const c = supabase();
  if (!c) throw new Error("Cloud sync isn't configured.");
  const { error } = await c.auth.updateUser({ password });
  if (error) throw error;
  setStatus({ recovering: false });
}

/**
 * Sign out. Pushes pending changes first, then removes this account's data
 * from this browser (it stays safe in the cloud). Demo data is kept.
 */
export async function signOut(): Promise<void> {
  const c = supabase();
  if (!c) return;
  await flush();
  if (readOutbox().length > 0) {
    throw new Error("Some changes haven't been saved to the cloud yet. Check your connection, tap Sync now, then sign out.");
  }
  // "local": sign out this device only — your other devices stay signed in
  await c.auth.signOut({ scope: "local" });
  userId = null;
  await clearLocalAccountData();
  try {
    localStorage.removeItem(LINKED_KEY);
    localStorage.removeItem(OUTBOX_KEY);
  } catch { /* ignore */ }
  writeCursors(null);
  setStatus({ email: null, state: "off", lastSynced: null, error: null });
}

/** Remove synced (non-demo) rows and synced settings from this browser. */
async function clearLocalAccountData(): Promise<void> {
  writeCursors(null);
  applyingRemote = true;
  try {
    await db.transaction("rw", [...LOCAL_TABLES.map(table), db.settings], async () => {
      for (const t of LOCAL_TABLES) {
        const ids = await table(t).filter((r) => !r.isDemo).primaryKeys();
        await table(t).bulkDelete(ids);
      }
      const keys = (await db.settings.toCollection().primaryKeys()).map(String).filter((k) => !LOCAL_ONLY_SETTINGS.has(k));
      await db.settings.bulkDelete(keys);
    });
  } finally {
    applyingRemote = false;
  }
}

/** Delete every cloud row for the signed-in user (used by "Wipe all data"). */
export async function wipeCloud(): Promise<void> {
  const c = supabase();
  if (!c || !userId) return;
  writeOutbox([]);
  writeCursors(null);
  for (const t of [...LOCAL_TABLES.map((t) => TABLES[t].remote), "settings"]) {
    const { error } = await c.from(t).delete().eq("user_id", userId);
    if (error) throw error;
  }
}

export function isSignedIn(): boolean {
  return userId !== null;
}

/** Internal helpers exposed for unit tests only. */
export const __test = { toRemote, toLocal };
