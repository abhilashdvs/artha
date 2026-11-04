# Artha — Personal Finance & Expense Intelligence

Artha (अर्थ — *wealth, meaning*) is a local-first personal finance app for India. It tracks
accounts, credit cards, transactions, budgets, subscriptions, lending/borrowing, goals and
income, then turns that data into analytics, plain-language insights and a monthly financial
health score — all in INR, all in your browser.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:3000
```

First run seeds default categories (Food & Dining, Transport, Housing & Utilities, …) and
payment methods (UPI, Cash, Debit Card). Open **Settings → Demo mode** to explore with
6 months of realistic sample data; wipe it any time. Your real data never mixes with demo rows.

```bash
npm run build      # production build
npx tsc --noEmit   # type check
```

## What's inside

| Area | Highlights |
| --- | --- |
| Dashboard | Net worth, month snapshot, savings rate, health score, upcoming dues |
| Accounts | Bank / cash / wallet / investment accounts + credit cards with limit tracking |
| Transactions | Full CRUD, filters, CSV/Excel import wizard with duplicate detection |
| Categories | Hierarchy, need/want tags, fixed/variable flow, safe delete with merge |
| Budgets | Monthly overall + per-category budgets with progress and breach alerts |
| Subscriptions | Recurring costs, monthly/yearly burn, due-soon list |
| Lending | Money lent / borrowed, repayments, recovery rate, overdue tracking |
| Income | Sources, monthly trend, average |
| Analytics | Trends, category/merchant/payment-method splits, needs-vs-wants, insights |
| Goals | Savings goals with progress; investment txns can feed a goal |
| Reports | Monthly + category summaries, full transaction export (CSV) |
| Settings | Demo mode, health-score weights, backup, wipe |

## Financial rules (the opinionated core)

- **All money is stored as integer paise** — no floats anywhere.
- `transfer` and `cc_payment` move money between your own accounts — they are **never**
  income or expense.
- `lend` / `borrow` and their repayments are tracked separately — lending money out is **not**
  consumption, and receiving it back is **not** income.
- `refund` reduces the expense of its own category (netted, not separate income).
- `investment` is its own type, kept out of spending analytics.
- **Payment methods** (UPI app, card, cash) are lenses onto accounts — they never hold
  balances themselves.
- Every insight shows its calculation (`insight.calc`) — no black-box numbers.
- Demo data is clearly labelled and removable; real use starts from honest empty states.

## Tech

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Dexie** (IndexedDB) + `dexie-react-hooks` — local-first storage, live queries
- **Recharts**, **date-fns**, **papaparse** + **xlsx**, **lucide-react**, **next-themes**

## Data & architecture

Everything lives in the browser's IndexedDB today — no server, no account, works offline.
The data layer (`src/lib/db.ts`) is isolated behind CRUD functions, and
[`supabase/schema.sql`](supabase/schema.sql) mirrors every table (with Postgres RLS
policies) as the future cloud-sync target. Swapping Dexie for Supabase means touching only
the db/hooks layer — pages and analytics stay pure.

## Project layout

```
src/
  app/            # 12 routes: dashboard, accounts, transactions, categories,
                  # budgets, subscriptions, lending, income, analytics, goals,
                  # reports, settings
  components/     # UI primitives, charts, TxnForm, modals
  lib/
    types.ts      # canonical entity shapes
    db.ts         # Dexie schema, CRUD, settings, seedDefaults
    finance.ts    # balances, totals, budgets, loans, net worth (pure)
    analytics.ts  # trends, breakdowns, splits (pure)
    insights.ts   # insight engine (pure)
    healthScore.ts# monthly 0–100 score: savings/budget/debt/lending
    csv.ts        # import wizard + exports
    demo.ts       # demo seed / clear / wipe
    hooks.ts      # dexie-react-hooks live queries
supabase/
  schema.sql      # future Postgres schema + RLS (not wired up yet)
```

## Roadmap

- [ ] Supabase auth + sync (schema ready in `supabase/schema.sql`)
- [ ] Recurring transaction auto-creation from subscriptions
- [ ] PWA / offline install
- [ ] Vercel deployment
