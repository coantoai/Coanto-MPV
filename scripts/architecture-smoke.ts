import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const coreDir = join(root, 'src', 'lib');
const allowedSupabase = new Set(['auth-client.ts', 'auth.server.ts']);

const files = await readdir(coreDir);
const violations: string[] = [];
for (const name of files) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(coreDir, name), 'utf8');
  if (!allowedSupabase.has(name) && text.includes('@/integrations/supabase/')) violations.push(`${name}: direct Supabase integration`);
  if (text.includes('context.supabase')) violations.push(`${name}: legacy Supabase data context`);
  if (text.includes('supabaseAdmin')) violations.push(`${name}: legacy Supabase admin persistence`);
}

const apiDir = join(root, 'src', 'routes', 'api');
for (const name of await readdir(apiDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(apiDir, name), 'utf8');
  if (text.includes('@/integrations/supabase/client.server')) violations.push(`api/${name}: direct Supabase persistence`);
  if (text.includes('supabaseAdmin')) violations.push(`api/${name}: legacy Supabase admin persistence`);
}

const analyze = await readFile(join(apiDir, 'analyze.ts'), 'utf8');
if (!analyze.includes('@/lib/analysis-persistence.server')) violations.push('api/analyze.ts: missing persistence boundary');

const persistence = await readFile(join(coreDir, 'analysis-persistence.server.ts'), 'utf8');
if (!persistence.includes('@insforge/sdk')) violations.push('analysis-persistence.server.ts: InsForge adapter missing');

if (violations.length) {
  console.error('ARCHITECTURE_SMOKE_FAILED');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('ARCHITECTURE_SMOKE_OK');
