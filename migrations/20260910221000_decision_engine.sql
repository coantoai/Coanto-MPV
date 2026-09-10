create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  decision_key text not null,
  source_insight_id uuid,
  source_analysis_id uuid,
  category text not null,
  title text not null,
  action text not null,
  rationale text not null,
  priority text not null check (priority in ('critical','high','medium','low')),
  score integer not null check (score between 0 and 100),
  confidence double precision not null check (confidence between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','dismissed','completed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, decision_key)
);

create index if not exists decisions_user_priority_idx on public.decisions (user_id, score desc, last_seen_at desc);
create index if not exists decisions_user_status_idx on public.decisions (user_id, status, score desc);
create index if not exists decisions_source_insight_idx on public.decisions (user_id, source_insight_id);

comment on table public.decisions is 'Tenant-scoped, evidence-gated COANTO decisions derived from persisted intelligence.';
comment on column public.decisions.decision_key is 'Stable deterministic identity used to prevent duplicate recommendations.';
comment on column public.decisions.evidence is 'Auditable evidence lineage copied from the intelligence insight; business context is not evidence.';
comment on column public.decisions.score is 'Deterministic execution priority score from 0 to 100.';
