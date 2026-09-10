create table if not exists public.alert_preferences (
  user_id text primary key,
  minimum_change_score integer not null default 70 check (minimum_change_score between 0 and 100),
  include_decisions boolean not null default true,
  include_intelligence boolean not null default true,
  digest_frequency text not null default 'weekly' check (digest_frequency in ('daily','weekly','off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  alert_key text not null,
  kind text not null check (kind in ('monitoring','decision','intelligence')),
  severity text not null check (severity in ('critical','high','medium','low')),
  title text not null,
  summary text not null,
  source_id text not null,
  source_type text not null,
  score integer not null default 0 check (score between 0 and 100),
  confidence double precision not null default 0 check (confidence between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, alert_key)
);
create index if not exists alerts_user_unread_idx on public.alerts (user_id, read_at, occurred_at desc);
create index if not exists alerts_user_score_idx on public.alerts (user_id, score desc, occurred_at desc);

create table if not exists public.executive_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  report_key text not null,
  report_type text not null default 'competitive-digest' check (report_type in ('competitive-digest')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_key)
);
create index if not exists executive_reports_user_period_idx on public.executive_reports (user_id, period_end desc);

comment on table public.alert_preferences is 'Tenant-scoped in-app alert thresholds and digest cadence. No external delivery is implied.';
comment on table public.alerts is 'Tenant-scoped, evidence-linked COANTO alerts derived from persisted monitoring, intelligence and decisions.';
comment on table public.executive_reports is 'Tenant-scoped deterministic executive competitive digests built from persisted COANTO facts and decisions.';
comment on column public.alerts.evidence is 'Evidence lineage copied from the source record; AI output alone is not treated as evidence.';
