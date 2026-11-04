# AGENTS.md — Artha

Personal finance & expense intelligence web app (India, INR). Local-first: all data lives in
browser IndexedDB via Dexie. No backend yet — `supabase/schema.sql` is a future sync target
only. Do NOT wire up Supabase or deploy unless the user explicitly asks.

## Commands

- `npm run dev` — dev server (localhost:3000)
- `npm run build` — production build (must stay clean). **Never run while `next dev` is
  running** — it clobbers `.next` and the dev server starts 404ing all JS/CSS chunks
  (blank page). Stop dev first, or use `npx tsc --noEmit` for quick verification instead.
- `npx tsc --noEmit` — type check (must stay clean)

## Architecture

- Next.js 14 App Router + TypeScript + Tailwind. All pages are client components
  (`"use client"`) because data is local.
- `src/lib/types.ts` holds the canonical entity shapes — always check it before changing
  fields. Pages consume libs; libs never import pages.
- Data flow: Dexie tables → `src/lib/db.ts` CRUD → `src/lib/hooks.ts` (dexie-react-hooks
  live queries) → pages. Analytics (`finance.ts`, `analytics.ts`, `insights.ts`,
  `healthScore.ts`) are pure functions over in-memory arrays.
- `balances` from `useBalances()` is a `Map<string, number>` (paise).
- Settings sync-read: `setSetting` mirrors to `localStorage["artha:setting:<key>"]`;
  use `getSettingSync` for synchronous reads (e.g. healthScore weights).

## Financial invariants (do not break)

- Money is **integer paise** everywhere. `formatINR` / `toPaise` / `toRupees` in `money.ts`.
- `transfer` / `cc_payment` are not income or expense. `lend` / `borrow` / repayments are
  not consumption or income. `refund` nets against its category. `investment` is separate.
- Payment methods never hold balances; they point at accounts via `linkedAccountId`.
- No hardcoded dashboard numbers. Demo data only via demo mode (`isDemo: true`, wiped by
  `clearDemo()`); real use shows empty states.
- Dates: txns store ISO timestamps; month scoping uses local-date keys (`yyyy-MM`) via
  `dates.ts` helpers, not UTC slicing of raw ISO strings where timezones matter.

## Conventions

- Tailwind tokens only: `bg, card, cardhover, border, ink, muted, faint, accent,
  accentstrong, good, warn, danger`. Badge tones: default/good/bad/warn/accent.
  Btn variants: primary/ghost/danger/outline. `downloadFile(filename, content, mime?)`.
- Modals use the `key`-state re-init pattern — preserve it.
- Insights always show their math in `insight.calc`.
- Keep `tsc --noEmit` and `npm run build` green before committing.

## Git / GitHub

- Repo: `github.com/abhilashdvs/artha` (private, personal account). On machines with the
  `github-personal` SSH host alias use that; otherwise push over HTTPS with the `gh` CLI
  logged in as `abhilashdvs`. Never use the `GIT_TOKEN` env var (work org).
