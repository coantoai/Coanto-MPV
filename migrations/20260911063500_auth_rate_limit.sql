create table if not exists public.auth_failures (
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null check (char_length(subject_hash) = 64),
  network_hash text check (network_hash is null or char_length(network_hash) = 64),
  action text not null check (action in ('signin','signup')),
  attempted_at timestamptz not null default now()
);

create index if not exists auth_failures_subject_window_idx
  on public.auth_failures (subject_hash, action, attempted_at desc);

create index if not exists auth_failures_network_window_idx
  on public.auth_failures (network_hash, attempted_at desc)
  where network_hash is not null;

comment on table public.auth_failures is
  'Privacy-preserving authentication abuse ledger. Stores keyed hashes only; never raw email addresses, IP addresses, or passwords.';
