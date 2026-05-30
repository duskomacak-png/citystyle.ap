-- CityStyle v213 Tenk Push Fix
-- Pokreni u Supabase SQL editoru ako tabela push_subscriptions nije kompletna.
-- Ako tabela vec postoji, ovaj SQL ne brise podatke.

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  subscription jsonb,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists salon_id uuid references public.salons(id) on delete cascade;
alter table public.push_subscriptions add column if not exists endpoint text;
alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists expiration_time timestamptz;
alter table public.push_subscriptions add column if not exists subscription jsonb;
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists is_active boolean not null default true;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists push_subscriptions_endpoint_uq on public.push_subscriptions(endpoint);
create index if not exists push_subscriptions_salon_active_idx on public.push_subscriptions(salon_id, is_active);
create index if not exists push_subscriptions_updated_idx on public.push_subscriptions(updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner_register" on public.push_subscriptions;
create policy "push_subscriptions_owner_register"
on public.push_subscriptions
for all
to anon, authenticated
using (true)
with check (true);

-- Supabase Data API grants for new Supabase defaults.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.push_subscriptions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.appointments to anon, authenticated, service_role;
grant select on public.salons to anon, authenticated, service_role;
