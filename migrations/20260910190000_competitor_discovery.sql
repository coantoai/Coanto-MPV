create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  domain text not null,
  name text not null,
  url text not null,
  source_type text not null check (source_type in ('direct-site','search-index','user-lead')),
  verification_status text not null check (verification_status in ('verified','indexed','lead')),
  relevance_score integer not null default 0 check (relevance_score between 0 and 100),
  rank integer not null default 0,
  reason text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, domain)
);
create index if not exists competitors_tenant_rank_idx on public.competitors (user_id, rank asc, relevance_score desc);
create index if not exists competitors_tenant_seen_idx on public.competitors (user_id, last_seen_at desc);
comment on table public.competitors is 'Tenant-scoped verified competitor registry. User-supplied names remain leads until evidence verifies them.';
