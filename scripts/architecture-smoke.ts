import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const coreDir = join(root, 'src', 'lib');
const allowedSupabase = new Set([
  'auth-client.ts',
  'auth-middleware.ts',
  'auth.server.ts',
]);

const files = await readdir(coreDir);
const violations: string[] = [];
for (const name of files) {
  if (!name.endsWith('.ts') || allowedSupabase.has(name)) continue;
  const text = await readFile(join(coreDir, name), 'utf8');
  if (text.includes('@/integrations/supabase/auth-middleware')) violations.push(`${name}: legacy auth middleware`);
  if (text.includes('@/integrations/supabase/client.server')) violations.push(`${name}: direct Supabase admin persistence`);
}

const analyze = await readFile(join(root, 'src', 'routes', 'api', 'analyze.ts'), 'utf8');
if (analyze.includes('@/integrations/supabase/client.server')) violations.push('api/analyze.ts: direct Supabase persistence');
if (!analyze.includes('@/lib/analysis-persistence.server')) violations.push('api/analyze.ts: missing persistence boundary');

const persistence = await readFile(join(coreDir, 'analysis-persistence.server.ts'), 'utf8');
if (!persistence.includes('@insforge/sdk')) violations.push('analysis-persistence.server.ts: InsForge adapter missing');
if (persistence.includes('supabaseAdmin')) violations.push('analysis-persistence.server.ts: legacy Supabase admin dependency');

if (violations.length) {
  console.error('ARCHITECTURE_SMOKE_FAILED');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('ARCHITECTURE_SMOKE_OK');
