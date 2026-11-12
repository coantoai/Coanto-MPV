import { fetchSite, hostname, normalizeUrl, searchEvidenceForUrl, validateTargetUrl, type SiteSnapshot } from './analyze.server';

type JsonRecord = Record<string, unknown>;
type GeminiCandidate = { name: string; url: string; reason: string; category: string; commercialEvidence: string };
type GroundingSource = { index: number; uri: string; title: string };
type GroundingSupport = { start: number; end: number; text: string; chunkIndices: number[] };
export type GeminiDiscoveryResult = { snapshots: SiteSnapshot[]; candidateCount: number; searchQueries: number; status: 'ok' | 'missing-key' | 'provider-error' | 'empty' };

function record(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown): number { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? parsed : -1; }
function normalizedText(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }

function parseJson(text: string) {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try { return record(JSON.parse(cleaned.slice(start, i + 1))); } catch { break; }
        }
      }
    }
  }
  return {} as JsonRecord;
}


const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 1_000;
function retryDelayMs(response: Response, errorBody: string, attempt: number) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(15_000, Math.max(0, seconds * 1_000));
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.min(15_000, dateDelay);
  }
  try {
    const payload = JSON.parse(errorBody) as JsonRecord;
    const details = array(record(payload['error'])['details']);
    for (const detail of details) {
      const delay = stringValue(record(detail)['retryDelay']);
      const match = delay.match(/^(\\d+(?:\\.\\d+)?)s$/);
      if (match) return Math.min(15_000, Math.max(0, Number(match[1]) * 1_000));
    }
  } catch {}
  return Math.min(8_000, GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}
function isRetryableGeminiError(status: number, errorBody: string) {
  if (status === 503 || status === 502 || status === 504) return true;
  if (status !== 429) return false;
  // A daily quota exhaustion cannot be fixed by retrying within this request.
  return !/(you exceeded your current quota|check your plan and billing|per[_ ]day|requests per day|daily quota|quota exceeded for quota metric.*per.?day)/i.test(errorBody);
}
async function fetchGeminiWithRetry(url: string, init: RequestInit) {
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok || attempt === GEMINI_MAX_ATTEMPTS || !isRetryableGeminiError(response.status, await response.clone().text())) return response;
    const body = await response.clone().text();
    const delay = retryDelayMs(response, body, attempt);
    console.warn('Retrying transient Gemini API failure', { status: response.status, attempt, maxAttempts: GEMINI_MAX_ATTEMPTS, delayMs: delay });
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error('Gemini retry loop ended unexpectedly');
}

const rejectedHosts = ['facebook.com','instagram.com','youtube.com','linkedin.com','x.com','twitter.com','pinterest.com','reddit.com','wikipedia.org','google.com','bing.com','duckduckgo.com','tiktok.com','amazon.com','ebay.com','etsy.com','similarweb.com','statista.com','crunchbase.com'];
function rejectedHost(host: string) { return rejectedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)); }
function canonicalHomepage(url: string) {
  const validation = validateTargetUrl(url);
  if (!validation.ok || !validation.url) return '';
  const parsed = new URL(validation.url);
  return `${parsed.protocol}//${parsed.host}/`;
}
function competitorCandidates(data: JsonRecord, ownHost: string) {
  const out: GeminiCandidate[] = [];
  for (const raw of array(data['competitors'])) {
    const item = record(raw);
    const name = stringValue(item['name']).trim();
    const rawUrl = stringValue(item['url']).trim();
    const reason = stringValue(item['reason']).trim();
    const category = stringValue(item['category']).trim();
    const commercialEvidence = stringValue(item['commercialEvidence']).trim();
    if (!name || !rawUrl || !reason || !commercialEvidence) continue;
    const normalized = canonicalHomepage(rawUrl);
    const host = hostname(normalized);
    if (!normalized || !host || host === ownHost || host.endsWith(`.${ownHost}`) || rejectedHost(host)) continue;
    if (!out.some((existing) => hostname(existing.url) === host)) out.push({ name, url: normalizeUrl(normalized), reason, category, commercialEvidence });
  }
  return out.slice(0, 6);
}
function responseText(data: JsonRecord) {
  const texts: string[] = [];
  for (const candidate of array(data['candidates'])) {
    const content = record(record(candidate)['content']);
    for (const part of array(content['parts'])) {
      const text = stringValue(record(part)['text']);
      if (text) texts.push(text);
    }
  }
  return texts.join('\n').trim();
}
function searchCount(data: JsonRecord) {
  let count = 0;
  for (const candidate of array(data['candidates'])) {
    const metadata = record(record(candidate)['groundingMetadata']);
    count += array(metadata['webSearchQueries']).filter((query) => Boolean(stringValue(query).trim())).length;
  }
  return count;
}
function groundingData(data: JsonRecord) {
  const sources: GroundingSource[] = [];
  const supports: GroundingSupport[] = [];
  for (const candidate of array(data['candidates'])) {
    const metadata = record(record(candidate)['groundingMetadata']);
    const chunks = array(metadata['groundingChunks']);
    chunks.forEach((chunk, index) => {
      const web = record(record(chunk)['web']);
      const uri = stringValue(web['uri']).trim();
      const title = stringValue(web['title']).trim();
      if (!uri) return;
      const key = `${uri}|${title}`;
      if (!sources.some((source) => `${source.uri}|${source.title}` === key)) sources.push({ index, uri, title });
    });
    for (const rawSupport of array(metadata['groundingSupports'])) {
      const support = record(rawSupport);
      const segment = record(support['segment']);
      const start = numberValue(segment['startIndex']);
      const end = numberValue(segment['endIndex']);
      const text = stringValue(segment['text']);
      const chunkIndices = array(support['groundingChunkIndices']).map(numberValue).filter((index) => Number.isInteger(index) && index >= 0);
      if (chunkIndices.length) supports.push({ start, end, text, chunkIndices });
    }
  }
  return { sources, supports };
}
function candidateGroundingSources(candidate: GeminiCandidate, outputText: string, grounding: ReturnType<typeof groundingData>) {
  const lower = outputText.toLowerCase();
  const hostNeedle = hostname(candidate.url);
  const hostRoot = normalizedText(hostNeedle.split('.')[0] ?? '');
  const nameNeedle = normalizedText(candidate.name);
  const urlNeedle = candidate.url.toLowerCase().replace(/\/$/, '');
  const positions = [lower.indexOf(urlNeedle), lower.indexOf(hostNeedle), lower.indexOf(candidate.name.toLowerCase())].filter((position) => position >= 0);
  const indices = new Set<number>();

  for (const support of grounding.supports) {
    const segmentText = normalizedText(support.text);
    const textMatch = Boolean(nameNeedle && segmentText.includes(nameNeedle)) || Boolean(hostRoot.length >= 4 && segmentText.includes(hostRoot));
    const rangeMatch = positions.some((position) => support.start >= 0 && support.end >= support.start && position >= support.start - 500 && position <= support.end + 900);
    if (textMatch || rangeMatch) for (const index of support.chunkIndices) indices.add(index);
  }

  const supportMatched = grounding.sources.filter((source) => indices.has(source.index));
  const sourceMatched = grounding.sources.filter((source) => {
    const title = normalizedText(source.title);
    const uri = source.uri.toLowerCase();
    const titleMatch = Boolean(nameNeedle.length >= 3 && title.includes(nameNeedle)) || Boolean(hostRoot.length >= 4 && title.includes(hostRoot));
    const uriMatch = Boolean(hostNeedle && uri.includes(hostNeedle));
    return titleMatch || uriMatch;
  });

  const unique = new Map<string, GroundingSource>();
  for (const source of [...supportMatched, ...sourceMatched]) unique.set(`${source.uri}|${source.title}`, source);
  return [...unique.values()].slice(0, 4);
}
function discoveryModel() { return process.env['GEMINI_DISCOVERY_MODEL']?.trim() || 'gemini-3.1-flash-lite'; }
function groundedEvidence(candidate: GeminiCandidate, sources: GroundingSource[]) {
  if (!sources.length) return [];
  return [
    `Gemini Google Search grounded competitor candidate: ${candidate.name} — ${candidate.reason}`,
    `Grounded category: ${candidate.category}`,
    `Grounded commercial evidence: ${candidate.commercialEvidence}`,
    ...sources.map((source) => `Google Search grounding source: ${source.title || 'public web source'} — ${source.uri}`),
  ];
}
function augmentSnapshot(site: SiteSnapshot, candidate: GeminiCandidate, sources: GroundingSource[]): SiteSnapshot {
  // Never let ungrounded model prose influence verification scores. If Google Search
  // did not link evidence to this exact candidate, verification uses only the site/index snapshot.
  if (!sources.length) return site;
  const grounded = groundedEvidence(candidate, sources);
  const candidateContext = `Grounded discovery candidate: ${candidate.name}. Category: ${candidate.category}. Commercial evidence: ${candidate.commercialEvidence}. ${candidate.reason}`;
  return {
    ...site,
    description: [site.description, candidate.reason].filter(Boolean).join(' '),
    text: `${site.text}\n${candidateContext}`.slice(0, 18000),
    evidence: [...site.evidence, ...grounded],
  };
}
function groundedSnapshot(candidate: GeminiCandidate, sources: GroundingSource[]): SiteSnapshot {
  return {
    url: candidate.url,
    title: candidate.name,
    description: candidate.reason,
    h1: [candidate.name],
    h2: candidate.category ? [candidate.category] : [],
    text: `Google Search grounded public evidence. ${candidate.name}. Category: ${candidate.category}. Commercial evidence: ${candidate.commercialEvidence}. ${candidate.reason}`.slice(0, 12000),
    sourceType: 'search-index',
    evidence: groundedEvidence(candidate, sources),
  };
}

export async function discoverCompetitorsWithGemini(main: SiteSnapshot): Promise<GeminiDiscoveryResult> {
  const apiKey = process.env['GEMINI_API_KEY']?.trim();
  if (!apiKey) return { snapshots: [], candidateCount: 0, searchQueries: 0, status: 'missing-key' };
  const model = discoveryModel();
  const ownHost = hostname(main.url);
  const context = [main.title, main.description, ...main.h1, ...main.h2, main.text.slice(0, 4500)].filter(Boolean).join('\n').slice(0, 6500);
  // Stage 1: natural-language Google Search research. This keeps tool use separate
  // from JSON formatting, which previously caused Gemini to answer without invoking Search.
  const researchPrompt = `You MUST use the Google Search tool now. Search the live web for direct commercial competitors of ${main.url}. Do not answer from memory. Identify the target company's actual products, customers, and category, then search for companies selling substantially similar products/services to similar customers. Return a concise research report naming up to 6 direct competitors, each with its official homepage URL and the public evidence that supports the match. Cite sources in the answer. If the search does not find reliable evidence, say so and do not guess. Target-site context:\\n${context}`;
  const extractionPrompt = (research: string, sourceList: GroundingSource[]) => `Convert ONLY the following Google Search research into the required JSON. Do not add any company, URL, category, reason, or commercial claim that is not explicitly supported by the research and its listed sources. If a candidate cannot be tied to a listed source, omit it. Return JSON only in this shape: {"competitors":[{"name":"Company","url":"https://official.example/","reason":"...","category":"...","commercialEvidence":"..."}]}.\\n\\nGOOGLE SEARCH RESEARCH:\\n${research}\\n\\nGROUNDING SOURCES:\\n${sourceList.map((source) => `- ${source.title}: ${source.uri}`).join('\\n')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const researchResponse = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: researchPrompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1, maxOutputTokens: 2200 } }),
    });
    if (!researchResponse.ok) {
      const detail = (await researchResponse.text()).slice(0, 1500);
      console.error('Gemini Google Search grounding request failed; no ungrounded fallback is permitted', { model, status: researchResponse.status, detail });
      return { snapshots: [], candidateCount: 0, searchQueries: 0, status: 'provider-error' };
    }
    const researchRaw = record(await researchResponse.json());
    const researchText = responseText(researchRaw);
    const queries = searchCount(researchRaw);
    const grounding = groundingData(researchRaw);
    if (queries < 1 || grounding.sources.length < 1) {
      console.error('Gemini did not execute Google Search Grounding or return source URLs; rejecting ungrounded discovery', { model, searchQueries: queries, groundingSources: grounding.sources.length });
      return { snapshots: [], candidateCount: 0, searchQueries: queries, status: 'provider-error' };
    }

    // Stage 2: structure only the already-grounded research. This request cannot
    // introduce new research facts because every output field is checked against Stage 1.
    const extractionResponse = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: extractionPrompt(researchText, grounding.sources) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1800, responseMimeType: 'application/json' },
      }),
    });
    if (!extractionResponse.ok) {
      const detail = (await extractionResponse.text()).slice(0, 1500);
      console.error('Gemini grounded-research structuring failed', { model, status: extractionResponse.status, detail });
      return { snapshots: [], candidateCount: 0, searchQueries: queries, status: 'provider-error' };
    }
    const structuredRaw = record(await extractionResponse.json());
    const structuredText = responseText(structuredRaw);
    const candidates = competitorCandidates(parseJson(structuredText), ownHost);
    const settled = await Promise.all(candidates.map(async (candidate) => {
      const candidateSources = candidateGroundingSources(candidate, researchText, grounding);
      if (!candidateSources.length) {
        console.warn('Rejecting competitor candidate without candidate-linked Google grounding sources', { candidate: candidate.name, url: candidate.url });
        return null;
      }
      try { return augmentSnapshot(await fetchSite(candidate.url), candidate, candidateSources); }
      catch {
        try {
          const indexed = await searchEvidenceForUrl(candidate.url);
          if (indexed) return augmentSnapshot(indexed, candidate, candidateSources);
        } catch {}
        return candidateSources.length ? groundedSnapshot(candidate, candidateSources) : null;
      }
    }));
    const snapshots = settled.filter((item): item is SiteSnapshot => Boolean(item));
    const result: GeminiDiscoveryResult = { snapshots, candidateCount: candidates.length, searchQueries: queries, status: snapshots.length ? 'ok' : 'empty' };
    console.info('Gemini competitor discovery', {
      model,
      status: result.status,
      candidates: candidates.length,
      verifiedSnapshots: snapshots.length,
      searchQueries: queries,
      groundingSources: grounding.sources.length,
      groundedFallbacks: snapshots.filter((site) => site.sourceType === 'search-index' && site.evidence.some((item) => item.startsWith('Gemini Google Search grounded competitor candidate:'))).length,
      outputChars: researchText.length + structuredText.length,
    });
    return result;
  } catch (error) {
    console.error('Gemini competitor discovery unavailable', { error });
    return { snapshots: [], candidateCount: 0, searchQueries: 0, status: 'provider-error' };
  } finally {
    clearTimeout(timer);
  }
}
