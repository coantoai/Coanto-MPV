"""Exercise real PostgreSQL admission concurrency. Only targets an explicit local test container."""
import concurrent.futures, json, os, subprocess, sys, uuid
from pathlib import Path
name = sys.argv[1] if len(sys.argv) == 2 else ''
if not name.startswith('coanto-agent-pg'):
    raise SystemExit('Pass the dedicated local coanto-agent-pg test container name; no remote DB supported.')
env = os.environ.copy()
for selector in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
    env.pop(selector, None)
base = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
def sql(query, fail=False):
    r = subprocess.run(base, input=query, text=True, capture_output=True, env=env, timeout=20)
    if fail:
        assert r.returncode != 0, 'Unprivileged access unexpectedly allowed'
        return
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
root = Path(__file__).resolve().parents[1]
sql((root / 'migrations/20261112090000_agent_api.sql').read_text())
# Reapply verifies migration repeatability without deleting audit records.
sql((root / 'migrations/20261112090000_agent_api.sql').read_text())
tenant, other, request = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
def reserve(t, r, digest='a' * 64):
    return json.loads(sql(f"select coanto_agent_admit('{t}','{r}','research','{digest}',10);"))
assert reserve(tenant, request)['kind'] == 'started'
assert reserve(tenant, request)['kind'] == 'running'
assert reserve(tenant, request, 'b' * 64)['kind'] == 'conflict'
assert sql(f"select coanto_agent_finish('{tenant}','{request}','{{\"provider\":\"serper\"}}',null);") == 't'
assert reserve(tenant, request) == {'kind': 'cached', 'result': {'provider': 'serper'}}
assert sql(f"select coanto_agent_finish('{tenant}','{request}','{{}}',null);") == 'f'
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    outcomes = list(pool.map(lambda _: reserve(tenant, str(uuid.uuid4()))['kind'], range(12)))
assert outcomes.count('started') == 5, outcomes
assert outcomes.count('limited') == 7, outcomes
assert reserve(other, request)['kind'] == 'started', 'Tenant budgets/keys must be independent'
# Shift completed requests outside burst window but within current day to exercise daily units.
sql(f"update agent_tool_runs set created_at=now()-interval '61 seconds' where user_id='{tenant}';")
for _ in range(4):
    assert reserve(tenant, str(uuid.uuid4()))['kind'] == 'started'
assert reserve(tenant, str(uuid.uuid4()))['kind'] == 'limited'
sql("create role coanto_agent_unprivileged_test;")
sql("set role coanto_agent_unprivileged_test; select * from agent_tool_runs;", fail=True)
sql(f"set role coanto_agent_unprivileged_test; select coanto_agent_admit('{tenant}','{uuid.uuid4()}','research','{'a'*64}',10);", fail=True)
print('PASS PostgreSQL: migration replay, immutable results, hash conflicts, concurrent burst/daily budgets, tenant isolation, public table/RPC denial')
