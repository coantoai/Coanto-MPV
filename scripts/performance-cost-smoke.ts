import { readFile } from 'node:fs/promises';
import { analysisInputHash, getCostPolicy, operationKey, utcDayStart } from '../src/lib/cost-policy.server.ts';

const defaults = getCostPolicy({});
if (defaults.analysisCacheSeconds !== 600) throw new Error('Default analysis cache policy changed unexpectedly.');
if (defaults.analysisBurstLimit !== 4 || defaults.analysisDailyLimit !== 40) throw new Error('Default analysis budget policy changed unexpectedly.');
if (defaults.aiMaxOutputTokens !== 6000 || defaults.aiWebSearchMaxUses !== 6) throw new Error('Default AI cost policy changed unexpectedly.');

const bounded = getCostPolicy({
  COANTO_ANALYSIS_CACHE_SECONDS: '5',
  COANTO_ANALYSIS_BURST_LIMIT: '999',
  COANTO_ANALYSIS_DAILY_LIMIT: '0',
  COANTO_AI_PROMPT_MAX_CHARS: '9999999',
  COANTO_AI_MAX_OUTPUT_TOKENS: '1',
  COANTO_AI_WEB_SEARCH_MAX_USES: '100',
});
if (bounded.analysisCacheSeconds !== 60) throw new Error('Cache lower bound failed.');
if (bounded.analysisBurstLimit !== 20) throw new Error('Burst upper bound failed.');
if (bounded.analysisDailyLimit !== 1) throw new Error('Daily lower bound failed.');
if (bounded.aiPromptMaxChars !== 120000 || bounded.aiMaxOutputTokens !== 2048 || bounded.aiWebSearchMaxUses !== 10) throw new Error('AI budget clamps failed.');

const a = analysisInputHash({
  storeUrl: 'HTTPS://EXAMPLE.COM/',
  competitors: [' Beta.com ', 'alpha.com', 'alpha.com'],
  businessContextUpdatedAt: '2026-09-11T00:00:00.000Z',
});
const b = analysisInputHash({
  storeUrl: 'https://example.com/',
  competitors: ['alpha.com', 'beta.com'],
  businessContextUpdatedAt: '2026-09-11T00:00:00.000Z',
});
if (a !== b || a.length !== 64) throw new Error('Analysis input fingerprint is not stable.');

const minute = new Date('2026-09-11T01:02:10.000Z');
if (operationKey(a, minute) !== operationKey(a, new Date('2026-09-11T01:02:59.999Z'))) throw new Error('Duplicate minute bucket is unstable.');
if (operationKey(a, minute) === operationKey(a, new Date('2026-09-11T01:03:00.000Z'))) throw new Error('Duplicate minute bucket did not rotate.');
if (utcDayStart(new Date('2026-09-11T23:59:00.000Z')) !== '2026-09-11T00:00:00.000Z') throw new Error('UTC daily budget boundary failed.');

const analyze = await readFile(new URL('../src/routes/api/analyze.ts', import.meta.url), 'utf8');
for (const required of ['reserveAnalysisOperation', 'completeAnalysisOperation', 'failAnalysisOperation', 'ANALYSIS_BURST_LIMIT', 'ANALYSIS_DAILY_LIMIT', 'ANALYSIS_IN_PROGRESS', 'cacheHit']) {
  if (!analyze.includes(required)) throw new Error(`Analyze performance integration missing: ${required}`);
}
const aiEngine = await readFile(new URL('../src/lib/ai-engine.server.ts', import.meta.url), 'utf8');
for (const required of ['aiPromptMaxChars', 'aiMaxOutputTokens', 'aiWebSearchMaxUses', 'max_output_tokens', 'maxOutputTokens']) {
  if (!aiEngine.includes(required)) throw new Error(`AI cost boundary missing: ${required}`);
}

console.log('PERFORMANCE_COST_SMOKE_OK', JSON.stringify({
  cacheSeconds: defaults.analysisCacheSeconds,
  burstLimit: defaults.analysisBurstLimit,
  dailyLimit: defaults.analysisDailyLimit,
  maxOutputTokens: defaults.aiMaxOutputTokens,
  webSearchMaxUses: defaults.aiWebSearchMaxUses,
}));
