alter table public.billing_accounts
  add column if not exists last_event_at timestamptz;

create index if not exists billing_accounts_last_event_idx
  on public.billing_accounts (last_event_at desc)
  where last_event_at is not null;

create or replace function public.coanto_guard_billing_event_order()
returns trigger
language plpgsql
as $$
begin
  if old.last_event_at is not null
     and new.last_event_at is not null
     and new.last_event_at < old.last_event_at then
    raise exception 'stale billing event';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_accounts_event_order_guard on public.billing_accounts;
create trigger billing_accounts_event_order_guard
before update on public.billing_accounts
for each row execute function public.coanto_guard_billing_event_order();

comment on column public.billing_accounts.last_event_at is
  'Latest normalized provider event applied to the billing projection. Older events must never regress account state.';
