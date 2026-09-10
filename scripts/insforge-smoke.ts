import { readFile } from 'node:fs/promises';

const baseUrl = (process.env.INSFORGE_URL ?? '').trim().replace(/\/$/, '');
const apiKey = (process.env.INSFORGE_API_KEY ?? '').trim();
const migrationsToApply = [
  { version: '20260909073000', name: 'coanto-evidence', file: '../migrations/20260909073000_coanto_evidence.sql' },
  { version: '20260910160500', name: 'coanto-app-data', file: '../migrations/20260910160500_coanto_app_data.sql' },
  { version: '20260910182000', name: 'business-context', file: '../migrations/20260910182000_business_context.sql' },
] as const;

if (!baseUrl) throw new Error('INSFORGE_URL is missing.');
if (!apiKey) throw new Error('INSFORGE_API_KEY is missing.');
if (!/^https?:\/\//i.test(baseUrl)) throw new Error('INSFORGE_URL must be an HTTP(S) URL.');
if (!apiKey.startsWith('ik_')) throw new Error('INSFORGE_API_KEY is not an InsForge project API key (expected ik_ prefix).');

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 800)}`);
  }
  return body;
}

async function applyMigrations() {
  const migrations = (await request('/api/database/migrations')) as { migrations?: Array<{ version?: string }> };
  const applied = new Set((migrations.migrations ?? []).map((m) => m.version));
  for (const migration of migrationsToApply) {
    if (applied.has(migration.version)) {
      console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${migration.version}`);
      continue;
    }
    const sql = await readFile(new URL(migration.file, import.meta.url), 'utf8');
    await request('/api/database/migrations', { method: 'POST', body: JSON.stringify({ version: migration.version, name: migration.name, sql }) });
    console.log(`INSFORGE_SCHEMA_APPLIED:${migration.version}`);
  }
}

async function assertTable(table: string) {
  const rows = await request(`/api/database/records/${table}?select=id&limit=1`);
  if (!Array.isArray(rows)) throw new Error(`${table} query did not return an array.`);
}

async function main() {
  await request('/api/deployments/metadata');
  console.log('INSFORGE_AUTH_OK');
  await applyMigrations();

  for (const table of ['coanto_evidence','coanto_claims','coanto_evidence_graph_snapshots','analyses','memory_items','monitoring_targets','monitoring_snapshots','monitoring_events','business_metrics','business_insights']) {
    await assertTable(table);
  }
  const contextRows = await request('/api/database/records/business_contexts?select=user_id&limit=1');
  if (!Array.isArray(contextRows)) throw new Error('business_contexts query did not return an array.');
  console.log('INSFORGE_SCHEMA_OK');

  const probeId = `insforge_probe_${Date.now()}`;
  const evidenceProbe = await request('/api/database/records/coanto_evidence', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ id: probeId, kind: 'calculation', source_url: 'https://example.com/insforge-probe', source_domain: 'example.com', source_group: 'coanto-ci-probe', observed_at: new Date().toISOString(), retrieved_at: new Date().toISOString(), content: 'COANTO InsForge connectivity probe.', content_hash: 'ci-probe', status: 'UNVERIFIED', metadata: { probe: true, source: 'github-actions' } }]),
  });
  if (!Array.isArray(evidenceProbe) || !evidenceProbe.some((row: any) => row?.id === probeId)) throw new Error('InsForge evidence persistence probe failed.');

  const tenantId = `ci-tenant-${Date.now()}`;
  const analysisProbe = await request('/api/database/records/analyses', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ user_id: tenantId, store_url: 'https://example.com', result_json: { probe: true } }]),
  }) as Array<{ id?: string }>;
  const analysisId = analysisProbe?.[0]?.id;
  if (!analysisId) throw new Error('InsForge analysis persistence probe failed.');

  const contextProbe = await request('/api/database/records/business_contexts', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify([{ user_id: tenantId, business_name: 'COANTO CI Shop', website_url: 'https://example.com/', industry: 'ecommerce', business_model: 'ecommerce', company_stage: 'growing', primary_market: 'Lebanon', target_markets: ['Lebanon'], target_customer: 'Online shoppers', value_proposition: 'Verified competitive intelligence', products_services: ['Commerce'], competitive_goals: ['competitor-discovery'], known_competitors: [], preferred_language: 'ar', currency: 'USD', onboarding_completed_at: new Date().toISOString() }]),
  }) as Array<{ user_id?: string }>;
  if (!Array.isArray(contextProbe) || contextProbe[0]?.user_id !== tenantId) throw new Error('InsForge business context persistence probe failed.');

  const tenantRows = await request(`/api/database/records/analyses?user_id=eq.${encodeURIComponent(tenantId)}&select=id,user_id&limit=5`) as Array<{ user_id?: string }>;
  if (!Array.isArray(tenantRows) || tenantRows.some((row) => row.user_id !== tenantId)) throw new Error('InsForge tenant isolation query probe failed.');
  const contextTenantRows = await request(`/api/database/records/business_contexts?user_id=eq.${encodeURIComponent(tenantId)}&select=user_id,business_name&limit=5`) as Array<{ user_id?: string }>;
  if (!Array.isArray(contextTenantRows) || contextTenantRows.length !== 1 || contextTenantRows[0]?.user_id !== tenantId) throw new Error('InsForge business context tenant isolation probe failed.');
  console.log('INSFORGE_READ_WRITE_OK');

  await request(`/api/database/records/business_contexts?user_id=eq.${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
  await request(`/api/database/records/analyses?id=eq.${encodeURIComponent(analysisId)}`, { method: 'DELETE' });
  await request(`/api/database/records/coanto_evidence?id=eq.${encodeURIComponent(probeId)}`, { method: 'DELETE' });
  console.log('INSFORGE_DELETE_OK');
  console.log('INSFORGE_INTEGRATION_OK');
}

await main();
