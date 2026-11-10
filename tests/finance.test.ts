// Regression tests for Artha's financial rules and sync data mapping.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "date-fns";
import {
  budgetProgress, computeBalances, expenseTotal, incomeTotal, loanSummaries, netWorth, savingsRateOf,
  subscriptionMonthlyCost, subscriptionYearlyCost, radarLevel, budgetStage, suggestBudget, goalStatus,
} from "../src/lib/finance";
import { categoryBreakdown, needsWantsSplit } from "../src/lib/analytics";
import { generateInsights } from "../src/lib/insights";
import { formatINR, toPaise } from "../src/lib/money";
import type { Account, Budget, Category, Loan, Subscription, Txn } from "../src/lib/types";
import { __test } from "../src/lib/sync";

const now = new Date().toISOString();
const acct = (id: string, type: Account["type"], opening = 0): Account =>
  ({ id, name: id, type, openingBalance: opening, isActive: true, createdAt: now });
let n = 0;
const txn = (p: Partial<Txn> & Pick<Txn, "type" | "amount" | "accountId">): Txn =>
  ({ id: `t${++n}`, date: now, description: "x", tags: [], createdAt: now, ...p });

const bank = acct("bank", "bank", 100_000_00);
const card = acct("card", "credit_card", 0);
const ppf = acct("ppf", "investment", 0);
const cats: Category[] = [
  { id: "food", name: "Food", kind: "expense", isNeed: true, color: "#000", isArchived: false, createdAt: now },
  { id: "swiggy", name: "Delivery", parentId: "food", kind: "expense", isNeed: false, color: "#000", isArchived: false, createdAt: now },
];

test("money: rupees ↔ paise is exact, no floating point drift", () => {
  assert.equal(toPaise("1,234.56"), 123456);
  assert.equal(toPaise("₹ 0.1"), 10);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise("abc"), 0);
  assert.equal(formatINR(123456), "₹1,234.56");
  assert.equal(formatINR(1_00_000_00), "₹1,00,000");
  assert.equal(formatINR(-500), "−₹5");
});

test("transfers and card bill payments are never income or expense", () => {
  const txns = [
    txn({ type: "transfer", amount: 5000_00, accountId: "bank", toAccountId: "card" }),
    txn({ type: "cc_payment", amount: 2000_00, accountId: "bank", toAccountId: "card" }),
  ];
  assert.equal(incomeTotal(txns), 0);
  assert.equal(expenseTotal(txns), 0);
  const bal = computeBalances([bank, card], txns);
  assert.equal(bal.get("bank"), 100_000_00 - 7000_00);
  assert.equal(bal.get("card"), 7000_00);
});

test("card purchase is an expense once; paying the bill is not a second expense", () => {
  const txns = [
    txn({ type: "expense", amount: 3000_00, accountId: "card", categoryId: "food" }),
    txn({ type: "cc_payment", amount: 3000_00, accountId: "bank", toAccountId: "card" }),
  ];
  assert.equal(expenseTotal(txns), 3000_00);
  const bal = computeBalances([bank, card], txns);
  assert.equal(bal.get("card"), 0); // card fully paid
  assert.equal(bal.get("bank"), 97_000_00);
});

test("lending is not spending and repayments are not income", () => {
  const loan: Loan = { id: "L1", personName: "Ravi", direction: "lent", amount: 0, status: "open", createdAt: now };
  const txns = [
    txn({ type: "lend", amount: 12_000_00, accountId: "bank", loanId: "L1" }),
    txn({ type: "lend_repayment", amount: 5_000_00, accountId: "bank", loanId: "L1" }),
  ];
  assert.equal(expenseTotal(txns), 0);
  assert.equal(incomeTotal(txns), 0);
  const [s] = loanSummaries([loan], txns);
  assert.equal(s.amount, 12_000_00);
  assert.equal(s.paid, 5_000_00);
  assert.equal(s.outstanding, 7_000_00);
  assert.equal(s.loan.status, "partial");
  const nw = netWorth([bank], computeBalances([bank], txns), [loan], txns);
  // money lent out is still yours (a receivable): net worth unchanged
  assert.equal(nw.total, 100_000_00);
});

test("borrowing is a liability, not income", () => {
  const loan: Loan = { id: "B1", personName: "Asha", direction: "borrowed", amount: 0, status: "open", createdAt: now };
  const txns = [txn({ type: "borrow", amount: 4_000_00, accountId: "bank", loanId: "B1" })];
  assert.equal(incomeTotal(txns), 0);
  const nw = netWorth([bank], computeBalances([bank], txns), [loan], txns);
  assert.equal(nw.borrowedOutstanding, 4_000_00);
  assert.equal(nw.total, 100_000_00);
});

test("refunds reduce their category instead of counting as income", () => {
  const txns = [
    txn({ type: "expense", amount: 1000_00, accountId: "bank", categoryId: "food" }),
    txn({ type: "refund", amount: 300_00, accountId: "bank", categoryId: "food" }),
  ];
  assert.equal(incomeTotal(txns), 0);
  assert.equal(expenseTotal(txns), 700_00);
  assert.equal(categoryBreakdown(txns, cats)[0].value, 700_00);
});

test("investments move money but are not consumption", () => {
  const txns = [txn({ type: "investment", amount: 15_000_00, accountId: "bank", toAccountId: "ppf" })];
  assert.equal(expenseTotal(txns), 0);
  const bal = computeBalances([bank, ppf], txns);
  assert.equal(bal.get("bank"), 85_000_00);
  assert.equal(bal.get("ppf"), 15_000_00);
  assert.equal(netWorth([bank, ppf], bal, [], txns).total, 100_000_00);
});

test("savings rate and needs/wants split", () => {
  const txns = [
    txn({ type: "income", amount: 100_000_00, accountId: "bank" }),
    txn({ type: "expense", amount: 30_000_00, accountId: "bank", categoryId: "food" }),
    txn({ type: "expense", amount: 10_000_00, accountId: "bank", categoryId: "swiggy" }),
  ];
  assert.equal(savingsRateOf(txns), 60);
  assert.deepEqual(needsWantsSplit(txns, cats), { need: 30_000_00, want: 10_000_00, other: 0 });
});

test("category budgets include child categories; inactive budgets are ignored", () => {
  const month = format(new Date(), "yyyy-MM");
  const budgets: Budget[] = [
    { id: "b1", categoryId: "food", amount: 5000_00, isActive: true, createdAt: now },
    { id: "b2", amount: 1_00_000_00, isActive: false, createdAt: now },
  ];
  const txns = [
    txn({ type: "expense", amount: 2000_00, accountId: "bank", categoryId: "food" }),
    txn({ type: "expense", amount: 1000_00, accountId: "bank", categoryId: "swiggy" }),
  ];
  const progress = budgetProgress(budgets, txns, month, cats);
  assert.equal(progress.length, 1);
  assert.equal(progress[0].spent, 3000_00);
  assert.equal(progress[0].remaining, 2000_00);
});

test("subscription costs normalise to monthly / yearly", () => {
  const subs: Subscription[] = [
    { id: "s1", name: "Netflix", amount: 649_00, cycle: "monthly", nextDueDate: "2026-12-01", isActive: true, createdAt: now },
    { id: "s2", name: "Prime", amount: 1499_00, cycle: "yearly", nextDueDate: "2026-12-01", isActive: true, createdAt: now },
  ];
  assert.equal(subscriptionYearlyCost(subs), 649_00 * 12 + 1499_00);
  assert.equal(subscriptionMonthlyCost(subs), Math.round((649_00 * 12 + 1499_00) / 12));
});

test("sync: a transaction survives the local → cloud → local round trip", () => {
  const original: Txn = {
    id: "0b6f1c62-4c4e-4f8e-9f0e-1d2c3b4a5f60", type: "expense", amount: 45_050, date: "2026-11-05T14:30:00.000Z",
    description: "Dinner", accountId: "a0000000-0000-4000-8000-000000000001", categoryId: undefined,
    merchant: "", tags: ["friends"], createdAt: "2026-11-05T14:31:00.000Z", isDemo: false,
  };
  const remote = __test.toRemote("transactions", original as never, "u1");
  assert.equal(remote.user_id, "u1");
  assert.equal(remote.amount, 45_050);
  assert.equal(remote.account_id, original.accountId);
  assert.equal(remote.category_id, null); // undefined → null
  assert.equal(remote.merchant, null); // "" → null
  assert.equal("is_demo" in remote, false); // demo flag never uploaded
  // Postgres returns timestamps with an offset; they must come back as the same instant
  const back = __test.toLocal("transactions", { ...remote, date: "2026-11-05T14:30:00+00:00", created_at: "2026-11-05T14:31:00+00:00" });
  assert.equal(back.date, original.date);
  assert.equal(back.amount, original.amount);
  assert.deepEqual(back.tags, ["friends"]);
  assert.equal("categoryId" in back, false); // null → absent
});

test("sync: category 'need' null is preserved and date-only fields stay yyyy-MM-dd", () => {
  const cat = __test.toLocal("categories", { id: "c", name: "Other", kind: "expense", is_need: null, color: "#000", is_archived: false, created_at: now });
  assert.equal(cat.isNeed, null);
  const sub = __test.toLocal("subscriptions", { id: "s", name: "Gym", amount: 2300_00, cycle: "monthly", next_due_date: "2026-11-09", is_active: true, created_at: now });
  assert.equal(sub.nextDueDate, "2026-11-09");
});

test("Subscription Radar: red under 3 days (incl. overdue), yellow within 10, clear after", () => {
  assert.equal(radarLevel(-1), "red");
  assert.equal(radarLevel(0), "red");
  assert.equal(radarLevel(2), "red");
  assert.equal(radarLevel(3), "yellow");
  assert.equal(radarLevel(10), "yellow");
  assert.equal(radarLevel(11), "clear");
});

test("sync: subscription payment method is mapped to the cloud and back", () => {
  const sub = { id: "s", name: "Netflix", amount: 64900, cycle: "monthly", nextDueDate: "2026-11-14", paymentMethodId: "pm-1", accountId: "a-1", isActive: true, createdAt: now };
  const remote = __test.toRemote("subscriptions", sub, "u1");
  assert.equal(remote.payment_method_id, "pm-1");
  assert.equal(__test.toLocal("subscriptions", remote).paymentMethodId, "pm-1");
});

test("a settled loan no longer counts as owed, even if not fully repaid (written off)", () => {
  const loan: Loan = { id: "L9", personName: "Kiran", direction: "lent", amount: 0, status: "settled", createdAt: now };
  const txns = [
    txn({ type: "lend", amount: 5_000_00, accountId: "bank", loanId: "L9" }),
    txn({ type: "lend_repayment", amount: 3_000_00, accountId: "bank", loanId: "L9" }),
  ];
  const [s] = loanSummaries([loan], txns);
  assert.equal(s.outstanding, 0);
  assert.equal(netWorth([bank], computeBalances([bank], txns), [loan], txns).lentOutstanding, 0);
});

test("insights: food delivery vs last month, savings tip, and small purchases", () => {
  const thisMonth = new Date();
  const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 10, 12);
  const at = (d: Date) => d.toISOString();
  const txns: Txn[] = [
    txn({ type: "expense", amount: 3_000_00, accountId: "bank", merchant: "Swiggy", date: at(lastMonth) }),
    txn({ type: "expense", amount: 4_500_00, accountId: "bank", merchant: "Zomato", date: at(thisMonth) }),
    ...Array.from({ length: 8 }, () => txn({ type: "expense", amount: 150_00, accountId: "bank", description: "tea", date: at(thisMonth) })),
  ];
  const ins = generateInsights(txns, cats, [], []);
  const fd = ins.find((i) => i.id === "food-delivery");
  assert.ok(fd, "food delivery insight");
  assert.match(fd!.title, /₹4,500.*50% more/);
  assert.match(fd!.action ?? "", /₹1,350 a month/); // exactly 30% of ₹4,500
  const sp = ins.find((i) => i.id === "small-purchases");
  assert.ok(sp, "small purchases insight");
  assert.match(sp!.title, /₹1,200/);
});

test("insights: subscription yearly cost and lent vs repaid", () => {
  const subs: Subscription[] = [
    { id: "s1", name: "Netflix", amount: 649_00, cycle: "monthly", nextDueDate: "2026-12-01", isActive: true, createdAt: now },
  ];
  const loan: Loan = { id: "L5", personName: "Ravi", direction: "lent", amount: 0, status: "open", createdAt: now };
  const txns = [
    txn({ type: "lend", amount: 12_000_00, accountId: "bank", loanId: "L5" }),
    txn({ type: "lend_repayment", amount: 5_000_00, accountId: "bank", loanId: "L5" }),
  ];
  const ins = generateInsights(txns, cats, [], [loan], subs);
  assert.match(ins.find((i) => i.id === "subscriptions-cost")!.title, /₹649 a month — ₹7,788 a year/);
  assert.match(ins.find((i) => i.id === "lent-vs-repaid")!.title, /lent ₹12,000, and ₹5,000 has been repaid/);
});

test("budgets: alert stages at 50 / 75 / 90 / 100 %", () => {
  assert.equal(budgetStage(30).label, "On track");
  assert.equal(budgetStage(50).label, "Half used");
  assert.equal(budgetStage(80).label, "75% used");
  assert.equal(budgetStage(95).label, "Almost used up");
  assert.equal(budgetStage(120).label, "Over budget");
});

test("budgets: suggested limit = 3-month average incl. sub-categories, rounded up to ₹500", () => {
  const now = new Date(2026, 10, 15); // 15 Nov 2026
  const mid = (m: number) => new Date(2026, m, 10, 12).toISOString();
  const txns = [
    txn({ type: "expense", amount: 4_000_00, accountId: "bank", categoryId: "food", date: mid(9) }),   // Oct
    txn({ type: "expense", amount: 2_000_00, accountId: "bank", categoryId: "swiggy", date: mid(8) }), // Sep (child)
    txn({ type: "expense", amount: 9_999_00, accountId: "bank", categoryId: "food", date: mid(10) }),  // Nov — current month ignored
  ];
  const s = suggestBudget(txns, cats, "food", now)!;
  assert.equal(s.months, 2);
  assert.equal(s.average, 3_000_00);
  assert.equal(s.suggested, 3_000_00);
  assert.equal(suggestBudget([], cats, "food", now), null);
});

test("goals: on track, behind, overdue, and a per-month amount even with < 1 month left", () => {
  const now = new Date(2026, 10, 15);
  const base = { id: "g", name: "Bike", targetAmount: 120_000_00, isCompleted: false, createdAt: new Date(2026, 4, 15).toISOString() } as const;
  // created 15 May, target 15 May 2027 → half the time gone; 60k saved = on track
  assert.equal(goalStatus({ ...base, currentAmount: 60_000_00, targetDate: "2027-05-15" }, now).status, "on-track");
  assert.equal(goalStatus({ ...base, currentAmount: 20_000_00, targetDate: "2027-05-15" }, now).status, "behind");
  assert.equal(goalStatus({ ...base, currentAmount: 20_000_00, targetDate: "2026-11-01" }, now).status, "overdue");
  const soon = goalStatus({ ...base, currentAmount: 110_000_00, targetDate: "2026-11-30" }, now);
  assert.equal(soon.monthlyNeeded, 10_000_00);
  assert.equal(goalStatus({ ...base, currentAmount: 120_000_00, targetDate: "2027-05-15" }, now).status, "done");
});
