-- Additive sandbox/Preview migration. Apply through the existing InsForge admin migration API.
-- No changes to existing application tables or authentication.
create table if not exists public.agent_tool_runs (
 user_id uuid not null,
 request_id uuid not null,
 tool text not null check (tool in ('get_business_context','research','collect_evidence','get_artifact','run_pipeline','list_decisions')),
 input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
 cost_units integer not null check (cost_units between 1 and 10),
 status text not null default 'running' check (status in ('running','succeeded','failed')),
 result_json jsonb,
 error_code text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key (user_id,request_id),
 check (result_json is null or octet_length(result_json::text) <= 262144)
);
create index if not exists agent_tool_runs_budget_idx on public.agent_tool_runs(user_id,created_at);
alter table public.agent_tool_runs enable row level security;
revoke all on public.agent_tool_runs from public;

create or replace function public.coanto_agent_admit(
 p_user_id uuid,p_request_id uuid,p_tool text,p_input_hash text,p_units integer
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing public.agent_tool_runs%rowtype; recent integer; daily integer;
begin
 -- Serialize admission per tenant across all instances. No process-local quota fallback.
 perform pg_advisory_xact_lock(hashtextextended('coanto-agent:'||p_user_id::text,0));
 select * into existing from public.agent_tool_runs where user_id=p_user_id and request_id=p_request_id;
 if found then
  if existing.input_hash<>p_input_hash or existing.tool<>p_tool then return jsonb_build_object('kind','conflict'); end if;
  if existing.status='succeeded' then return jsonb_build_object('kind','cached','result',existing.result_json); end if;
  return jsonb_build_object('kind','running');
 end if;
 -- Keep the unit schedule enforced in SQL as well as the HTTP layer.
 if p_units <> (case when p_tool in ('research','collect_evidence') then 10 when p_tool='run_pipeline' then 5 else 1 end) then
  raise exception 'Invalid cost units';
 end if;
 select count(*) into recent from public.agent_tool_runs where user_id=p_user_id and created_at>=now()-interval '1 minute';
 select coalesce(sum(cost_units),0) into daily from public.agent_tool_runs where user_id=p_user_id and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if recent>=6 or daily+p_units>100 then return jsonb_build_object('kind','limited'); end if;
 insert into public.agent_tool_runs(user_id,request_id,tool,input_hash,cost_units) values(p_user_id,p_request_id,p_tool,p_input_hash,p_units);
 return jsonb_build_object('kind','started');
end $$;
revoke all on function public.coanto_agent_admit(uuid,uuid,text,text,integer) from public;

create or replace function public.coanto_agent_finish(p_user_id uuid,p_request_id uuid,p_result jsonb,p_error text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.agent_tool_runs set status=case when p_error is null then 'succeeded' else 'failed' end,
 result_json=p_result,error_code=p_error,completed_at=now()
 where user_id=p_user_id and request_id=p_request_id and status='running';
 return found;
end $$;
revoke all on function public.coanto_agent_finish(uuid,uuid,jsonb,text) from public;
-- The existing InsForge admin connection must own or be explicitly granted these objects.
-- Never grant these RPCs or table access to anon/authenticated end-user roles.
