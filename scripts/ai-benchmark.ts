import { BENCHMARK_CASES } from './ai-benchmark-cases';

type Provider = 'openai' | 'gemini' | 'openrouter' | 'anthropic';
type Row = { provider: Provider; model: string; caseId: string; competitors: any[]; sources: string[]; raw: string; latencyMs: number; error?: string };

const keys: Record<Provider, string> = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const models: Record<Provider, string> = { openai: process.env.OPENAI_MODEL || 'gpt-5.6-luna', gemini: process.env.GEMINI_MODEL || 'gemini-3.8-flash', openrouter: process.env.OPENROUTER_MODEL || 'openrouter/auto', anthropic: process.env.ANTHROPIC_MODEL || 'claude-fable-5' };
const providers: Provider[] = ['openai', 'gemini', 'openrouter', 'anthropic'];
const cases = BENCHMARK_CASES.slice(0, 12);
const rows: Row[] = [];

function text(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (Array.isArray(data?.output)) return data.output.flatMap((x: any) => x?.content || []).map((x: any) => x?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.choices)) return data.choices.map((x: any) => x?.message?.content).filter(Boolean).join('\n');
  if (Array.isArray(data?.candidates)) return data.candidates.flatMap((x: any) => x?.content?.parts || []).map((x: any) => x?.text).filter(Boolean).join('\n');
  if (Array.isArray(data?.content)) return data.content.map((x: any) => x?.text).filter(Boolean).join('\n');
  return '';
}

function sources(data: any): string[] {
  const values = [
    ...(data?.output || []).flatMap((x: any) => x?.action?.sources || []).map((x: any) => x?.url),
    ...(data?.choices || []).flatMap((x: any) => x?.message?.annotations || []).map((x: any) => x?.url_citation?.url),
    ...(data?.candidates || []).flatMap((x: any) => x?.groundingMetadata?.groundingChunks || []).map((x: any) => x?.web?.uri),
    ...(data?.content || []).flatMap((x: any) => x?.content || []).map((x: any) => x?.url),
  ];
  return [...new Set(values.filter((x): x is string => typeof x === 'string'))];
}

async function call(provider: Provider, prompt: string) {
  const key = process.env[keys[provider]];
  if (!key) throw new Error(`missing ${keys[provider]}`);
  let response: Response;
  if (provider === 'openai') {
    response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: models.openai, input: prompt, tools: [{ type: 'web_search_preview' }], include: ['web_search_call.action.sources'] }) });
  } else if (provider === 'gemini') {
    let lastError = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models.gemini)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { responseMimeType: 'application/json' } }) });
      if (response.ok) break;
      const body = await response.text();
      lastError = `gemini ${response.status}${body ? `: ${body.slice(0, 1200)}` : ''}`;
      if (response.status !== 429 || attempt === 3) throw new Error(lastError);
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 15000)));
    }
  } else if (provider === 'openrouter') {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.COANTO_SITE_URL || 'https://coanto.com', 'X-Title': 'COANTO AI Benchmark' }, body: JSON.stringify({ model: models.openrouter, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'openrouter:web_search', parameters: { max_total_results: 8 } }] }) });
  } else {
    response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: models.anthropic, max_tokens: 3000, messages: [{ role: 'user', content: prompt }], tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 6 }] }) });
  }
  if (!response!.ok) {
    const body = await response!.text();
    throw new Error(`${provider} ${response!.status}${body ? `: ${body.slice(0, 1200)}` : ''}`);
  }
  const data = await response!.json();
  return { text: text(data), sources: sources(data) };
}

function domain(value: string) { try { return new URL(/^https?:/i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]; } }
function competitors(raw: string): any[] { const start = raw.indexOf('{'); const end = raw.lastIndexOf('}'); if (start < 0 || end <= start) return []; try { const data = JSON.parse(raw.slice(start, end + 1)); const list = data.competitors || data.competitor_domains || []; return Array.isArray(list) ? list.slice(0, 5).map((x: any) => typeof x === 'string' ? { domain: x } : x).filter(Boolean) : []; } catch { return []; } }
function score(found: any[], expected: string[]) { const foundDomains = new Set(found.map((x) => domain(String(x.domain || x.url || x.name || '')))); const expectedDomains = expected.map(domain); const hits = [...foundDomains].filter((x) => expectedDomains.some((e) => x === e || x.endsWith(`.${e}`) || e.endsWith(`.${x}`))).length; const grounded = found.filter((x) => Array.isArray(x.sourceUrls) && x.sourceUrls.length).length; const evidenced = found.filter((x) => typeof x.evidence === 'string' && x.evidence.trim()).length; return { hits, precision: found.length ? hits / Math.min(found.length, 5) : 0, recall: hits / Math.max(expectedDomains.length, 1), evidence: found.length ? (grounded + evidenced) / (2 * found.length) : 0 }; }

for (const provider of providers) {
  if (!process.env[keys[provider]]) { console.log(`SKIP ${provider}: ${keys[provider]} not configured`); continue; }
  for (const test of cases) {
    const prompt = `You are evaluating COANTO competitive intelligence. Research ${test.brand} (${test.url}). Identify the 5 most direct commercial competitors. Search the web and cross-check independent sources. Exclude directories, news, financial sites, generic marketplaces unless genuinely direct. Return JSON only: {"competitors":[{"name":"","domain":"","why":"","evidence":"","sourceUrls":[]}],"unknowns":[]}. Do not guess. Every competitor should have evidence and sourceUrls when available.`;
    const started = Date.now();
    try {
      const output = await call(provider, prompt);
      const found = competitors(output.text);
      rows.push({ provider, model: models[provider], caseId: test.id, competitors: found, sources: output.sources, raw: output.text.slice(0, 8000), latencyMs: Date.now() - started });
      const s = score(found, test.expectedCompetitors);
      console.log(`${provider}\t${test.id}\tP@5=${s.precision.toFixed(2)}\tR@5=${s.recall.toFixed(2)}\tevidence=${s.evidence.toFixed(2)}\tlatency=${Date.now() - started}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ provider, model: models[provider], caseId: test.id, competitors: [], sources: [], raw: '', latencyMs: Date.now() - started, error: message });
      console.log(`${provider}\t${test.id}\tERROR\t${message}`);
      if (/\b(401|403|404|429)\b|quota|rate.?limit|insufficient_quota/i.test(message)) { console.log(`STOP ${provider}: provider is unavailable/rate-limited; remaining cases skipped.`); break; }
    }
  }
}

const configured = providers.filter((p) => Boolean(process.env[keys[p]]));
const summary = providers.map((provider) => { const ok = rows.filter((x) => x.provider === provider && !x.error); const scored = ok.map((x) => score(x.competitors, cases.find((c) => c.id === x.caseId)?.expectedCompetitors || [])); return { provider, model: models[provider], status: process.env[keys[provider]] ? (ok.length ? 'tested' : 'failed') : 'blocked-missing-secret', cases: ok.length, failedCases: rows.filter((x) => x.provider === provider && x.error).length, meanPrecisionAt5: scored.length ? scored.reduce((a, b) => a + b.precision, 0) / scored.length : null, meanRecallAt5: scored.length ? scored.reduce((a, b) => a + b.recall, 0) / scored.length : null, meanEvidenceCoverage: scored.length ? scored.reduce((a, b) => a + b.evidence, 0) / scored.length : null, meanLatencyMs: ok.length ? ok.reduce((a, b) => a + b.latencyMs, 0) / ok.length : null }; });
const successfulCases = rows.filter((x) => !x.error && x.raw.trim()).length;
const report = { generatedAt: new Date().toISOString(), benchmarkVersion: '2026-09-v8', cases: cases.length, status: successfulCases ? 'tested' : configured.length ? 'failed-all-configured-providers' : 'blocked-missing-provider-secrets', configuredProviders: configured, successfulCases, summary, results: rows };
await Bun.write('ai-benchmark-report.json', JSON.stringify(report, null, 2));
console.log('\n=== COANTO AI BENCHMARK ===');
console.log(JSON.stringify(report, null, 2));
if (configured.length && !successfulCases) process.exitCode = 1;
