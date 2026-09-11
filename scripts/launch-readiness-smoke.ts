import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateLaunchReadiness } from '../src/lib/launch-readiness.server.ts';

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const productionFixture: NodeJS.ProcessEnv = {
  COANTO_LAUNCH_MODE: 'validation',
  COANTO_SITE_URL: 'https://coanto.com',
  COANTO_RELEASE_SHA: 'a'.repeat(40),
  INSFORGE_URL: 'https://backend.example.com',
  INSFORGE_API_KEY: `ik_${'x'.repeat(32)}`,
  AUTH_RATE_LIMIT_SECRET: 'auth-'.padEnd(40, 'x'),
  CRON_SECRET: 'cron-'.padEnd(40, 'x'),
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'configured-test-value',
  BRAVE_SEARCH_API_KEY: 'configured-test-value',
  APIFY_MODE: 'off',
};

const validation = evaluateLaunchReadiness(productionFixture);
expect(validation.ready, `Validation fixture should be launchable, blockers=${validation.blockers}.`);
expect(validation.mode === 'validation', 'Validation launch mode changed unexpectedly.');
expect(validation.configuredAiProviders.includes('gemini'), 'Configured AI provider was not detected.');
expect(validation.configuredSearchProviders.includes('brave'), 'Configured search provider was not detected.');

const missingSearch = evaluateLaunchReadiness({ ...productionFixture, BRAVE_SEARCH_API_KEY: '' });
expect(!missingSearch.ready && missingSearch.checks.some((item) => item.id === 'search-provider' && item.status === 'block'), 'Launch must block without a configured discovery provider.');

const weakSecrets = evaluateLaunchReadiness({ ...productionFixture, CRON_SECRET: 'short', AUTH_RATE_LIMIT_SECRET: 'short' });
expect(!weakSecrets.ready, 'Launch must block weak operational secrets.');
expect(weakSecrets.checks.filter((item) => item.status === 'block').some((item) => item.id === 'cron-secret'), 'Weak cron secret was not blocked.');
expect(weakSecrets.checks.filter((item) => item.status === 'block').some((item) => item.id === 'auth-throttle-secret'), 'Weak auth secret was not blocked.');

const reusedSecret = evaluateLaunchReadiness({ ...productionFixture, CRON_SECRET: productionFixture.AUTH_RATE_LIMIT_SECRET });
expect(!reusedSecret.ready && reusedSecret.checks.some((item) => item.id === 'secret-separation' && item.status === 'block'), 'Launch must block reused operational secrets.');

const wrongAi = evaluateLaunchReadiness({ ...productionFixture, AI_PROVIDER: 'openai' });
expect(!wrongAi.ready && wrongAi.checks.some((item) => item.id === 'preferred-ai-provider' && item.status === 'block'), 'Preferred AI provider without its key must block launch.');

const commercial = evaluateLaunchReadiness({ ...productionFixture, COANTO_LAUNCH_MODE: 'commercial' });
expect(!commercial.ready && commercial.checks.some((item) => item.id === 'commercial-billing-adapter' && item.status === 'block'), 'Commercial launch must stay blocked until a real payment adapter lands.');

const invalidMode = evaluateLaunchReadiness({ ...productionFixture, COANTO_LAUNCH_MODE: 'prod' });
expect(!invalidMode.ready && invalidMode.checks.some((item) => item.id === 'launch-mode' && item.status === 'block'), 'Unknown launch mode must fail closed.');

const insecure = evaluateLaunchReadiness({ ...productionFixture, COANTO_SITE_URL: 'http://coanto.com', INSFORGE_URL: 'http://backend.example.com' });
expect(!insecure.ready, 'Non-HTTPS launch origins must be blocked.');

const nonOrigin = evaluateLaunchReadiness({ ...productionFixture, COANTO_SITE_URL: 'https://coanto.com/app?x=1', INSFORGE_URL: 'https://backend.example.com/api' });
expect(!nonOrigin.ready, 'Launch URLs must be exact origins, not credential/path/query-bearing URLs.');

const missingRelease = evaluateLaunchReadiness({ ...productionFixture, COANTO_RELEASE_SHA: '' });
expect(!missingRelease.ready && missingRelease.checks.some((item) => item.id === 'release-identity' && item.status === 'block'), 'Production release identity must be mandatory.');

const invalidApifyMode = evaluateLaunchReadiness({ ...productionFixture, APIFY_MODE: 'sometimes' });
expect(!invalidApifyMode.ready && invalidApifyMode.checks.some((item) => item.id === 'apify' && item.status === 'block'), 'Unknown Apify mode must fail closed.');

const root = process.cwd();
const gitignore = await readFile(join(root, '.gitignore'), 'utf8');
expect(gitignore.includes('.env') && gitignore.includes('!.env.example'), 'Local environment files are not safely ignored.');

const envExample = await readFile(join(root, '.env.example'), 'utf8');
for (const key of ['COANTO_LAUNCH_MODE', 'COANTO_SITE_URL', 'COANTO_RELEASE_SHA', 'INSFORGE_URL', 'INSFORGE_API_KEY', 'AUTH_RATE_LIMIT_SECRET', 'CRON_SECRET', 'AI_PROVIDER']) {
  expect(envExample.includes(`${key}=`), `.env.example missing launch key ${key}.`);
}

const packageJson = await readFile(join(root, 'package.json'), 'utf8');
expect(packageJson.includes('"packageManager":"bun@1.4.2"'), 'Launch toolchain must pin the Bun version.');

const launchWorkflow = await readFile(join(root, '.github', 'workflows', 'launch-gate.yml'), 'utf8');
for (const invariant of ['backup_confirmed', 'rollback_confirmed', 'rollback_sha', 'launch:check', 'launch:search-live', 'test:ai-live-e2e', '/api/ready', 'EXPECTED_SHA', 'git merge-base --is-ancestor', 'bun-version: 1.4.2']) {
  expect(launchWorkflow.includes(invariant), `Launch workflow missing ${invariant}.`);
}

const verifyWorkflow = await readFile(join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
expect(verifyWorkflow.includes('BUN_VERSION: 1.4.2'), 'Main CI must use the pinned Bun toolchain.');
expect(verifyWorkflow.includes('production-gate:') && verifyWorkflow.includes('PRODUCTION_GATE_OK'), 'Main CI must expose a single production gate after verification, runtime, and persistence checks.');

const runbook = await readFile(join(root, 'docs', 'LAUNCH.md'), 'utf8');
expect(runbook.includes('Validation launch') && runbook.includes('Commercial launch'), 'Launch profiles are undocumented.');
expect(runbook.includes('Backup / recovery gate') && runbook.includes('Rollback'), 'Recovery/rollback runbook is incomplete.');
expect(runbook.includes('Live AI quota/availability'), 'External AI launch blocker is undocumented.');

const vercel = await readFile(join(root, 'vercel.json'), 'utf8');
expect(vercel.includes('Strict-Transport-Security'), 'Production hosting config is missing HSTS.');
expect(vercel.includes('/api/monitoring-cron') && vercel.includes('0 * * * *'), 'Production monitoring cron is not scheduled hourly.');

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

const suspicious = [
  /\bik_[A-Za-z0-9_-]{24,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
];
const secretLeaks: string[] = [];
for (const directory of [join(root, 'src'), join(root, 'scripts'), join(root, 'docs'), join(root, '.github')]) {
  for (const path of await filesUnder(directory)) {
    if (!/\.(?:ts|tsx|md|yml|yaml)$/.test(path)) continue;
    const source = await readFile(path, 'utf8');
    for (const pattern of suspicious) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) secretLeaks.push(path);
    }
  }
}
expect(secretLeaks.length === 0, `Possible committed production secret patterns found: ${[...new Set(secretLeaks)].join(', ')}`);

console.log('LAUNCH_READINESS_SMOKE_OK', JSON.stringify({
  validationReady: true,
  commercialBlockedUntilGateway: true,
  recoveryGate: true,
  releaseIdentityRequired: true,
  strictLaunchMode: true,
  strictOrigins: true,
  secretSeparation: true,
  apifyModeValidated: true,
  toolchainPinned: true,
  monitoringCronScheduled: true,
  productionGate: true,
  secretLeakPatterns: 0,
}));
