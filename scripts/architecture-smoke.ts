import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const coreDir = join(root, 'src', 'lib');
const violations: string[] = [];

for (const name of await readdir(coreDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(coreDir, name), 'utf8');
  if (text.includes('supabase')) violations.push(`${name}: Supabase runtime coupling`);
  if (text.includes('context.supabase')) violations.push(`${name}: legacy Supabase data context`);
  if (text.includes('supabaseAdmin')) violations.push(`${name}: legacy Supabase admin persistence`);
}

const apiDir = join(root, 'src', 'routes', 'api');
for (const name of await readdir(apiDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(apiDir, name), 'utf8');
  if (text.includes('supabase')) violations.push(`api/${name}: Supabase runtime coupling`);
}

const analyze = await readFile(join(apiDir, 'analyze.ts'), 'utf8');
if (!analyze.includes('@/lib/analysis-persistence.server')) violations.push('api/analyze.ts: missing persistence boundary');

const persistence = await readFile(join(coreDir, 'analysis-persistence.server.ts'), 'utf8');
if (!persistence.includes('@insforge/sdk')) violations.push('analysis-persistence.server.ts: InsForge adapter missing');

const auth = await readFile(join(coreDir, 'auth.server.ts'), 'utf8');
if (!auth.includes('@insforge/sdk')) violations.push('auth.server.ts: InsForge auth adapter missing');

if (violations.length) {
  console.error('ARCHITECTURE_SMOKE_FAILED');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('ARCHITECTURE_SMOKE_OK');
