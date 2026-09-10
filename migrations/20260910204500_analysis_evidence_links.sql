create table if not exists public.analysis_evidence_links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  evidence_id text not null references public.coanto_evidence(id) on delete cascade,
  role text not null check (role in ('baseline','competitor','citation')),
  created_at timestamptz not null default now(),
  unique (user_id, analysis_id, evidence_id)
);

create index if not exists analysis_evidence_links_tenant_idx
  on public.analysis_evidence_links (user_id, analysis_id, created_at desc);
create index if not exists analysis_evidence_links_evidence_idx
  on public.analysis_evidence_links (evidence_id);

comment on table public.analysis_evidence_links is 'Tenant-scoped ledger linking immutable public evidence observations to the analysis that consumed them.';
