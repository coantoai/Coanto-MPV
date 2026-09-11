alter table public.billing_accounts
  add column if not exists last_event_at timestamptz;

create index if not exists billing_accounts_last_event_idx
  on public.billing_accounts (last_event_at desc)
  where last_event_at is not null;

comment on column public.billing_accounts.last_event_at is
  'Latest normalized provider event applied to the billing projection. Older events must never regress account state.';
