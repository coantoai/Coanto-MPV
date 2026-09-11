import { createHash } from 'node:crypto';

export type CostPolicy = {
  analysisCacheSeconds: number;
  analysisBurstLimit: number;
  analysisDailyLimit: number;
  aiPromptMaxChars: number;
  aiMaxOutputTokens: number;
  aiWebSearchMaxUses: number;
};

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getCostPolicy(env: NodeJS.ProcessEnv = process.env): CostPolicy {
  return {
    analysisCacheSeconds: boundedInteger(env['COANTO_ANALYSIS_CACHE_SECONDS'], 600, 60, 3600),
    analysisBurstLimit: boundedInteger(env['COANTO_ANALYSIS_BURST_LIMIT'], 4, 1, 20),
    analysisDailyLimit: boundedInteger(env['COANTO_ANALYSIS_DAILY_LIMIT'], 40, 1, 500),
    aiPromptMaxChars: boundedInteger(env['COANTO_AI_PROMPT_MAX_CHARS'], 60_000, 10_000, 120_000),
    aiMaxOutputTokens: boundedInteger(env['COANTO_AI_MAX_OUTPUT_TOKENS'], 6_000, 2_048, 12_000),
    aiWebSearchMaxUses: boundedInteger(env['COANTO_AI_WEB_SEARCH_MAX_USES'], 6, 2, 10),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function analysisInputHash(input: {
  storeUrl: string;
  competitors: string[];
  businessContextUpdatedAt: string;
}) {
  const payload = {
    storeUrl: input.storeUrl.trim().toLowerCase(),
    competitors: [...new Set(input.competitors.map((item) => item.trim().toLowerCase()).filter(Boolean))].sort(),
    businessContextUpdatedAt: input.businessContextUpdatedAt,
  };
  return createHash('sha256').update(JSON.stringify(stableValue(payload)), 'utf8').digest('hex');
}

export function operationKey(inputHash: string, now = new Date()) {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  return createHash('sha256').update(`${inputHash}:${minuteBucket}`, 'utf8').digest('hex');
}

export function utcDayStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
