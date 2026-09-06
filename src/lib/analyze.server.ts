export type AnalyzeInput = { storeUrl: string; competitors?: string[] };
export type EvidenceSourceType = 'direct-site' | 'search-index';
export type SearchHit = { url: string; title: string; snippet: string; source: 'brave' | 'bing' | 'duckduckgo' | 'directory' };
export type SiteSnapshot = { url: string; title: string; description: string; h1: string[]; h2: string[]; text: string; sourceType: EvidenceSourceType; evidence: string[] };

export function normalizeUrl(v: string) { const x = v.trim(); return /^https?:\/\//i.test(x) ? x : `https://${x}`; }
export function hostname(u: string) { try { return new URL(normalizeUrl(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }

function decodeHtml(h: string) { return h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/\s+/g, ' ').trim(); }
function decodeAttr(v: string) { return decodeHtml(v).replace(/\\+/g, ' ').trim(); }

function extract(html: string, url: string): SiteSnapshot {
  const title = decodeAttr(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = decodeAttr(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? '');
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decodeHtml(m[1] ?? '')).filter(Boolean).slice(0, 8);
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => decodeHtml(m[1] ?? '')).filter(Boolean).slice(0, 15);
  return { url, title, description, h1, h2, text: decodeHtml(html).slice(0, 16000), sourceType: 'direct-site', evidence: [`Direct site observation: ${url}`] };
}

async function fetchWithTimeout(url: string, ms: number, headers: Record<string, string>) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), ms); try { return await fetch(url, { signal: controller.signal, headers }); } finally { clearTimeout(timeout); } }

export async function fetchSite(url: string) {
  const normalized = normalizeUrl(url);
  const response = await fetchWithTimeout(normalized, 12000, { 'User-Agent': 'Mozilla/5.0 (compatible; COANTO/1.0; +https://coanto.com)', Accept: 'text/html,application/xhtml+xml' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error(`نوع محتوى غير مدعوم: ${contentType || 'unknown'}`);
  return extract(await response.text(), normalized);
}

function searchUrl(q: string) { return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`; }
function uniqueHits(hits: SearchHit[]) { const seen = new Set<string>(); return hits.filter((hit) => { const h = hostname(hit.url); if (!h) return false; let pathname = '/'; try { pathname = new URL(normalizeUrl(hit.url)).pathname; } catch { return false; } const key = `${h}${pathname}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

async function duckSearch(q: string): Promise<SearchHit[]> {
  try {
    const response = await fetchWithTimeout(searchUrl(q), 10000, { 'User-Agent': 'Mozilla/5.0 (compatible; COANTO/1.0)', Accept: 'text/html' });
    if (!response.ok) return [];
    const html = await response.text(); const hits: SearchHit[] = [];
    const blocks = html.split(/(?=<div[^>]+class=["'][^"']*result["'])/i);
    for (const block of blocks) {
      const anchor = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i); if (!anchor) continue;
      let target = anchor[1]; try { const parsed = new URL(target.startsWith('//') ? `https:${target}` : target); target = parsed.searchParams.get('uddg') ?? parsed.href; } catch { continue; }
      if (!/^https?:/i.test(target)) continue;
      const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ?? block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      hits.push({ url: target, title: decodeHtml(anchor[2] ?? ''), snippet: decodeHtml(snippetMatch?.[1] ?? ''), source: 'duckduckgo' });
    }
    return uniqueHits(hits).slice(0, 12);
  } catch { return []; }
}

async function providerSearch(q: string): Promise<SearchHit[]> {
  const brave = process.env['BRAVE_SEARCH_API_KEY'];
  if (brave) {
    try {
      const response = await fetchWithTimeout(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=12`, 10000, { Accept: 'application/json', 'X-Subscription-Token': brave });
      if (response.ok) { const data = (await response.json()) as { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } }; const hits = (data.web?.results ?? []).map((item) => ({ url: item.url ?? '', title: item.title ?? '', snippet: item.description ?? '', source: 'brave' as const })).filter((item) => item.url); if (hits.length) return uniqueHits(hits).slice(0, 12); }
    } catch { /* fallback */ }
  }
  const bing = process.env['BING_SEARCH_V7_KEY'];
  if (bing) {
    try {
      const response = await fetchWithTimeout(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(q)}&count=12&textDecorations=false&textFormat=Raw`, 10000, { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': bing });
      if (response.ok) { const data = (await response.json()) as { webPages?: { value?: Array<{ url?: string; name?: string; snippet?: string }> } }; const hits = (data.webPages?.value ?? []).map((item) => ({ url: item.url ?? '', title: item.name ?? '', snippet: item.snippet ?? '', source: 'bing' as const })).filter((item) => item.url); if (hits.length) return uniqueHits(hits).slice(0, 12); }
    } catch { /* fallback */ }
  }
  return duckSearch(q);
}

function blockedHosts() { return ['facebook.com','instagram.com','youtube.com','linkedin.com','x.com','twitter.com','pinterest.com','reddit.com','wikipedia.org','google.com','bing.com','duckduckgo.com','tiktok.com','marketbeat.com','investing.com','benzinga.com','stockanalysis.com','sec.gov','finance.yahoo.com','crunchbase.com','zoominfo.com']; }
function candidateDomains(hits: SearchHit[], own: string, explicit: string[]) { const seen = new Set<string>(); const out: string[] = []; const explicitHits: SearchHit[] = explicit.map((url) => ({ url, title: '', snippet: '', source: 'directory' })); for (const hit of [...explicitHits, ...hits]) { const h = hostname(hit.url); if (!h || h === own || h.endsWith(`.${own}`) || blockedHosts().some((blocked) => h === blocked || h.endsWith(`.${blocked}`)) || seen.has(h)) continue; seen.add(h); out.push(`https://${h}`); if (out.length >= 30) break; } return out; }
function cleanBrandText(v: string) { return v.replace(/\b(home|homepage|welcome|official|online|international|global|select your country|shop now|shop online)\b/gi, ' ').replace(/[|•·–—:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function identityCandidates(main: SiteSnapshot) { const raw = [main.title, ...main.h1, ...main.h2, main.description].map(cleanBrandText).filter(Boolean); const names: string[] = []; for (const value of raw) { const parts = value.split(/\s+/).filter(Boolean); if (parts.length <= 10) names.push(value); if (names.length >= 6) break; } return names; }
function likelyBrand(main: SiteSnapshot) { const h = hostname(main.url); const name = h.split('.')[0]?.replace(/[-_]+/g, ' ') ?? ''; return name || identityCandidates(main)[0] || 'business'; }
function searchSnapshot(hit: SearchHit): SiteSnapshot { return { url: normalizeUrl(hit.url), title: hit.title, description: hit.snippet, h1: [], h2: [], text: `Indexed public search evidence: ${hit.title}. ${hit.snippet}`.slice(0, 12000), sourceType: 'search-index', evidence: [`${hit.source === 'directory' ? 'Competitor directory' : 'Search index'} (${hit.source}): ${hit.title}${hit.snippet ? ` — ${hit.snippet}` : ''}`] }; }

export async function searchEvidenceForUrl(url: string): Promise<SiteSnapshot | null> { const h = hostname(url); if (!h) return null; const hits = await providerSearch(`site:${h}`); const best = hits.find((hit) => hostname(hit.url) === h) ?? hits[0]; return best ? searchSnapshot(best) : null; }
export async function getMainSnapshot(storeUrl: string) { try { return await fetchSite(storeUrl); } catch { const fallback = await searchEvidenceForUrl(storeUrl); if (fallback) return fallback; throw new Error('تعذّر الوصول إلى الموقع ولم نجد أدلة عامة مفهرسة كافية عنه.'); } }

async function directoryCompetitorHits(brand: string): Promise<SearchHit[]> {
  const { discoverDirectoryNames } = await import('./competitor-directories.server');
  const directory = await discoverDirectoryNames(brand);
  const hits: SearchHit[] = [];
  for (const item of directory.slice(0, 8)) {
    const results = await providerSearch(`"${item.name}" official website`);
    const best = results.find((hit) => { const h = hostname(hit.url); return h && !blockedHosts().some((blocked) => h === blocked || h.endsWith(`.${blocked}`)); });
    if (best) hits.push({ ...best, source: 'directory', title: best.title || item.name, snippet: `Competitor directory (${item.source}) identified ${item.name} as a comparable company. ${best.snippet}` });
  }
  return uniqueHits(hits);
}

export async function discoverCompetitors(main: SiteSnapshot, explicit: string[] = []) {
  const own = hostname(main.url); const brand = likelyBrand(main); const ids = identityCandidates(main);
  const queries = [`"${brand}" competitors`,`"${brand}" alternatives`,`"${brand}" vs competitors`,`${brand} competitors alternatives`,`${ids[0] ?? brand} similar companies`,`${brand} market competitors`];
  const [searchGroups, directoryHits] = await Promise.all([Promise.all(queries.map(providerSearch)), directoryCompetitorHits(brand)]);
  const hits = uniqueHits([...searchGroups.flat(), ...directoryHits]);
  const candidates = candidateDomains(hits, own, explicit);
  const evidenceByHost = new Map<string, SearchHit>();
  for (const hit of hits) { const h = hostname(hit.url); if (!evidenceByHost.has(h) || hit.source === 'directory') evidenceByHost.set(h, hit); }
  const hostFrequency = new Map<string, number>(); for (const hit of hits) { const h = hostname(hit.url); if (h) hostFrequency.set(h, (hostFrequency.get(h) ?? 0) + 1); }
  const sites: SiteSnapshot[] = [];
  for (const candidate of candidates) { const h = hostname(candidate); try { sites.push(await fetchSite(candidate)); } catch { const hit = evidenceByHost.get(h) ?? hits.find((item) => hostname(item.url) === h); if (hit) sites.push(searchSnapshot(hit)); } }
  const ranked = sites.map((site) => { const hit = evidenceByHost.get(hostname(site.url)); const evidenceText = `${hit?.title ?? ''} ${hit?.snippet ?? ''}`.toLowerCase(); const directoryBonus = hit?.source === 'directory' ? 8 : 0; const frequencyBonus = Math.min(hostFrequency.get(hostname(site.url)) ?? 0, 4); const directBonus = site.sourceType === 'direct-site' ? 3 : 0; const relevanceWords = ['competitor','alternative','similar','rival','footwear','apparel','retail','ecommerce','sport','fashion','shopping','marketplace']; const relevanceBonus = relevanceWords.reduce((sum, word) => sum + (evidenceText.includes(word) ? 1 : 0), 0); const noisePenalty = /market|stock|financial|investor|news|analysis|research|funding|salary|employees/i.test(evidenceText) && hit?.source !== 'directory' ? 5 : 0; return { site, score: directoryBonus + frequencyBonus + directBonus + relevanceBonus - noisePenalty }; }).sort((a,b) => b.score-a.score);
  return ranked.filter((item) => item.site.title || item.site.description || item.site.h1.length || item.site.sourceType === 'search-index').slice(0,10).map((item) => item.site);
}

export const ANALYSIS_SCHEMA = `Return JSON only: {"decisionPulse":{"threat":{"title":"","description":"","severity":"critical|high|medium|low"},"opportunity":{"title":"","description":"","strength":"high|medium|low"},"action":{"title":"","description":"","priority":"high|medium|low"}},"snapshot":{"competitorCount":0,"meaningfulSignals":0,"evidenceStrength":"high|medium|low","dataCompleteness":"high|medium|low"},"marketTrend":[],"signals":[{"id":"","competitor":"","type":"","title":"","detail":"","impact":"high|medium|low","observedAt":"","evidence":"","sourceUrl":""}],"competitors":[{"name":"","url":"","relevance":0,"impact":0,"threat":"high|medium|low","note":""}],"beforeAfter":[],"timeline":[],"impact":{"strategic":0,"market":0,"financialAvailable":false,"financialNote":""},"scenarios":[],"priorityMatrix":[],"actions":[],"trust":[],"unknowns":[]}`;
export function buildPrompt(main: SiteSnapshot, competitors: SiteSnapshot[]) { return `You are COANTO, a competitive decision-intelligence system. The PRIMARY SITE is baseline/context only. The DISCOVERED COMPETITORS are the main subject. Some sources may be direct-site observations and some may be public search-index evidence because a site blocked automated access. Treat sourceType=direct-site as direct observation; treat sourceType=search-index as indexed evidence and never imply you directly visited that site. Never treat the primary site as a competitor. Never invent competitors, prices, sales, revenue, market share, percentages, dates, or financial impact. Only list a competitor when its supplied evidence makes its business identity and relevance reasonably clear. Every competitor claim must be supported by supplied evidence. Prefer 3-8 meaningful signals. If evidence is insufficient, say unknown rather than filling gaps. Do not convert search snippets into precise product/pricing facts unless explicitly stated in the supplied snippet. Arabic output. ${ANALYSIS_SCHEMA}\nPRIMARY BASELINE:\n${JSON.stringify(main)}\nDISCOVERED COMPETITORS:\n${JSON.stringify(competitors)}`; }
export function parseJsonBlock(t: string) { const start = t.indexOf('{'); const end = t.lastIndexOf('}'); if (start < 0 || end < 0 || end <= start) throw new Error('النموذج لم يُعِد JSON صالحًا'); return JSON.parse(t.slice(start,end+1)); }
