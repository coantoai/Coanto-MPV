alter table public.decisions add column if not exists intelligence_run_key text;
create index if not exists decisions_run_idx on public.decisions (user_id, intelligence_run_key, score desc);
comment on column public.decisions.intelligence_run_key is 'Persisted intelligence refresh that produced or reconfirmed this decision.';
