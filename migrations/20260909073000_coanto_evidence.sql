create table if not exists public.coanto_evidence (
  id text primary key,
  kind text not null check (kind in ('direct','search','calculation','historical','inference')),
  source_url text not null,
  source_domain text not null,
  source_group text not null,
  observed_at timestamptz not null,
  retrieved_at timestamptz not null,
  content text not null,
  content_hash text not null,
  status text not null check (status in ('VERIFIED','UNVERIFIED','REJECTED')),
  supports_claim text,
  contradicts_claim text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  check (retrieved_at >= observed_at)
);

create index if not exists coanto_evidence_source_domain_idx on public.coanto_evidence (source_domain);
create index if not exists coanto_evidence_source_group_idx on public.coanto_evidence (source_group);
create index if not exists coanto_evidence_observed_at_idx on public.coanto_evidence (observed_at desc);
create index if not exists coanto_evidence_content_hash_idx on public.coanto_evidence (content_hash);

create table if not exists public.coanto_claims (
  id text primary key,
  text text not null,
  normalized text not null,
  type text not null check (type in ('observed','derived','inference','recommendation')),
  status text not null check (status in ('SUPPORTED','CONTRADICTED','UNRESOLVED','UNSUPPORTED')),
  supporting_evidence_ids text[] not null default '{}',
  contradicting_evidence_ids text[] not null default '{}',
  created_at timestamptz not null,
  version integer not null default 1
);

create index if not exists coanto_claims_status_idx on public.coanto_claims (status);
create index if not exists coanto_claims_created_at_idx on public.coanto_claims (created_at desc);

create table if not exists public.coanto_evidence_graph_snapshots (
  id uuid primary key default gen_random_uuid(),
  analysis_id text not null,
  graph_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists coanto_graph_analysis_idx on public.coanto_evidence_graph_snapshots (analysis_id, created_at desc);

comment on table public.coanto_evidence is 'Immutable source observations collected by COANTO; default status is UNVERIFIED.';
comment on table public.coanto_claims is 'Atomic claims derived from evidence; claims are never evidence themselves.';
comment on table public.coanto_evidence_graph_snapshots is 'Versioned Evidence Graph snapshots used for Trust and decision auditability.';
