create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  store_url text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists analyses_user_created_idx on public.analyses (user_id, created_at desc);

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_analysis_id uuid,
  kind text not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  importance integer not null default 50 check (importance between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memory_user_importance_idx on public.memory_items (user_id, importance desc, created_at desc);

create table if not exists public.monitoring_targets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  url text not null,
  interval_hours integer not null default 24 check (interval_hours between 1 and 720),
  active boolean not null default true,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monitoring_targets_user_idx on public.monitoring_targets (user_id, created_at desc);
create index if not exists monitoring_targets_due_idx on public.monitoring_targets (active, next_check_at);

create table if not exists public.monitoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  target_id uuid not null,
  content_hash text not null,
  title text not null default '',
  text_excerpt text not null default '',
  checked_at timestamptz not null default now()
);
create index if not exists monitoring_snapshots_tenant_target_idx on public.monitoring_snapshots (user_id, target_id, checked_at desc);

create table if not exists public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  target_id uuid not null,
  event_type text not null,
  severity text not null default 'medium',
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists monitoring_events_tenant_detected_idx on public.monitoring_events (user_id, detected_at desc);
create index if not exists monitoring_events_target_idx on public.monitoring_events (user_id, target_id, detected_at desc);

create table if not exists public.business_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  metric_key text not null,
  metric_value double precision not null,
  unit text,
  period_start timestamptz,
  period_end timestamptz,
  source_analysis_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  run_key text,
  created_at timestamptz not null default now()
);
create index if not exists business_metrics_user_created_idx on public.business_metrics (user_id, created_at desc);
create index if not exists business_metrics_run_idx on public.business_metrics (user_id, run_key);

create table if not exists public.business_insights (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  summary text not null,
  category text not null,
  impact text not null default 'medium',
  confidence double precision not null default 0 check (confidence between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  recommendation text,
  source_analysis_id uuid,
  run_key text,
  created_at timestamptz not null default now()
);
create index if not exists business_insights_user_created_idx on public.business_insights (user_id, created_at desc);
create index if not exists business_insights_run_idx on public.business_insights (user_id, run_key);

comment on table public.analyses is 'Tenant-scoped COANTO analysis records.';
comment on table public.memory_items is 'Tenant-scoped persistent COANTO memory.';
comment on table public.monitoring_targets is 'Tenant-scoped competitor monitoring targets.';
comment on table public.monitoring_snapshots is 'Tenant-scoped monitoring observations.';
comment on table public.monitoring_events is 'Tenant-scoped meaningful monitoring events.';
comment on table public.business_metrics is 'Tenant-scoped derived business intelligence metrics.';
comment on table public.business_insights is 'Tenant-scoped business intelligence insights.';
