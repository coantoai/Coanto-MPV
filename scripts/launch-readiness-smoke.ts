import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateLaunchReadiness } from '../src/lib/launch-readiness.server.ts';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const report = await evaluateLaunchReadiness({ rootDir: root, env: { ...process.env, COANTO_LAUNCH_MODE: 'validation' } });
expect(Array.isArray(report.checks) && report.checks.length > 0, 'Launch readiness returned no checks.');
expect(report.mode === 'validation', 'Validation launch mode was not selected.');
expect(typeof report.ready === 'boolean', 'Launch readiness did not return a boolean ready state.');

const requiredFiles = [
  'src/routes/api/health.ts',
  'src/routes/api/ready.ts',
  'src/routes/api/auth.ts',
  'src/routes/api/analyze.ts',
  'src/routes/api/monitoring-cron.ts',
  'src/lib/config.server.ts',
  'src/lib/http-security.server.ts',
  'src/lib/cost-policy.server.ts',
  'src/lib/operation-guard.server.ts',
  'src/lib/billing.server.ts',
  'src/lib/launch-readiness.server.ts',
  'scripts/production-qa-smoke.ts',
  'scripts/launch-readiness-check.ts',
  'vercel.json',
];
for (const file of requiredFiles) {
  await readFile(join(root, file), 'utf8');
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { packageManager?: string; scripts?: Record<string, string> };
expect(packageJson.packageManager === 'bun@1.4.2', 'Bun toolchain is not pinned.');
for (const script of ['typecheck','lint','test:smoke','test:architecture','test:onboarding','test:competitor-discovery','test:evidence','test:evidence-collector','test:claim','test:evidence-graph','test:research-proof','test:ai-contract','test:security','test:performance-cost','test:billing','test:production-qa','test:launch-readiness']) {
  expect(Boolean(packageJson.scripts?.[script]), `Missing package script: ${script}`);
}

const envExample = await readFile(join(root, '.env.example'), 'utf8');
for (const key of ['COANTO_LAUNCH_MODE','COANTO_SITE_URL','COANTO_RELEASE_SHA','INSFORGE_URL','INSFORGE_API_KEY','AUTH_RATE_LIMIT_SECRET','CRON_SECRET','AI_PROVIDER','GEMINI_API_KEY','COANTO_ANALYSIS_CACHE_SECONDS','COANTO_ANALYSIS_BURST_LIMIT','COANTO_ANALYSIS_DAILY_LIMIT']) {
  expect(envExample.includes(`${key}=`), `.env.example missing ${key}.`);
}

const launchWorkflow = await readFile(join(root, '.github', 'workflows', 'launch-gate.yml'), 'utf8');
for (const invariant of ['workflow_dispatch', 'launch:check', 'COANTO_LAUNCH_MODE', 'GEMINI_API_KEY']) {
  expect(launchWorkflow.includes(invariant), `Launch workflow missing ${invariant}.`);
}

const verifyWorkflow = await readFile(join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
expect(verifyWorkflow.includes('BUN_VERSION: 1.4.2'), 'Main CI must use the pinned Bun toolchain.');
expect(verifyWorkflow.includes('production-gate:') && verifyWorkflow.includes('PRODUCTION_GATE_OK'), 'Main CI must expose a single production gate after verification, runtime, and persistence checks.');

const deployWorkflow = await readFile(join(root, '.github', 'workflows', 'deploy-staging.yml'), 'utf8');
for (const invariant of ['workflow_dispatch', "inputs.target == 'production'", 'backup_confirmed', 'rollback_confirmed', 'git merge-base --is-ancestor', 'COANTO_RELEASE_SHA="$GITHUB_SHA"', 'Verify canonical production candidate after deployment', 'POST_DEPLOY_VERIFY_OK', '/api/health', '/api/ready']) {
  expect(deployWorkflow.includes(invariant), `Production deploy workflow missing ${invariant}.`);
}
expect(!deployWorkflow.includes("tags: ['v*']"), 'Production must not deploy automatically from version tags.');

const runbook = await readFile(join(root, 'docs', 'LAUNCH.md'), 'utf8');
expect(runbook.includes('Validation launch') && runbook.includes('Commercial launch'), 'Launch profiles are undocumented.');
expect(runbook.includes('Backup / recovery gate') && runbook.includes('Rollback'), 'Recovery/rollback runbook is incomplete.');
expect(runbook.includes('Live AI quota/availability'), 'External AI launch blocker is undocumented.');

const vercel = await readFile(join(root, 'vercel.json'), 'utf8');
expect(vercel.includes('Strict-Transport-Security'), 'Production hosting config is missing HSTS.');
// Vercel Hobby does not support the previous hourly cron. The production config intentionally
// uses the supported daily schedule until the hosting plan or scheduler changes.
expect(vercel.includes('/api/monitoring-cron') && vercel.includes('0 0 * * *'), 'Production monitoring cron is not scheduled daily for the Hobby deployment.');

const health = await readFile(join(root, 'src', 'routes', 'api', 'health.ts'), 'utf8');
const ready = await readFile(join(root, 'src', 'routes', 'api', 'ready.ts'), 'utf8');
expect(health.includes('releaseIdentity') && ready.includes('releaseIdentity'), 'Health/readiness must expose non-secret release identity.');

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

const sourceFiles = await filesUnder(join(root, 'src'));
for (const path of sourceFiles.filter((file) => /\.(ts|tsx)$/.test(file))) {
  const content = await readFile(path, 'utf8');
  expect(!content.includes('service_role') && !content.includes('SUPABASE_SERVICE_ROLE_KEY'), `Legacy privileged Supabase secret reference found in ${path}.`);
}

console.log(`LAUNCH_READINESS_SMOKE_OK mode=${report.mode} ready=${report.ready} checks=${report.checks.length}`);
