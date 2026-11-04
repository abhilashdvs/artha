import { addDays, format, setDate, subDays, subMonths } from "date-fns";
import { db, seedDefaults, setSetting } from "./db";
import type { Account, Loan, PaymentMethod, Subscription, Txn } from "./types";
import { ACCOUNT_COLORS, mulberry32, uid } from "./utils";

// ─────────────────────────────────────────────────────────────
// Demo mode: realistic 6 months of Indian personal-finance data.
// Everything is flagged isDemo=true and wiped by clearDemo().
// ─────────────────────────────────────────────────────────────

export async function seedDemo(): Promise<void> {
  // Idempotent: never stack a second copy of demo data.
  if ((await db.accounts.filter((a) => a.isDemo === true).count()) > 0) return;
  await seedDefaults();
  const rand = mulberry32(42);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const now = new Date().toISOString();

  const cats = await db.categories.toArray();
  const catId = (name: string) => cats.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id;

  // ── Accounts ──
  const hdfc: Account = {
    id: uid(), name: "HDFC Salary Account", type: "bank", subtype: "salary", bankName: "HDFC Bank",
    openingBalance: 18500000, color: ACCOUNT_COLORS[0], isActive: true, isDemo: true, createdAt: now,
  };
  const icici: Account = {
    id: uid(), name: "ICICI Savings", type: "bank", subtype: "savings", bankName: "ICICI Bank",
    openingBalance: 6200000, color: ACCOUNT_COLORS[1], isActive: true, isDemo: true, createdAt: now,
  };
  const cash: Account = {
    id: uid(), name: "Cash in Hand", type: "cash", openingBalance: 800000,
    color: ACCOUNT_COLORS[2], isActive: true, isDemo: true, createdAt: now,
  };
  const regalia: Account = {
    id: uid(), name: "HDFC Regalia Credit Card", type: "credit_card", bankName: "HDFC Bank",
    openingBalance: 0, creditLimit: 30000000, billingDay: 5, color: ACCOUNT_COLORS[3],
    isActive: true, isDemo: true, createdAt: now,
  };
  const apay: Account = {
    id: uid(), name: "ICICI Amazon Pay Card", type: "credit_card", bankName: "ICICI Bank",
    openingBalance: 0, creditLimit: 15000000, billingDay: 1, color: ACCOUNT_COLORS[6],
    isActive: true, isDemo: true, createdAt: now,
  };
  const ppf: Account = {
    id: uid(), name: "PPF / Investments", type: "investment", openingBalance: 45000000,
    color: ACCOUNT_COLORS[7], isActive: true, isDemo: true, createdAt: now,
  };
  await db.accounts.bulkAdd([hdfc, icici, cash, regalia, apay, ppf]);

  // ── Payment methods (lenses onto accounts — never hold balances) ──
  const pms: PaymentMethod[] = [
    { id: uid(), name: "GPay (HDFC)", type: "upi", linkedAccountId: hdfc.id, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "PhonePe (ICICI)", type: "upi", linkedAccountId: icici.id, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "Cash", type: "cash", linkedAccountId: cash.id, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "Regalia Card", type: "credit_card", linkedAccountId: regalia.id, isActive: true, isDemo: true, createdAt: now },
  ];
  await db.paymentMethods.bulkAdd(pms);
  const pmFor = (accountId: string) => pms.find((p) => p.linkedAccountId === accountId)?.id;

  const txns: Txn[] = [];
  const T = (
    type: Txn["type"], amountInr: number, date: Date, description: string,
    opts: Partial<Txn> = {},
  ) => {
    txns.push({
      id: uid(), type, amount: Math.round(amountInr * 100), date: date.toISOString(),
      description, accountId: hdfc.id, tags: [], isDemo: true, createdAt: now, ...opts,
    });
  };

  for (let m = 5; m >= 0; m--) {
    const monthStart = setDate(subMonths(new Date(), m), 1);

    // salary + fixed commitments
    T("income", 125000, monthStart, "Salary — Acme Corp", { accountId: hdfc.id, categoryId: catId("Salary") });
    T("expense", 28000, addDays(monthStart, 3), "House Rent", { accountId: hdfc.id, categoryId: catId("Rent"), paymentMethodId: pmFor(hdfc.id) });
    T("investment", 15000, addDays(monthStart, 5), "SIP — Index Fund", { accountId: hdfc.id, categoryId: catId("Investments"), toAccountId: ppf.id });
    T("expense", 1800, addDays(monthStart, 7), "Electricity Bill — BESCOM", { accountId: hdfc.id, categoryId: catId("Utilities & Bills"), merchant: "BESCOM" });
    T("expense", 999, addDays(monthStart, 8), "ACT Fibernet", { accountId: hdfc.id, categoryId: catId("Utilities & Bills"), merchant: "ACT" });
    T("expense", 719, addDays(monthStart, 9), "Jio Recharge", { accountId: hdfc.id, categoryId: catId("Utilities & Bills"), merchant: "Jio" });
    T("expense", 2300, addDays(monthStart, 10), "Cult.fit Membership", { accountId: regalia.id, categoryId: catId("Health"), merchant: "Cult.fit" });

    // groceries — weekly
    for (let w = 0; w < 4; w++) {
      T("expense", between(1200, 2400), addDays(monthStart, 2 + w * 7), "Groceries — BigBasket", {
        accountId: pick([hdfc.id, icici.id]), categoryId: catId("Groceries"), merchant: "BigBasket",
      });
      T("expense", between(150, 450), addDays(monthStart, 4 + w * 7), "Vegetables — Local Market", {
        accountId: cash.id, categoryId: catId("Groceries"), paymentMethodId: pmFor(cash.id),
      });
    }

    // food delivery — grows over months (lifestyle creep for insights)
    const fdCount = 6 + (5 - m) * 2;
    for (let i = 0; i < fdCount; i++) {
      const merchant = pick(["Zomato", "Swiggy"]);
      T("expense", between(180, 650), addDays(monthStart, between(1, 27)), `${merchant} order`, {
        accountId: pick([hdfc.id, regalia.id]), categoryId: catId("Food Delivery"), merchant,
      });
    }
    // quick commerce small purchases
    for (let i = 0; i < 5 + (5 - m); i++) {
      const merchant = pick(["Zepto", "Blinkit", "Instamart"]);
      T("expense", between(90, 380), addDays(monthStart, between(1, 27)), `${merchant} order`, {
        accountId: hdfc.id, categoryId: catId("Groceries"), merchant: merchant === "Instamart" ? "Swiggy Instamart" : merchant,
      });
    }

    // transport
    for (let i = 0; i < 3; i++) {
      T("expense", between(500, 900), addDays(monthStart, between(1, 27)), "Petrol — HP", {
        accountId: hdfc.id, categoryId: catId("Fuel"), merchant: "HP Petrol",
      });
    }
    for (let i = 0; i < 4; i++) {
      T("expense", between(120, 420), addDays(monthStart, between(1, 27)), pick(["Uber ride", "Ola ride", "Rapido"]), {
        accountId: pick([hdfc.id, icici.id]), categoryId: catId("Cabs & Auto"), merchant: pick(["Uber", "Ola", "Rapido"]),
      });
    }

    // shopping — rising streak
    const shopCount = 2 + Math.max(0, 4 - m);
    for (let i = 0; i < shopCount; i++) {
      T("expense", between(700, 3500), addDays(monthStart, between(1, 27)), pick(["Amazon order", "Flipkart order"]), {
        accountId: pick([regalia.id, apay.id, hdfc.id]),
        categoryId: catId("Shopping"),
        merchant: pick(["Amazon", "Flipkart"]),
      });
    }

    // subscriptions & entertainment
    T("expense", 649, addDays(monthStart, 12), "Netflix", { accountId: regalia.id, categoryId: catId("Subscriptions"), merchant: "Netflix" });
    T("expense", 119, addDays(monthStart, 14), "Spotify", { accountId: regalia.id, categoryId: catId("Subscriptions"), merchant: "Spotify" });
    T("expense", 299, addDays(monthStart, 15), "YouTube Premium", { accountId: regalia.id, categoryId: catId("Subscriptions"), merchant: "YouTube" });
    if (rand() > 0.4) {
      T("expense", between(400, 1200), addDays(monthStart, between(10, 25)), "Movie — PVR", {
        accountId: pick([hdfc.id, regalia.id]), categoryId: catId("Entertainment"), merchant: "PVR",
      });
    }

    // dining out
    for (let i = 0; i < 3; i++) {
      T("expense", between(600, 1800), addDays(monthStart, between(1, 27)), pick(["Dinner — Toit", "Lunch — Truffles", "Cafe — Third Wave"]), {
        accountId: pick([hdfc.id, regalia.id]), categoryId: catId("Eating Out"), merchant: pick(["Toit", "Truffles", "Third Wave"]),
      });
    }

    // family
    T("expense", 5000, addDays(monthStart, 6), "Amma — monthly support", { accountId: hdfc.id, categoryId: catId("Other") });

    // credit card bill payment (NOT an expense)
    T("cc_payment", between(15000, 32000), addDays(monthStart, 22), "Regalia bill payment", {
      accountId: hdfc.id, toAccountId: regalia.id,
    });

    // own-account transfer (NOT an expense)
    T("transfer", 10000, addDays(monthStart, 2), "Move to ICICI savings", { accountId: hdfc.id, toAccountId: icici.id });

    // occasional refund — reduces its category
    if (rand() > 0.5) {
      T("refund", between(200, 900), addDays(monthStart, between(10, 26)), "Amazon refund", {
        accountId: apay.id, categoryId: catId("Shopping"), merchant: "Amazon",
      });
    }
  }

  // ── Lending & borrowing (principal accrues via linked txns) ──
  const loanRahul: Loan = {
    id: uid(), direction: "lent", personName: "Rahul (friend)", amount: 0,
    dueDate: format(addDays(new Date(), 12), "yyyy-MM-dd"),
    notes: "Bike down payment", status: "open", isDemo: true, createdAt: now,
  };
  const loanMeera: Loan = {
    id: uid(), direction: "lent", personName: "Meera (cousin)", amount: 0,
    dueDate: format(subDays(new Date(), 10), "yyyy-MM-dd"),
    notes: "Medical emergency", status: "open", isDemo: true, createdAt: now,
  };
  const loanSuresh: Loan = {
    id: uid(), direction: "borrowed", personName: "Suresh (colleague)", amount: 0,
    dueDate: format(addDays(new Date(), 45), "yyyy-MM-dd"),
    notes: "Laptop purchase bridge", status: "open", isDemo: true, createdAt: now,
  };
  await db.loans.bulkAdd([loanRahul, loanMeera, loanSuresh]);

  T("lend", 12000, subDays(new Date(), 68), "Lent to Rahul", { accountId: hdfc.id, loanId: loanRahul.id });
  T("lend_repayment", 5000, subDays(new Date(), 20), "Rahul partial repayment", { accountId: hdfc.id, loanId: loanRahul.id });
  T("lend", 8000, subDays(new Date(), 100), "Lent to Meera", { accountId: icici.id, loanId: loanMeera.id });
  T("borrow", 20000, subDays(new Date(), 45), "Borrowed from Suresh", { accountId: hdfc.id, loanId: loanSuresh.id });
  T("borrow_repayment", 8000, subDays(new Date(), 8), "Suresh repayment (part)", { accountId: hdfc.id, loanId: loanSuresh.id });

  await db.transactions.bulkAdd(txns);

  // ── Subscriptions ──
  const due = (d: Date) => format(d, "yyyy-MM-dd");
  const subs: Subscription[] = [
    { id: uid(), name: "Netflix", amount: 64900, cycle: "monthly", nextDueDate: due(addDays(new Date(), 9)), accountId: regalia.id, categoryId: catId("Subscriptions"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "Spotify", amount: 11900, cycle: "monthly", nextDueDate: due(addDays(new Date(), 11)), accountId: regalia.id, categoryId: catId("Subscriptions"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "YouTube Premium", amount: 29900, cycle: "monthly", nextDueDate: due(addDays(new Date(), 12)), accountId: regalia.id, categoryId: catId("Subscriptions"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "Amazon Prime", amount: 29900, cycle: "monthly", nextDueDate: due(addDays(new Date(), 6)), accountId: apay.id, categoryId: catId("Subscriptions"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "Cult.fit Gym", amount: 230000, cycle: "monthly", nextDueDate: due(addDays(new Date(), 4)), accountId: regalia.id, categoryId: catId("Health"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "ACT Fibernet", amount: 99900, cycle: "monthly", nextDueDate: due(addDays(new Date(), 2)), accountId: hdfc.id, categoryId: catId("Utilities & Bills"), isActive: true, isDemo: true, createdAt: now },
    { id: uid(), name: "House Rent", amount: 2800000, cycle: "monthly", nextDueDate: due(addDays(new Date(), 5)), accountId: hdfc.id, categoryId: catId("Rent"), isActive: true, isDemo: true, createdAt: now },
  ];
  await db.subscriptions.bulkAdd(subs);

  // ── Budgets ──
  await db.budgets.bulkAdd([
    { id: uid(), amount: 9000000, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), categoryId: catId("Food & Dining"), amount: 1200000, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), categoryId: catId("Shopping"), amount: 600000, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), categoryId: catId("Entertainment"), amount: 400000, isActive: true, isDemo: true, createdAt: now },
    { id: uid(), categoryId: catId("Transport"), amount: 500000, isActive: true, isDemo: true, createdAt: now },
  ]);

  // ── Goals ──
  await db.goals.bulkAdd([
    { id: uid(), name: "Emergency Fund", targetAmount: 60000000, currentAmount: 21000000, targetDate: due(addDays(new Date(), 540)), isCompleted: false, isDemo: true, createdAt: now },
    { id: uid(), name: "New Bike", targetAmount: 18000000, currentAmount: 4500000, targetDate: due(addDays(new Date(), 400)), isCompleted: false, isDemo: true, createdAt: now },
    { id: uid(), name: "Japan Trip", targetAmount: 25000000, currentAmount: 3000000, targetDate: due(addDays(new Date(), 700)), isCompleted: false, isDemo: true, createdAt: now },
  ]);

  await setSetting("demoMode", true);
}

/** Remove only demo-flagged rows; user data is untouched. */
export async function clearDemo(): Promise<void> {
  await db.transaction(
    "rw",
    [db.accounts, db.paymentMethods, db.transactions, db.loans, db.subscriptions, db.goals, db.budgets],
    async () => {
      await Promise.all([
        db.accounts.filter((r) => !!r.isDemo).delete(),
        db.paymentMethods.filter((r) => !!r.isDemo).delete(),
        db.transactions.filter((r) => !!r.isDemo).delete(),
        db.loans.filter((r) => !!r.isDemo).delete(),
        db.subscriptions.filter((r) => !!r.isDemo).delete(),
        db.goals.filter((r) => !!r.isDemo).delete(),
        db.budgets.filter((r) => !!r.isDemo).delete(),
      ]);
    },
  );
  await setSetting("demoMode", false);
}

/** Nuclear option: clear EVERYTHING including settings, then re-seed defaults. */
export async function wipeAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [db.accounts, db.paymentMethods, db.categories, db.transactions, db.loans, db.subscriptions, db.goals, db.budgets, db.settings],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.paymentMethods.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.loans.clear(),
        db.subscriptions.clear(),
        db.goals.clear(),
        db.budgets.clear(),
        db.settings.clear(),
      ]);
    },
  );
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("artha:setting:"));
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  await seedDefaults(true); // bypass the once-per-session guard so defaults come back after a wipe
}
