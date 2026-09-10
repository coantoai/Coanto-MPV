import { readFile } from 'node:fs/promises';

const baseUrl = (process.env.INSFORGE_URL ?? '').trim().replace(/\/$/, '');
const apiKey = (process.env.INSFORGE_API_KEY ?? '').trim();
const migrationVersion = '20260909073000';
const migrationName = 'coanto-evidence';

if (!baseUrl) throw new Error('INSFORGE_URL is missing.');
if (!apiKey) throw new Error('INSFORGE_API_KEY is missing.');
if (!/^https?:\/\//i.test(baseUrl)) throw new Error('INSFORGE_URL must be an HTTP(S) URL.');
if (!apiKey.startsWith('ik_')) {
  throw new Error('INSFORGE_API_KEY is not an InsForge project API key (expected ik_ prefix).');
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON response text for diagnostics.
  }

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 800)}`);
  }

  return body;
}

async function main() {
  // /api/auth/admin/sessions/current expects an admin JWT session, not a project API key.
  // Test the project API key through an endpoint protected by verifyAdmin instead.
  await request('/api/deployments/metadata');
  console.log('INSFORGE_AUTH_OK');

  const migrations = (await request('/api/database/migrations')) as { migrations?: Array<{ version?: string }> };
  const alreadyApplied = migrations.migrations?.some((migration) => migration.version === migrationVersion) ?? false;

  if (!alreadyApplied) {
    const sql = await readFile(new URL('../migrations/20260909073000_coanto_evidence.sql', import.meta.url), 'utf8');
    await request('/api/database/migrations', {
      method: 'POST',
      body: JSON.stringify({ version: migrationVersion, name: migrationName, sql }),
    });
    console.log('INSFORGE_SCHEMA_APPLIED');
  } else {
    console.log('INSFORGE_SCHEMA_ALREADY_APPLIED');
  }

  const rows = await request('/api/database/records/coanto_evidence?select=id&limit=1');
  if (!Array.isArray(rows)) throw new Error('InsForge evidence table query did not return an array.');
  console.log('INSFORGE_READ_OK');

  const probeId = `insforge_probe_${Date.now()}`;
  const probe = await request('/api/database/records/coanto_evidence', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        id: probeId,
        kind: 'calculation',
        source_url: 'https://example.com/insforge-probe',
        source_domain: 'example.com',
        source_group: 'coanto-ci-probe',
        observed_at: new Date().toISOString(),
        retrieved_at: new Date().toISOString(),
        content: 'COANTO InsForge connectivity probe.',
        content_hash: 'ci-probe',
        status: 'UNVERIFIED',
        metadata: { probe: true, source: 'github-actions' },
      },
    ]),
  });

  if (!Array.isArray(probe) || !probe.some((row) => row?.id === probeId)) {
    throw new Error('InsForge evidence persistence probe did not return the inserted row.');
  }
  console.log('INSFORGE_WRITE_OK');

  await request(`/api/database/records/coanto_evidence?id=eq.${encodeURIComponent(probeId)}`, {
    method: 'DELETE',
  });
  console.log('INSFORGE_DELETE_OK');
  console.log('INSFORGE_INTEGRATION_OK');
}

await main();
