with ranked as (
  select id,
         row_number() over (
           partition by user_id, operation, input_hash
           order by created_at desc, id desc
         ) as rn
  from public.operation_runs
  where status = 'running'
)
update public.operation_runs as runs
set status = 'failed',
    error_code = 'dedupe-migration',
    completed_at = now(),
    updated_at = now()
from ranked
where runs.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists operation_runs_single_running_input_idx
  on public.operation_runs (user_id, operation, input_hash)
  where status = 'running';

comment on index public.operation_runs_single_running_input_idx is
  'Prevents duplicate concurrent expensive operations for the same tenant and normalized input, even across minute buckets.';
