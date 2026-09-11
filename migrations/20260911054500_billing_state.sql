create table if not exists public.billing_accounts (
  user_id text primary key,
  plan_key text not null default 'trial' check (plan_key in ('trial','free','starter','pro')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','paused','canceled','expired')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider is null or length(provider) between 2 and 40),
  check (provider_customer_id is null or length(provider_customer_id) <= 255),
  check (provider_subscription_id is null or length(provider_subscription_id) <= 255)
);

create unique index if not exists billing_accounts_provider_customer_unique
  on public.billing_accounts (provider, provider_customer_id)
  where provider is not null and provider_customer_id is not null;

create unique index if not exists billing_accounts_provider_subscription_unique
  on public.billing_accounts (provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;

create index if not exists billing_accounts_status_idx
  on public.billing_accounts (status, plan_key, updated_at desc);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  normalized_event jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id),
  check (length(provider) between 2 and 40),
  check (length(provider_event_id) between 1 and 255),
  check (length(event_type) between 1 and 100)
);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, occurred_at desc);

comment on table public.billing_accounts is
  'Provider-neutral current billing state. Product authorization reads this state, never provider-specific objects.';
comment on table public.billing_events is
  'Idempotent normalized billing event ledger. Raw provider payloads and secrets are intentionally not stored here.';
