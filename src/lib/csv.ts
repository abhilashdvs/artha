import Papa from "papaparse";
import * as XLSX from "xlsx";
import { format, isValid, parse } from "date-fns";
import type { Category, Txn } from "./types";
import type { CategorySlice, MonthPoint } from "./analytics";
import { toPaise, toRupees } from "./money";
import { fmtDay } from "./dates";
import { db } from "./db";
import { uid } from "./utils";

// ─────────────────────────────────────────────────────────────
// CSV / Excel export + import with duplicate detection and
// category suggestion (keyword rules + learned merchant map).
// ─────────────────────────────────────────────────────────────

/** Full transaction export with account/category/payment-method names joined in. */
export async function exportTxnsCsv(txns: Txn[]): Promise<string> {
  const [accounts, categories, pms] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
  ]);
  const acctName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "";
  const pmName = (id?: string) => pms.find((p) => p.id === id)?.name ?? "";
  const rows = txns.map((t) => ({
    date: fmtDay(t.date),
    type: t.type,
    description: t.description,
    merchant: t.merchant ?? "",
    category: catName(t.categoryId),
    account: acctName(t.accountId),
    to_account: t.toAccountId ? acctName(t.toAccountId) : "",
    payment_method: pmName(t.paymentMethodId),
    amount_inr: toRupees(t.amount).toFixed(2),
    tags: t.tags.join("|"),
    notes: t.notes ?? "",
  }));
  return Papa.unparse(rows);
}

/** Category spend summary (refunds already netted by categoryBreakdown). */
export function exportCategorySummaryCsv(slices: CategorySlice[]): string {
  return Papa.unparse(
    slices.map((s) => ({
      category: s.name,
      total_inr: toRupees(s.value).toFixed(2),
      share_pct: s.share,
    })),
  );
}

export function exportMonthlySummaryCsv(points: MonthPoint[]): string {
  return Papa.unparse(
    points.map((p) => ({
      month: p.label,
      income_inr: toRupees(p.income).toFixed(2),
      expense_inr: toRupees(p.expense).toFixed(2),
      invested_inr: toRupees(p.invested).toFixed(2),
      savings_inr: toRupees(p.savings).toFixed(2),
      savings_rate_pct: p.savingsRate,
    })),
  );
}

// ── Import ────────────────────────────────────────────────────

export interface ImportPlan {
  accountId: string;
  kind: "generic";
  dateCol: string; // "auto" or a header name
  descCol: string;
  amountCol: string;
  typeCol: string;
  categoryCol: string;
}

export interface ImportItem {
  date: string; // ISO
  description: string;
  amount: number; // paise, positive
  direction: "debit" | "credit";
  suggestedCategoryId?: string;
  include: boolean;
}

const DATE_HEADERS = ["date", "txn date", "transaction date", "value date"];
const DESC_HEADERS = ["description", "narration", "details", "remarks", "particulars", "merchant"];
const DEBIT_HEADERS = ["debit", "withdrawal", "debit amount", "withdrawal amt", "dr"];
const CREDIT_HEADERS = ["credit", "deposit", "credit amount", "deposit amt", "cr"];
const AMOUNT_HEADERS = ["amount", "txn amount", "transaction amount", "amt"];
const TYPE_HEADERS = ["type", "dr/cr", "drcr", "transaction type"];

function findKey(headers: string[], candidates: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const i = lower.findIndex((h) => h === c || h.includes(c));
    if (i >= 0) return headers[i];
  }
  return undefined;
}

const DATE_FORMATS = [
  "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy", "MM/dd/yyyy",
  "d MMM yyyy", "dd-MMM-yyyy", "dd MMM yyyy", "yyyy/MM/dd",
];

function parseDateLoose(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  for (const f of DATE_FORMATS) {
    const d = parse(s, f, new Date());
    if (isValid(d)) return d.toISOString();
  }
  const d = new Date(s);
  return isValid(d) ? d.toISOString() : null;
}

// keyword → seeded category name
const KEYWORD_RULES: [RegExp, string][] = [
  [/zomato|swiggy/i, "Food Delivery"],
  [/zepto|blinkit|instamart|bigbasket|grofers|dmart/i, "Groceries"],
  [/restaurant|cafe|dominos|pizza|kfc|mcdonald|burger|dining/i, "Eating Out"],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa/i, "Shopping"],
  [/netflix|spotify|prime\s*video|amazon\s*prime|hotstar|jiohotstar|youtube|zee5|sonyliv/i, "Subscriptions"],
  [/movie|cinema|pvr|inox|bookmyshow|gaming|steam/i, "Entertainment"],
  [/uber|ola\s*cab|rapido|namma\s*yatri/i, "Cabs & Auto"],
  [/irctc|redbus|metro|bus\s*ticket/i, "Transport"],
  [/petrol|indian\s*oil|hp\s*petrol|bharat\s*petrol|shell|fuel/i, "Fuel"],
  [/rent/i, "Rent"],
  [/electricity|bescom|tneb|jio|airtel|vi\s|vodafone|recharge|broadband|act\s*fibernet|wifi|gas\s*bill|water\s*bill/i, "Utilities & Bills"],
  [/gym|cult\.?fit|pharmacy|apollo|medplus|1mg|hospital|clinic|diagnostic|doctor/i, "Health"],
  [/sip|mutual\s*fund|groww|zerodha|kuvera|etf|stocks?|nps|ppf|fd\s*deposit/i, "Investments"],
  [/school|college|course|udemy|tuition|exam/i, "Education"],
  [/salary|payroll/i, "Salary"],
  [/freelance|upwork|fiverr|consulting/i, "Freelance & Side Income"],
  [/interest|dividend/i, "Interest & Dividends"],
  [/refund|cashback|reversal/i, "Other Income"],
];

function suggestCategoryId(description: string, kind: "expense" | "income", categories: Category[]): string | undefined {
  for (const [re, catName] of KEYWORD_RULES) {
    if (re.test(description)) {
      const cat = categories.find((c) => c.kind === kind && c.name.toLowerCase() === catName.toLowerCase());
      if (cat) return cat.id;
    }
  }
  return undefined;
}

/** Learn description → category from the user's own categorised history. */
function learnCategoryMap(txns: Txn[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    const key = (t.merchant || t.description).toLowerCase().trim();
    if (key) map.set(key, t.categoryId);
  }
  return map;
}

/** Parse a .csv / .xlsx / .xls file into raw string rows (headers as keys). */
export async function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false });
  }
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve(r.data),
      error: reject,
    });
  });
}

/** Turn raw rows into typed import items with category suggestions. */
export function previewImport(
  rows: Record<string, string>[],
  plan: ImportPlan,
  categories: Category[],
): ImportItem[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const pick = (sel: string, candidates: string[]) =>
    sel !== "auto" && headers.includes(sel) ? sel : findKey(headers, candidates);
  const dateKey = pick(plan.dateCol, DATE_HEADERS);
  const descKey = pick(plan.descCol, DESC_HEADERS);
  const debitKey = plan.amountCol === "auto" ? findKey(headers, DEBIT_HEADERS) : undefined;
  const creditKey = plan.amountCol === "auto" ? findKey(headers, CREDIT_HEADERS) : undefined;
  const amountKey = pick(plan.amountCol, AMOUNT_HEADERS);
  const typeKey = pick(plan.typeCol, TYPE_HEADERS);

  const out: ImportItem[] = [];
  for (const r of rows) {
    const dateISO = dateKey ? parseDateLoose(String(r[dateKey] ?? "")) : null;
    const description = (descKey ? String(r[descKey] ?? "").trim() : "") || "Imported transaction";
    let amount = 0;
    let direction: "debit" | "credit" = "debit";

    if (debitKey && toPaise(String(r[debitKey] ?? "")) > 0) {
      amount = toPaise(String(r[debitKey]));
      direction = "debit";
    } else if (creditKey && toPaise(String(r[creditKey] ?? "")) > 0) {
      amount = toPaise(String(r[creditKey]));
      direction = "credit";
    } else if (amountKey) {
      const raw = String(r[amountKey] ?? "");
      amount = Math.abs(toPaise(raw));
      direction = raw.trim().startsWith("-") ? "credit" : "debit";
    }

    const typeCell = typeKey ? String(r[typeKey] ?? "").toLowerCase() : "";
    if (/\bcr(edit)?\b|deposit/.test(typeCell)) direction = "credit";
    if (/\bdr|debit|withdraw/.test(typeCell)) direction = "debit";

    if (!dateISO || amount <= 0) continue;
    const kind = direction === "debit" ? "expense" : "income";
    out.push({
      date: dateISO,
      description,
      amount,
      direction,
      suggestedCategoryId: suggestCategoryId(description, kind, categories),
      include: true,
    });
  }
  return out;
}

/** Insert import items, skipping duplicates of existing transactions. */
export async function runImport(
  items: ImportItem[],
  plan: ImportPlan,
  existing: Txn[],
  categories: Category[],
): Promise<{ inserted: number; dupes: number }> {
  const sig = (d: string, amt: number, desc: string) =>
    `${d.slice(0, 10)}|${amt}|${desc.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`;
  const existingSigs = new Set(existing.map((t) => sig(t.date, t.amount, t.description)));
  const learned = learnCategoryMap(existing);
  const seen = new Set<string>();

  let inserted = 0;
  let dupes = 0;
  for (const item of items) {
    if (!item.include) continue;
    const s = sig(item.date, item.amount, item.description);
    if (existingSigs.has(s) || seen.has(s)) {
      dupes++;
      continue;
    }
    seen.add(s);
    const categoryId =
      item.suggestedCategoryId ??
      learned.get(item.description.toLowerCase().trim()) ??
      undefined;
    await db.transactions.add({
      id: uid(),
      type: item.direction === "debit" ? "expense" : "income",
      amount: item.amount,
      date: item.date,
      description: item.description,
      merchant: item.description,
      accountId: plan.accountId,
      categoryId,
      tags: [],
      createdAt: new Date().toISOString(),
    });
    inserted++;
  }
  return { inserted, dupes };
}
