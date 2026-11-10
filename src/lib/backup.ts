"use client";

import { db } from "./db";

// Full backup / restore of your own data (demo rows excluded) as one JSON file.
// Restoring replaces this device's data; if you're signed in, the change syncs
// to your account like any other edit.

const TABLES = ["accounts", "paymentMethods", "categories", "transactions", "loans", "budgets", "subscriptions", "goals"] as const;
type TableName = (typeof TABLES)[number];
const FORMAT = "artha-backup";

export interface Backup {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
  settings: { key: string; value: unknown }[];
}

export async function exportBackup(): Promise<string> {
  const data = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data[t] = (await (db[t] as any).toArray()).filter((r: { isDemo?: boolean }) => !r.isDemo);
  }
  const settings = (await db.settings.toArray()).filter((s) => s.key !== "demoMode");
  const backup: Backup = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data, settings };
  return JSON.stringify(backup, null, 2);
}

/** Check a file before restoring; returns counts to show the user, or throws a friendly error. */
export function readBackup(text: string): { backup: Backup; counts: Record<TableName, number> } {
  let parsed: Backup;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't an Artha backup (it couldn't be read).");
  }
  if (parsed?.format !== FORMAT || parsed.version !== 1 || typeof parsed.data !== "object") {
    throw new Error("That file isn't an Artha backup.");
  }
  const counts = {} as Record<TableName, number>;
  for (const t of TABLES) {
    const rows = parsed.data[t];
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof (r as { id?: unknown }).id !== "string")) {
      throw new Error(`The backup looks damaged (${t}).`);
    }
    counts[t] = rows.length;
  }
  return { backup: parsed, counts };
}

/** Replace this device's (non-demo) data with the backup. */
export async function restoreBackup(backup: Backup): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tables = TABLES.map((t) => db[t] as any);
  await db.transaction("rw", [...tables, db.settings], async () => {
    for (const t of TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = db[t] as any;
      const mine = await table.filter((r: { isDemo?: boolean }) => !r.isDemo).primaryKeys();
      await table.bulkDelete(mine);
      await table.bulkPut(backup.data[t]);
    }
    for (const s of backup.settings ?? []) {
      if (s && typeof s.key === "string" && s.key !== "demoMode") await db.settings.put(s);
    }
  });
}
