create table if not exists public.operation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  operation text not null,
  input_hash text not null check (char_length(input_hash) = 64),
  operation_key text not null check (char_length(operation_key) = 64),
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  result_json jsonb,
  error_code text,
  cost_units integer not null default 1 check (cost_units >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, operation, operation_key)
);

create index if not exists operation_runs_user_operation_created_idx
  on public.operation_runs (user_id, operation, created_at desc);

create index if not exists operation_runs_cache_lookup_idx
  on public.operation_runs (user_id, operation, input_hash, status, expires_at desc);

comment on table public.operation_runs is
  'Tenant-scoped ledger for expensive-operation dedupe, short-lived result caching and budget enforcement.';
comment on column public.operation_runs.result_json is
  'Cached server result for a successful expensive operation. Never authoritative evidence by itself.';
