-- Artha — Supabase schema (future cloud sync target)
-- Mirrors the local IndexedDB (Dexie) tables 1:1.
-- All money columns are integer PAISE (never float).
-- Enable RLS on every table; users only ever see their own rows.
--
-- Apply with:  psql $SUPABASE_DB_URL -f supabase/schema.sql
-- or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ── accounts ─────────────────────────────────────────────────
create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('bank','cash','credit_card','wallet','investment')),
  subtype         text,
  bank_name       text,
  opening_balance bigint not null default 0,      -- paise
  color           text,
  credit_limit    bigint,                          -- paise, credit cards only
  billing_day     smallint check (billing_day between 1 and 31),
  is_active       boolean not null default true,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ── payment_methods (lenses onto accounts — never hold balances) ──
create table if not exists payment_methods (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  type               text not null check (type in ('upi','cash','debit_card','credit_card','netbanking','other')),
  linked_account_id  uuid references accounts (id) on delete set null,
  is_active          boolean not null default true,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now()
);

-- ── categories ───────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  parent_id   uuid references categories (id) on delete set null,
  kind        text not null check (kind in ('expense','income')),
  is_need     boolean,                             -- null = unspecified
  flow        text check (flow in ('fixed','variable')),
  color       text not null default '#64748b',
  is_archived boolean not null default false,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── transactions ─────────────────────────────────────────────
create table if not exists transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  type              text not null check (type in (
                      'income','expense','refund','investment',
                      'transfer','cc_payment',
                      'lend','lend_repayment','borrow','borrow_repayment')),
  amount            bigint not null check (amount >= 0),   -- paise
  date              timestamptz not null,
  description       text not null,
  account_id        uuid not null references accounts (id) on delete restrict,
  to_account_id     uuid references accounts (id) on delete restrict,
  category_id       uuid references categories (id) on delete set null,
  payment_method_id uuid references payment_methods (id) on delete set null,
  goal_id           uuid,
  loan_id           uuid,
  merchant          text,
  notes             text,
  tags              text[] not null default '{}',
  linked_txn_ids    uuid[] not null default '{}',
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists transactions_user_date_idx on transactions (user_id, date desc);
create index if not exists transactions_account_idx   on transactions (account_id);
create index if not exists transactions_category_idx  on transactions (category_id);

-- ── loans (lending & borrowing; principal accrues via linked txns) ──
create table if not exists loans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  person_name text not null,
  direction   text not null check (direction in ('lent','borrowed')),
  amount      bigint not null default 0,           -- paise; 0 = derive from linked txns
  due_date    date,
  notes       text,
  status      text not null default 'open' check (status in ('open','settled')),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table transactions
  add constraint transactions_loan_fk foreign key (loan_id) references loans (id) on delete set null;

-- ── budgets (monthly; null category = overall budget) ────────
create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category_id uuid references categories (id) on delete cascade,
  amount      bigint not null check (amount > 0),  -- paise / month
  is_active   boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── subscriptions ────────────────────────────────────────────
create table if not exists subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  amount        bigint not null check (amount >= 0),       -- paise per cycle
  cycle         text not null check (cycle in ('weekly','monthly','quarterly','yearly')),
  next_due_date date not null,
  account_id    uuid references accounts (id) on delete set null,
  category_id   uuid references categories (id) on delete set null,
  is_active     boolean not null default true,
  notes         text,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ── goals ────────────────────────────────────────────────────
create table if not exists goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  target_amount  bigint not null check (target_amount > 0),  -- paise
  current_amount bigint not null default 0,                  -- paise
  target_date    date,
  notes          text,
  is_completed   boolean not null default false,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table transactions
  add constraint transactions_goal_fk foreign key (goal_id) references goals (id) on delete set null;

-- ── settings (key-value per user) ────────────────────────────
create table if not exists settings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ── Row Level Security ───────────────────────────────────────
alter table accounts         enable row level security;
alter table payment_methods  enable row level security;
alter table categories       enable row level security;
alter table transactions     enable row level security;
alter table loans            enable row level security;
alter table budgets          enable row level security;
alter table subscriptions    enable row level security;
alter table goals            enable row level security;
alter table settings         enable row level security;

-- owner-only policies
create policy accounts_owner         on accounts         using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy payment_methods_owner  on payment_methods  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_owner       on categories       using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_owner     on transactions     using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy loans_owner            on loans            using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy budgets_owner          on budgets          using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy subscriptions_owner    on subscriptions    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy goals_owner            on goals            using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy settings_owner         on settings         using (auth.uid() = user_id) with check (auth.uid() = user_id);
