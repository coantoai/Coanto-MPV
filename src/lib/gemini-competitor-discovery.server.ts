import { fetchSite, hostname, normalizeUrl, searchEvidenceForUrl, type SiteSnapshot } from './analyze.server';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }

function parseJson(text: string) {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return {} as JsonRecord;
  try { return record(JSON.parse(cleaned.slice(start, end + 1))); } catch { return {} as JsonRecord; }
}

function candidateUrls(data: JsonRecord, ownHost: string) {
  const urls: string[] = [];
  for (const item of array(data['competitors'])) {
    const url = stringValue(record(item)['url']).trim();
    if (!url) continue;
    try {
      const normalized = normalizeUrl(url);
      const host = hostname(normalized);
      if (!host || host === ownHost || host.endsWith(`.${ownHost}`)) continue;
      if (!urls.some((existing) => hostname(existing) === host)) urls.push(normalized);
    } catch {}
  }
  return urls.slice(0, 10);
}

export async function discoverCompetitorsWithGemini(main: SiteSnapshot): Promise<SiteSnapshot[]> {
  const apiKey = process.env['GEMINI_API_KEY']?.trim();
  if (!apiKey) return [];
  const model = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.1-flash-lite';
  const ownHost = hostname(main.url);
  const context = [main.title, main.description, ...main.h1, ...main.h2, main.text.slice(0, 4500)].filter(Boolean).join('\n').slice(0, 7000);
  const prompt = `Find real commercial competitors of the business at ${main.url}. Use Google Search. Return only companies that sell substantially similar products/services to substantially similar customers. Prefer official company websites. Do not return directories, news sites, review sites, social networks, marketplaces unless the marketplace itself is a direct competitor, or the target business itself. Return up to 8 strong candidates.\n\nObserved target-site context:\n${context}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              competitors: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: { name: { type: 'STRING' }, url: { type: 'STRING' }, reason: { type: 'STRING' } },
                  required: ['name', 'url'],
                },
              },
            },
            required: ['competitors'],
          },
          temperature: 0.1,
          maxOutputTokens: 1800,
        },
      }),
    });
    if (!response.ok) {
      console.error('Gemini competitor discovery failed', { status: response.status });
      return [];
    }
    const raw = record(await response.json());
    const texts: string[] = [];
    for (const candidate of array(raw['candidates'])) {
      for (const part of array(record(record(candidate)['content'])['parts'])) {
        const text = stringValue(record(part)['text']);
        if (text) texts.push(text);
      }
    }
    const urls = candidateUrls(parseJson(texts.join('\n')), ownHost);
    const snapshots: SiteSnapshot[] = [];
    for (const url of urls) {
      try {
        const snapshot = await fetchSite(url);
        snapshots.push(snapshot);
      } catch {
        const indexed = await searchEvidenceForUrl(url);
        if (indexed) snapshots.push(indexed);
      }
    }
    return snapshots;
  } catch (error) {
    console.error('Gemini competitor discovery unavailable', { error });
    return [];
  } finally {
    clearTimeout(timer);
  }
}
