import { BENCHMARK_CASES } from './ai-benchmark-cases';

type Provider = 'openai' | 'gemini' | 'anthropic';
type Result = { provider: Provider; model: string; caseId: string; competitors: string[]; sources: string[]; raw: string; latencyMs: number; error?: string };

const providerKeys: Record<Provider, string> = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const models: Record<Provider, string> = {
  openai: process.env.OPENAI_MODEL || 'gpt-5.2',
  gemini: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
};

function host(value: string) { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
function normalizeCompetitor(value: string) { return host(value) || value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''); }
function extractText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) return data.output.flatMap((item: any) => item?.content ?? []).map((item: any) => item?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.candidates)) return data.candidates.flatMap((c: any) => c?.content?.parts ?? []).map((p: any) => p?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.content)) return data.content.map((item: any) => item?.text).filter(Boolean).join('\n');
  return '';
}
function extractSources(data: any): string[] {
  const urls = [
    ...(data?.output ?? []).flatMap((item: any) => item?.action?.sources ?? []).map((x: any) => x?.url),
    ...(data?.candidates ?? []).flatMap((c: any) => c?.groundingMetadata?.groundingChunks ?? []).map((x: any) => x?.web?.uri),
    ...(data?.content ?? []).flatMap((x: any) => x?.content ?? []).map((x: any) => x?.url),
  ];
  return [...new Set(urls.filter((x): x is string => typeof x === 'string'))];
}

async function callProvider(provider: Provider, prompt: string) {
  const key = process.env[providerKeys[provider]];
  if (!key) throw new Error(`missing ${providerKeys[provider]}`);
  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: models.openai, input: prompt, tools: [{ type: 'web_search_preview' }], include: ['web_search_call.action.sources'] }) });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { text: extractText(data), sources: extractSources(data) };
  }
  if (provider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models.gemini)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }) });
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return { text: extractText(data), sources: extractSources(data) };
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: models.anthropic, max_tokens: 3000, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 6 }] }) });
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { text: extractText(data), sources: extractSources(data) };
}

function parseCompetitors(text: string): string[] {
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { const parsed = JSON.parse(text.slice(start, end + 1)); const values = parsed.competitors ?? parsed.competitor_domains ?? []; if (Array.isArray(values)) return values.map((x: any) => typeof x === 'string' ? x : x?.domain || x?.url || x?.name).filter(Boolean).slice(0, 5); } catch {}
  }
  return [];
}

function score(found: string[], expected: string[]) {
  const f = new Set(found.map(normalizeCompetitor)); const e = new Set(expected.map(normalizeCompetitor));
  const hits = [...f].filter((item) => [...e].some((target) => item === target || item.endsWith(`.${target}`) || target.endsWith(`.${item}`))).length;
  return { hits, precisionAt5: found.length ? hits / Math.min(found.length, 5) : 0, recallAt5: hits / Math.max(e.size, 1) };
}

const providers: Provider[] = ['openai', 'gemini', 'anthropic'];
const results: Result[] = [];
for (const provider of providers) {
  if (!process.env[providerKeys[provider]]) { console.log(`SKIP ${provider}: ${providerKeys[provider]} not configured`); continue; }
  for (const test of BENCHMARK_CASES) {
    const prompt = `You are evaluating competitive intelligence quality for COANTO. Research ${test.brand} (${test.url}). Identify the 5 most direct commercial competitors for this exact business. Search the web and cross-check multiple independent sources. Exclude directories, news sites, stock/financial sites, generic marketplaces unless they are genuine direct competitors, and exclude the target itself. Return JSON only: {"competitors":[{"name":"","domain":"","why":"","evidence":"","sourceUrls":[]}],"unknowns":[]}. Do not guess. ${test.brand} is the target business.`;
    const started = Date.now();
    try {
      const output = await callProvider(provider, prompt);
      const competitors = parseCompetitors(output.text);
      results.push({ provider, model: models[provider], caseId: test.id, competitors, sources: output.sources, raw: output.text.slice(0, 8000), latencyMs: Date.now() - started });
      const s = score(competitors, test.expectedCompetitors);
      console.log(`${provider}\t${test.id}\thits=${s.hits}\tP@5=${s.precisionAt5.toFixed(2)}\tR@5=${s.recallAt5.toFixed(2)}\tlatency=${Date.now() - started}ms`);
    } catch (error) {
      results.push({ provider, model: models[provider], caseId: test.id, competitors: [], sources: [], raw: '', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
      console.log(`${provider}\t${test.id}\tERROR\t${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const summary = providers.map((provider) => {
  const rows = results.filter((r) => r.provider === provider && !r.error);
  const scored = rows.map((row) => score(row.competitors, BENCHMARK_CASES.find((c) => c.id === row.caseId)?.expectedCompetitors ?? []));
  return {
    provider,
    model: models[provider],
    cases: rows.length,
    meanPrecisionAt5: scored.length ? scored.reduce((a, b) => a + b.precisionAt5, 0) / scored.length : 0,
    meanRecallAt5: scored.length ? scored.reduce((a, b) => a + b.recallAt5, 0) / scored.length : 0,
    meanLatencyMs: rows.length ? rows.reduce((a, b) => a + b.latencyMs, 0) / rows.length : 0,
  };
});

console.log('\n=== COANTO AI BENCHMARK ===');
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2));
