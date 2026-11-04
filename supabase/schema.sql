-- Artha — Supabase schema (cloud sync)
--
-- The browser (IndexedDB via Dexie) is the app's working copy; when you're
-- signed in, every change is mirrored here and pulled back on other devices.
-- Column names are the snake_case form of the TypeScript fields in
-- src/lib/types.ts (src/lib/sync.ts converts automatically).
--
-- • All money columns are integer PAISE (bigint) — never floats.
-- • Every table has Row Level Security: a user only ever sees their own rows.
-- • Cross-table links (account_id, category_id…) are plain uuids without
--   foreign keys, so rows can sync in any order. user_id is a real FK with
--   ON DELETE CASCADE: deleting your auth user deletes all your data.
-- • Demo data is never synced.
--
-- Apply by pasting into the Supabase SQL editor (safe to re-run).

-- ── accounts ─────────────────────────────────────────────────
create table if not exists public.accounts (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('bank','cash','credit_card','wallet','investment')),
  subtype         text,
  bank_name       text,
  opening_balance bigint not null default 0,          -- paise (signed)
  color           text,
  credit_limit    bigint,                              -- paise, credit cards only
  billing_day     smallint check (billing_day between 1 and 31),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── payment_methods (lenses onto accounts — never hold balances) ──
create table if not exists public.payment_methods (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null,
  type              text not null check (type in ('upi','debit_card','credit_card','netbanking','cash','wallet','other')),
  linked_account_id uuid,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── categories ───────────────────────────────────────────────
create table if not exists public.categories (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  parent_id   uuid,
  kind        text not null check (kind in ('expense','income')),
  is_need     boolean,                                 -- null = unspecified
  flow        text check (flow in ('fixed','variable')),
  color       text not null default '#64748b',
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── transactions ─────────────────────────────────────────────
create table if not exists public.transactions (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type              text not null check (type in (
                      'income','expense','refund','investment',
                      'transfer','cc_payment',
                      'lend','lend_repayment','borrow','borrow_repayment')),
  amount            bigint not null check (amount >= 0),  -- paise
  date              timestamptz not null,
  description       text not null,
  account_id        uuid not null,
  to_account_id     uuid,
  category_id       uuid,
  payment_method_id uuid,
  goal_id           uuid,
  loan_id           uuid,
  merchant          text,
  notes             text,
  tags              text[] not null default '{}',
  linked_txn_ids    uuid[],
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- ── loans (lending & borrowing) ──────────────────────────────
create table if not exists public.loans (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_name text not null,
  direction   text not null check (direction in ('lent','borrowed')),
  amount      bigint not null default 0,               -- paise
  due_date    date,
  notes       text,
  status      text not null default 'open' check (status in ('open','partial','settled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── budgets (monthly; null category = overall) ───────────────
create table if not exists public.budgets (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid,
  amount      bigint not null check (amount > 0),      -- paise / month
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── subscriptions ────────────────────────────────────────────
create table if not exists public.subscriptions (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  amount        bigint not null check (amount >= 0),   -- paise per cycle
  cycle         text not null check (cycle in ('weekly','monthly','quarterly','yearly')),
  next_due_date date not null,
  account_id    uuid,
  payment_method_id uuid,
  category_id   uuid,
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- added after first release (safe to re-run)
alter table public.subscriptions add column if not exists payment_method_id uuid;

-- ── goals ────────────────────────────────────────────────────
create table if not exists public.goals (
  id             uuid primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  target_amount  bigint not null check (target_amount > 0),
  current_amount bigint not null default 0,
  target_date    date,
  notes          text,
  is_completed   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── settings (key-value per user) ────────────────────────────
create table if not exists public.settings (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── Row Level Security: owner-only on every table ────────────
do $$
declare t text;
begin
  foreach t in array array['accounts','payment_methods','categories','transactions',
                           'loans','budgets','subscriptions','goals','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t || '_owner', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ── updated_at is always set by the server clock (incremental sync relies on it) ──
create or replace function public.artha_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts','payment_methods','categories','transactions',
                           'loans','budgets','subscriptions','goals','settings']
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before insert or update on public.%I
                    for each row execute function public.artha_touch_updated_at()', t);
    execute format('create index if not exists %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
  end loop;
end $$;
