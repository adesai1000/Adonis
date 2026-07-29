-- Adonis SaaS database schema (run in the Supabase SQL editor).
-- Idempotent: safe to re-run — uses "if not exists" / "drop ... if exists".

-- ────────────────────────────── profiles ──────────────────────────────
-- Plan/billing state, one row per user. Clients may SELECT their own row
-- only; all writes happen server-side with the service role (which bypasses
-- RLS), so there are intentionally NO insert/update/delete policies.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  plan text not null default 'free',           -- 'free' | 'pro'
  plan_status text,                            -- stripe subscription status ('trialing','active','past_due','canceled',…)
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

-- ────────────────────────────── user_docs ─────────────────────────────
-- Whole-app-state blob sync (same last-write-wins model as the legacy code
-- sync). Users have full read/write access to their own row.
create table if not exists public.user_docs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_docs enable row level security;

drop policy if exists "user_docs_own" on public.user_docs;
create policy "user_docs_own" on public.user_docs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ───────────────────────────── integrations ───────────────────────────
-- OAuth tokens for Whoop / Google Fit. RLS is enabled with NO policies at
-- all: deny-all for clients — only the service role (server functions) can
-- read or write these rows. Tokens never reach the browser.
create table if not exists public.integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                      -- 'whoop' | 'googlefit'
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  external_user_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integrations enable row level security;
-- (intentionally no policies — deny-all for anon/authenticated roles)

-- ──────────────────── auth.users → profiles trigger ───────────────────
-- Creates a profiles row for every new auth user. SECURITY DEFINER so the
-- auth trigger can insert into public.profiles; search_path is pinned to
-- prevent search-path hijacking in definer functions.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
