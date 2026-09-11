export type LaunchMode = 'validation' | 'commercial';
export type ReadinessStatus = 'pass' | 'warn' | 'block';
export type LaunchReadinessCheck = {
  id: string;
  status: ReadinessStatus;
  message: string;
};
export type LaunchReadinessReport = {
  mode: LaunchMode;
  ready: boolean;
  blockers: number;
  warnings: number;
  checks: LaunchReadinessCheck[];
  configuredAiProviders: string[];
  configuredSearchProviders: string[];
};

const AI_PROVIDERS = [
  ['gemini', 'GEMINI_API_KEY'],
  ['openai', 'OPENAI_API_KEY'],
  ['openrouter', 'OPENROUTER_API_KEY'],
  ['anthropic', 'ANTHROPIC_API_KEY'],
] as const;
const SEARCH_PROVIDERS = [
  ['brave', 'BRAVE_SEARCH_API_KEY'],
  ['bing', 'BING_SEARCH_V7_KEY'],
] as const;

// Stage 16 deliberately kept the billing core provider-neutral. Commercial launch
// must remain blocked until a real signed provider adapter lands in code review.
const COMMERCIAL_BILLING_ADAPTER_IMPLEMENTED = false;

function value(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() || '';
}
function secretStrong(secret: string) {
  return secret.length >= 32;
}
function httpsPublicUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
  } catch {
    return false;
  }
}
function push(checks: LaunchReadinessCheck[], id: string, status: ReadinessStatus, message: string) {
  checks.push({ id, status, message });
}

export function launchMode(env: NodeJS.ProcessEnv = process.env): LaunchMode {
  return value(env, 'COANTO_LAUNCH_MODE').toLowerCase() === 'commercial' ? 'commercial' : 'validation';
}

export function evaluateLaunchReadiness(env: NodeJS.ProcessEnv = process.env): LaunchReadinessReport {
  const checks: LaunchReadinessCheck[] = [];
  const mode = launchMode(env);
  const insforgeUrl = value(env, 'INSFORGE_URL');
  const insforgeKey = value(env, 'INSFORGE_API_KEY');
  const siteUrl = value(env, 'COANTO_SITE_URL');
  const cronSecret = value(env, 'CRON_SECRET');
  const authSecret = value(env, 'AUTH_RATE_LIMIT_SECRET');
  const preferredAi = value(env, 'AI_PROVIDER').toLowerCase() || 'gemini';
  const configuredAiProviders: string[] = AI_PROVIDERS.filter(([, key]) => Boolean(value(env, key))).map(([provider]) => provider);
  const configuredSearchProviders: string[] = SEARCH_PROVIDERS.filter(([, key]) => Boolean(value(env, key))).map(([provider]) => provider);
  const siteOriginReady = httpsPublicUrl(siteUrl);
  const insforgeOriginReady = httpsPublicUrl(insforgeUrl);

  push(checks, 'launch-mode', 'pass', `Launch profile: ${mode}.`);
  push(checks, 'site-origin', siteOriginReady ? 'pass' : 'block', siteOriginReady ? 'Public site origin is HTTPS.' : 'COANTO_SITE_URL must be a public HTTPS URL.');
  push(checks, 'insforge-url', insforgeOriginReady ? 'pass' : 'block', insforgeOriginReady ? 'InsForge origin is HTTPS.' : 'INSFORGE_URL must be a public HTTPS URL.');
  push(checks, 'insforge-key', insforgeKey.startsWith('ik_') && insforgeKey.length >= 12 ? 'pass' : 'block', insforgeKey.startsWith('ik_') && insforgeKey.length >= 12 ? 'InsForge project key is configured.' : 'INSFORGE_API_KEY is missing or malformed.');
  push(checks, 'auth-throttle-secret', secretStrong(authSecret) ? 'pass' : 'block', secretStrong(authSecret) ? 'Independent auth-throttle secret is configured.' : 'AUTH_RATE_LIMIT_SECRET must be an independent secret with at least 32 characters.');
  push(checks, 'cron-secret', secretStrong(cronSecret) ? 'pass' : 'block', secretStrong(cronSecret) ? 'Monitoring cron secret is launch-grade.' : 'CRON_SECRET must contain at least 32 characters.');

  push(checks, 'ai-provider', configuredAiProviders.length ? 'pass' : 'block', configuredAiProviders.length ? `Configured AI providers: ${configuredAiProviders.join(', ')}.` : 'At least one AI provider API key is required.');
  push(checks, 'preferred-ai-provider', configuredAiProviders.includes(preferredAi) ? 'pass' : 'block', configuredAiProviders.includes(preferredAi) ? `Preferred AI provider ${preferredAi} is configured.` : `AI_PROVIDER=${preferredAi} has no configured API key.`);
  push(checks, 'search-provider', configuredSearchProviders.length ? 'pass' : 'block', configuredSearchProviders.length ? `Configured discovery search: ${configuredSearchProviders.join(', ')}.` : 'At least one search provider is required for launch competitor discovery.');

  const apifyMode = value(env, 'APIFY_MODE').toLowerCase() || 'fallback';
  const apifyToken = value(env, 'APIFY_TOKEN');
  if (apifyMode === 'preferred' && !apifyToken) push(checks, 'apify', 'block', 'APIFY_MODE=preferred requires APIFY_TOKEN.');
  else if (apifyToken) push(checks, 'apify', 'pass', `Apify acquisition is configured in ${apifyMode || 'fallback'} mode.`);
  else push(checks, 'apify', 'warn', 'Apify is not configured; direct acquisition remains available but difficult pages may have reduced coverage.');

  const releaseSha = value(env, 'COANTO_RELEASE_SHA') || value(env, 'VERCEL_GIT_COMMIT_SHA') || value(env, 'GITHUB_SHA');
  push(checks, 'release-identity', releaseSha.length >= 7 ? 'pass' : 'warn', releaseSha.length >= 7 ? 'Release commit identity is available for observability.' : 'Release SHA is not set; production incidents will be harder to map to a commit.');

  if (mode === 'commercial') {
    push(checks, 'commercial-billing-adapter', COMMERCIAL_BILLING_ADAPTER_IMPLEMENTED ? 'pass' : 'block', COMMERCIAL_BILLING_ADAPTER_IMPLEMENTED ? 'Signed production payment adapter is implemented.' : 'Commercial launch is blocked until a real signed payment-provider adapter is implemented and verified.');
  } else {
    push(checks, 'commercial-billing-adapter', 'warn', 'Validation launch intentionally has no paid checkout; commercial launch remains blocked until a real payment adapter is implemented.');
  }

  push(checks, 'live-ai-proof', 'warn', 'Configuration cannot prove provider quota/availability. The manual launch gate must pass the live AI E2E before public launch.');
  push(checks, 'backup-proof', 'warn', 'Repository checks cannot prove a fresh production backup. The manual launch gate requires backup and rollback confirmation.');

  const blockers = checks.filter((check) => check.status === 'block').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  return { mode, ready: blockers === 0, blockers, warnings, checks, configuredAiProviders, configuredSearchProviders };
}
