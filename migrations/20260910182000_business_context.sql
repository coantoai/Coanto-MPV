create table if not exists public.business_contexts (
  user_id text primary key,
  business_name text not null,
  website_url text not null,
  industry text not null,
  business_model text not null check (business_model in ('ecommerce','saas','services','marketplace','retail','other')),
  company_stage text not null check (company_stage in ('prelaunch','early','growing','established')),
  primary_market text not null,
  target_markets text[] not null default '{}',
  target_customer text not null,
  value_proposition text not null,
  products_services text[] not null default '{}',
  competitive_goals text[] not null default '{}',
  known_competitors text[] not null default '{}',
  preferred_language text not null default 'ar',
  currency text not null default 'USD',
  onboarding_completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(business_name) between 2 and 120),
  check (char_length(industry) between 2 and 120),
  check (char_length(primary_market) between 2 and 120),
  check (char_length(target_customer) between 3 and 1200),
  check (char_length(value_proposition) between 3 and 1600),
  check (array_length(products_services, 1) is null or array_length(products_services, 1) <= 20),
  check (array_length(competitive_goals, 1) is null or array_length(competitive_goals, 1) <= 12),
  check (array_length(known_competitors, 1) is null or array_length(known_competitors, 1) <= 20)
);

create index if not exists business_contexts_market_idx on public.business_contexts (primary_market);
create index if not exists business_contexts_updated_idx on public.business_contexts (updated_at desc);

comment on table public.business_contexts is 'One tenant-owned business profile used as durable context for COANTO discovery, evidence, intelligence, and decisions.';
