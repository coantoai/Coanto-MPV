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
if (!analyze.includes('getBusinessContext')) violations.push('api/analyze.ts: missing persisted business context');
if (!analyze.includes('ONBOARDING_REQUIRED')) violations.push('api/analyze.ts: missing onboarding completion gate');

const persistence = await readFile(join(coreDir, 'analysis-persistence.server.ts'), 'utf8');
if (!persistence.includes('@insforge/sdk')) violations.push('analysis-persistence.server.ts: InsForge adapter missing');

const auth = await readFile(join(coreDir, 'auth.server.ts'), 'utf8');
if (!auth.includes('@insforge/sdk')) violations.push('auth.server.ts: InsForge auth adapter missing');

const businessContext = await readFile(join(coreDir, 'business-context.server.ts'), 'utf8');
if (!businessContext.includes("from './database.server'")) violations.push('business-context.server.ts: missing central database boundary');
if (!businessContext.includes("from('business_contexts')")) violations.push('business-context.server.ts: missing durable business_contexts persistence');
if (!businessContext.includes('validateTargetUrl')) violations.push('business-context.server.ts: website validation missing');

const contextApi = await readFile(join(apiDir, 'business-context.ts'), 'utf8');
if (!contextApi.includes('authenticateRequest')) violations.push('api/business-context.ts: authentication boundary missing');
if (!contextApi.includes('saveBusinessContext')) violations.push('api/business-context.ts: save boundary missing');

const onboardingRoute = await readFile(join(root, 'src', 'routes', 'onboarding.tsx'), 'utf8');
if (!onboardingRoute.includes('/api/business-context')) violations.push('onboarding.tsx: business context API integration missing');

const authRoute = await readFile(join(root, 'src', 'routes', 'auth.tsx'), 'utf8');
if (!authRoute.includes('/onboarding')) violations.push('auth.tsx: onboarding routing missing');

const migration = await readFile(join(root, 'migrations', '20260910182000_business_context.sql'), 'utf8');
if (!migration.includes('business_contexts')) violations.push('business context migration missing table');
if (!migration.includes('user_id text primary key')) violations.push('business context migration missing tenant uniqueness');

if (violations.length) {
  console.error('ARCHITECTURE_SMOKE_FAILED');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('ARCHITECTURE_SMOKE_OK');
