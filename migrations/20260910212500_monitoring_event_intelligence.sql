alter table public.monitoring_events add column if not exists change_key text;
alter table public.monitoring_events add column if not exists change_score integer not null default 0 check (change_score between 0 and 100);
alter table public.monitoring_events add column if not exists previous_snapshot_id uuid;
alter table public.monitoring_events add column if not exists current_snapshot_id uuid;

create index if not exists monitoring_events_change_key_idx
  on public.monitoring_events (user_id, target_id, change_key, detected_at desc);
create index if not exists monitoring_events_score_idx
  on public.monitoring_events (user_id, change_score desc, detected_at desc);

comment on column public.monitoring_events.change_key is 'Stable daily deduplication key for a detected competitor transition.';
comment on column public.monitoring_events.change_score is 'Deterministic business significance score from 0 to 100.';
comment on column public.monitoring_events.previous_snapshot_id is 'Previous snapshot used to derive the event.';
comment on column public.monitoring_events.current_snapshot_id is 'Current snapshot that triggered the event.';
