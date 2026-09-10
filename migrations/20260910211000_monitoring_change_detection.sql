alter table public.monitoring_snapshots add column if not exists description text not null default '';
alter table public.monitoring_snapshots add column if not exists h1 jsonb not null default '[]'::jsonb;
alter table public.monitoring_snapshots add column if not exists h2 jsonb not null default '[]'::jsonb;

create index if not exists monitoring_snapshots_hash_idx
  on public.monitoring_snapshots (user_id, target_id, content_hash, checked_at desc);

comment on column public.monitoring_snapshots.description is 'Captured page description used for deterministic change analysis.';
comment on column public.monitoring_snapshots.h1 is 'Captured H1 structure used for deterministic change analysis.';
comment on column public.monitoring_snapshots.h2 is 'Captured H2 structure used for deterministic change analysis.';
