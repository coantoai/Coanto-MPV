import { BENCHMARK_CASES } from './ai-benchmark-cases';

type Provider = 'openai' | 'gemini' | 'openrouter' | 'anthropic';
type CompetitorResult = { name?: string; domain?: string; url?: string; why?: string; evidence?: string; sourceUrls?: string[] };
type Result = {
  provider: Provider;
  model: string;
  caseId: string;
  competitors: CompetitorResult[];
  sources: string[];
  raw: string;
  latencyMs: number;
  error?: string;
};

const providerKeys: Record<Provider, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};
const models: Record<Provider, string> = {
  openai: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  gemini: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  openrouter: process.env.OPENROUTER_MODEL || 'openrouter/auto',
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-fable-5',
};

const benchmarkCases = BENCHMARK_CASES.slice(0, 12);

function host(value: string) {
  try {
    return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeCompetitor(value: string) {
  return host(value) || value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
}

function extractText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) return data.output.flatMap((item: any) => item?.content ?? []).map((item: any) => item?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.choices)) return data.choices.map((choice: any) => choice?.message?.content).filter(Boolean).join('\n');
  if (Array.isArray(data?.candidates)) return data.candidates.flatMap((c: any) => c?.content?.parts ?? []).map((p: any) => p?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.content)) return data.content.map((item: any) => item?.text).filter(Boolean).join('\n');
  return '';
}

function extractSources(data: any): string[] {
  const urls = [
    ...(data?.output ?? []).flatMap((item: any) => item?.action?.sources ?? []).map((x: any) => x?.url),
    ...(data?.choices ?? []).flatMap((choice: any) => choice?.message?.annotations ?? []).map((x: any) => x?.url_citation?.url),
    ...(data?.candidates ?? []).flatMap((c: any) => c?.groundingMetadata?.groundingChunks ?? []).map((x: any) => x?.web?.uri),
    ...(data?.content ?? []).flatMap((x: any) => x?.content ?? []).map((x: any) => x?.url),
  ];
  return [...new Set(urls.filter((x): x is string => typeof x === 'string'))];
}

async function callProvider(provider: Provider, prompt: string) {
  const key = process.env[providerKeys[provider]];
  if (!key) throw new Error(`missing ${providerKeys[provider]}`);
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: models.openai, input: prompt, tools: [{ type: 'web_search_preview' }], include: ['web_search_call.action.sources'] }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    return { text: extractText(data), sources: extractSources(data) };
  }
  if (provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models.gemini)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!response.ok) throw new Error(`Gemini ${response.status}`);
    const data = await response.json();
    return { text: extractText(data), sources: extractSources(data) };
  }
  if (provider === 'openrouter') {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.COANTO_SITE_URL || 'https://coanto.com',
        'X-Title': 'COANTO AI Benchmark',
      },
      body: JSON.stringify({ model: models.openrouter, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'openrouter:web_search', parameters: { max_total_results: 8 } }] }),
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
    const data = await response.json();
    return { text: extractText(data), sources: extractSources(data) };
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: models.anthropic, max_tokens: 3000, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 6 }] }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  return { text: extractText(data), sources: extractSources(data) };
}

function parseCompetitors(text: string): CompetitorResult[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const values = parsed.competitors ?? parsed.competitor_domains ?? [];
    if (!Array.isArray(values)) return [];
    return values.map((value: any) => typeof value === 'string' ? { domain: value } : value).filter((value: any) => value && typeof value === 'object').slice(0, 5);
  } catch {
    return [];
  }
}

function competitorValue(item: CompetitorResult) {
  return item.domain || item.url || item.name || '';
}

function score(found: CompetitorResult[], expected: string[]) {
  const f = new Set(found.map(competitorValue).map(normalizeCompetitor).filter(Boolean));
  const e = new Set(expected.map(normalizeCompetitor).filter(Boolean));
  const hits = [...f].filter((item) => [...e].some((target) => item === target || item.endsWith(`.${target}`) || target.endsWith(`.${item}`))).length;
  const grounded = found.filter((item) => Array.isArray(item.sourceUrls) && item.sourceUrls.length > 0).length;
  const evidenced = found.filter((item) => typeof item.evidence === 'string' && item.evidence.trim().length > 0).length;
  return { hits, precisionAt5: found.length ? hits / Math.min(found.length, 5) : 0, recallAt5: hits / Math.max(e.size, 1), evidenceCoverage: found.length ? (grounded + evidenced) / (2 * found.length) : 0 };
}

const providers: Provider[] = ['openai', 'gemini', 'openrouter', 'anthropic'];
const results: Result[] = [];
const configured = providers.filter((provider) => Boolean(process.env[providerKeys[provider]]));

for (const provider of providers) {
  if (!process.env[providerKeys[provider]]) {
    console.log(`SKIP ${provider}: ${providerKeys[provider]} not configured`);
    continue;
  }
  for (const test of benchmarkCases) {
    const prompt = `You are evaluating competitive intelligence quality for COANTO. Research ${test.brand} (${test.url}). Identify the 5 most direct commercial competitors for this exact business. Search the web and cross-check multiple independent sources. Exclude directories, news sites, stock/financial sites, generic marketplaces unless they are genuine direct competitors, and exclude the target itself. Return JSON only: {"competitors":[{"name":"","domain":"","why":"","evidence":"","sourceUrls":[]}],"unknowns":[]}. Every competitor must have evidence and sourceUrls when the web research supports them. Do not guess. ${test.brand} is the target business.`;
    const started = Date.now();
    try {
      const output = await callProvider(provider, prompt);
      const competitors = parseCompetitors(output.text);
      results.push({ provider, model: models[provider], caseId: test.id, competitors, sources: output.sources, raw: output.text.slice(0, 8000), latencyMs: Date.now() - started });
      const s = score(competitors, test.expectedCompetitors);
      console.log(`${provider}\t${test.id}\thits=${s.hits}\tP@5=${s.precisionAt5.toFixed(2)}\tR@5=${s.recallAt5.toFixed(2)}\tevidence=${s.evidenceCoverage.toFixed(2)}\tlatency=${Date.now() - started}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ provider, model: models[provider], caseId: test.id, competitors: [], sources: [], raw: '', latencyMs: Date.now() - started, error: message.slice(0, 240) });
      console.log(`${provider}\t${test.id}\tERROR\t${message.slice(0, 240)}`);
    }
  }
}

const summary = providers.map((provider) => {
  const rows = results.filter((r) => r.provider === provider && !r.error);
  const scored = rows.map((row) => score(row.competitors, benchmarkCases.find((c) => c.id === row.caseId)?.expectedCompetitors ?? []));
  return {
    provider,
    model: models[provider],
    status: process.env[providerKeys[provider]] ? (rows.length ? 'tested' : 'failed') : 'blocked-missing-secret',
    cases: rows.length,
    failedCases: results.filter((r) => r.provider === provider && Boolean(r.error)).length,
    meanPrecisionAt5: scored.length ? scored.reduce((a, b) => a + b.precisionAt5, 0) / scored.length : null,
    meanRecallAt5: scored.length ? scored.reduce((a, b) => a + b.recallAt5, 0) / scored.length : null,
    meanEvidenceCoverage: scored.length ? scored.reduce((a, b) => a + b.evidenceCoverage, 0) / scored.length : null,
    meanLatencyMs: rows.length ? rows.reduce((a, b) => a + b.latencyMs, 0) / rows.length : null,
  };
});

const successfulCases = results.filter((result) => !result.error && result.raw.trim().length > 0).length;
const report = {
  generatedAt: new Date().toISOString(),
  benchmarkVersion: '2026-09-v6',
  cases: benchmarkCases.length,
  status: successfulCases > 0 ? 'tested' : configured.length ? 'failed-all-configured-providers' : 'blocked-missing-provider-secrets',
  configuredProviders: configured,
  successfulCases,
  summary,
  results,
};
await Bun.write('ai-benchmark-report.json', JSON.stringify(report, null, 2));
console.log('\n=== COANTO AI BENCHMARK ===');
console.log(JSON.stringify(report, null, 2));
if (configured.length > 0 && successfulCases === 0) process.exitCode = 1;
