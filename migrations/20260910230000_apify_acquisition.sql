alter table public.monitoring_snapshots
  add column if not exists acquisition_provider text not null default 'direct';

alter table public.monitoring_snapshots
  drop constraint if exists monitoring_snapshots_acquisition_provider_check;

alter table public.monitoring_snapshots
  add constraint monitoring_snapshots_acquisition_provider_check
  check (acquisition_provider in ('direct','apify'));

create index if not exists monitoring_snapshots_acquisition_idx
  on public.monitoring_snapshots (user_id, acquisition_provider, checked_at desc);

comment on column public.monitoring_snapshots.acquisition_provider is 'Retrieval path used for this direct-site observation. Apify is acquisition transport, not the evidence authority.';
