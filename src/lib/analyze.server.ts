export type AnalyzeInput = { storeUrl: string; competitors?: string[] };
export type EvidenceSourceType = 'direct-site' | 'search-index';
export type SearchHit = { url: string; title: string; snippet: string; source: 'brave' | 'bing' | 'duckduckgo' | 'directory' };
export type SiteSnapshot = {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  text: string;
  sourceType: EvidenceSourceType;
  evidence: string[];
};

export function normalizeUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function hostname(value: string) {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isPrivateIpv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts.every((part) => part === 0)
  );
}

function isPrivateIpv6(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!normalized.includes(':')) return false;
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    /^::ffff:(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(normalized)
  );
}

export function validateTargetUrl(raw: string) {
  try {
    const parsed = new URL(normalizeUrl(raw));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, reason: 'فقط روابط HTTP وHTTPS مسموحة.' };
    }
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      isPrivateIpv4(host) ||
      isPrivateIpv6(host)
    ) {
      return { ok: false, reason: 'عنوان الموقع يجب أن يكون عامًا على الإنترنت.' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, reason: 'رابط الموقع غير صالح.' };
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeAttr(value: string) {
  return decodeHtml(value).replace(/\\+/g, ' ').trim();
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
}

function extract(html: string, url: string): SiteSnapshot {
  const title = decodeAttr(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = decodeAttr(
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? ''
  );
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => decodeHtml(match[1] ?? ''))
    .filter(Boolean)
    .slice(0, 8);
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((match) => decodeHtml(match[1] ?? ''))
    .filter(Boolean)
    .slice(0, 15);
  return {
    url,
    title,
    description,
    h1,
    h2,
    text: decodeHtml(html).slice(0, 16000),
    sourceType: 'direct-site',
    evidence: [`Direct site observation: ${url}`],
  };
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers: Record<string, string>,
  redirect: RequestRedirect = 'follow'
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers, redirect });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSite(url: string) {
  let current = normalizeUrl(url);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const validation = validateTargetUrl(current);
    if (!validation.ok) throw new Error(validation.reason);
    const response = await fetchWithTimeout(
      validation.url!,
      12000,
      {
        'User-Agent': 'Mozilla/5.0 (compatible; COANTO/1.0; +https://coanto.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      'manual'
    );
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('الموقع أعاد توجيهًا غير صالح أو متكررًا.');
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`نوع محتوى غير مدعوم: ${contentType || 'unknown'}`);
    }
    return extract(await response.text(), validation.url!);
  }
  throw new Error('تعذّر الوصول إلى الموقع.');
}

function searchUrl(query: string) {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function uniqueHits(hits: SearchHit[]) {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const host = hostname(hit.url);
    if (!host) return false;
    let pathname = '/';
    try {
      pathname = new URL(normalizeUrl(hit.url)).pathname;
    } catch {
      return false;
    }
    const key = `${host}${pathname}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseDuckHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const blocks = html.split(/(?=<div[^>]+class=["'][^"']*\bresult\b[^"']*["'])/i);
  for (const block of blocks) {
    const anchor = block.match(/<a\b([^>]*\bclass=["'][^"']*\bresult__a\b[^"']*[^>]*)>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    let target = attr(anchor[1], 'href');
    if (!target) continue;
    try {
      const parsed = new URL(target.startsWith('//') ? `https:${target}` : target);
      target = parsed.searchParams.get('uddg') ?? parsed.href;
    } catch {
      continue;
    }
    if (!/^https?:/i.test(target)) continue;
    const snippetMatch = block.match(
      /<(?:a|div|span)[^>]+class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div|span)>/i
    );
    hits.push({
      url: target,
      title: decodeHtml(anchor[2] ?? ''),
      snippet: decodeHtml(snippetMatch?.[1] ?? ''),
      source: 'duckduckgo',
    });
  }
  return uniqueHits(hits).slice(0, 12);
}

async function duckSearch(query: string): Promise<SearchHit[]> {
  try {
    const response = await fetchWithTimeout(
      searchUrl(query),
      10000,
      { 'User-Agent': 'Mozilla/5.0 (compatible; COANTO/1.0)', Accept: 'text/html' }
    );
    if (!response.ok) return [];
    return parseDuckHtml(await response.text());
  } catch {
    return [];
  }
}

async function providerSearch(query: string): Promise<SearchHit[]> {
  const brave = process.env['BRAVE_SEARCH_API_KEY'];
  if (brave) {
    try {
      const response = await fetchWithTimeout(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=12`,
        10000,
        { Accept: 'application/json', 'X-Subscription-Token': brave }
      );
      if (response.ok) {
        const data = (await response.json()) as {
          web?: { results?: Array<{ url?: string; title?: string; description?: string }> };
        };
        const hits = (data.web?.results ?? [])
          .map((item) => ({
            url: item.url ?? '',
            title: item.title ?? '',
            snippet: item.description ?? '',
            source: 'brave' as const,
          }))
          .filter((item) => item.url);
        if (hits.length) return uniqueHits(hits).slice(0, 12);
      }
    } catch {
      // fall through to the next provider
    }
  }

  const bing = process.env['BING_SEARCH_V7_KEY'];
  if (bing) {
    try {
      const response = await fetchWithTimeout(
        `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=12&textDecorations=false&textFormat=Raw`,
        10000,
        { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': bing }
      );
      if (response.ok) {
        const data = (await response.json()) as {
          webPages?: { value?: Array<{ url?: string; name?: string; snippet?: string }> };
        };
        const hits = (data.webPages?.value ?? [])
          .map((item) => ({
            url: item.url ?? '',
            title: item.name ?? '',
            snippet: item.snippet ?? '',
            source: 'bing' as const,
          }))
          .filter((item) => item.url);
        if (hits.length) return uniqueHits(hits).slice(0, 12);
      }
    } catch {
      // fall through to DuckDuckGo
    }
  }

  return duckSearch(query);
}

function blockedHosts() {
  return [
    'facebook.com', 'instagram.com', 'youtube.com', 'linkedin.com', 'x.com', 'twitter.com',
    'pinterest.com', 'reddit.com', 'wikipedia.org', 'google.com', 'bing.com', 'duckduckgo.com',
    'tiktok.com', 'marketbeat.com', 'investing.com', 'benzinga.com', 'stockanalysis.com',
    'sec.gov', 'finance.yahoo.com', 'crunchbase.com', 'zoominfo.com',
  ];
}

function isBlockedHost(host: string) {
  return blockedHosts().some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function candidateDomains(hits: SearchHit[], own: string, explicit: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  const explicitHits: SearchHit[] = explicit.map((url) => ({ url, title: '', snippet: '', source: 'directory' }));
  for (const hit of [...explicitHits, ...hits]) {
    const host = hostname(hit.url);
    if (!host || host === own || host.endsWith(`.${own}`) || isBlockedHost(host) || seen.has(host)) continue;
    seen.add(host);
    out.push(`https://${host}`);
    if (out.length >= 30) break;
  }
  return out;
}

function cleanBrandText(value: string) {
  return value
    .replace(/\b(home|homepage|welcome|official|online|international|global|select your country|shop now|shop online)\b/gi, ' ')
    .replace(/[|•·–—:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identityCandidates(main: SiteSnapshot) {
  const raw = [main.title, ...main.h1, ...main.h2, main.description]
    .map(cleanBrandText)
    .filter(Boolean);
  const names: string[] = [];
  for (const value of raw) {
    const parts = value.split(/\s+/).filter(Boolean);
    if (parts.length <= 10) names.push(value);
    if (names.length >= 6) break;
  }
  return names;
}

function likelyBrand(main: SiteSnapshot) {
  const host = hostname(main.url);
  const name = host.split('.')[0]?.replace(/[-_]+/g, ' ') ?? '';
  return name || identityCandidates(main)[0] || 'business';
}

function searchSnapshot(hit: SearchHit): SiteSnapshot {
  return {
    url: normalizeUrl(hit.url),
    title: hit.title,
    description: hit.snippet,
    h1: [],
    h2: [],
    text: `Indexed public search evidence: ${hit.title}. ${hit.snippet}`.slice(0, 12000),
    sourceType: 'search-index',
    evidence: [
      `${hit.source === 'directory' ? 'Competitor directory' : 'Search index'} (${hit.source}): ${hit.title}${hit.snippet ? ` — ${hit.snippet}` : ''}`,
    ],
  };
}

export async function searchEvidenceForUrl(url: string): Promise<SiteSnapshot | null> {
  const host = hostname(url);
  if (!host) return null;
  const hits = await providerSearch(`site:${host}`);
  const best = hits.find((hit) => hostname(hit.url) === host);
  return best ? searchSnapshot(best) : null;
}

export async function getMainSnapshot(storeUrl: string) {
  try {
    return await fetchSite(storeUrl);
  } catch {
    const fallback = await searchEvidenceForUrl(storeUrl);
    if (fallback) return fallback;
    throw new Error('تعذّر الوصول إلى الموقع ولم نجد أدلة عامة مفهرسة كافية عنه.');
  }
}

async function directoryCompetitorHits(brand: string): Promise<SearchHit[]> {
  const { discoverDirectoryNames } = await import('./competitor-directories.server');
  const directory = await discoverDirectoryNames(brand);
  const hits: SearchHit[] = [];
  for (const item of directory.slice(0, 8)) {
    const results = await providerSearch(`"${item.name}" official website`);
    const best = results.find((hit) => {
      const host = hostname(hit.url);
      return host && !isBlockedHost(host);
    });
    if (best) {
      hits.push({
        ...best,
        source: 'directory',
        title: best.title || item.name,
        snippet: `Competitor directory (${item.source}) identified ${item.name} as a comparable company. ${best.snippet}`,
      });
    }
  }
  return uniqueHits(hits);
}

export async function discoverCompetitors(main: SiteSnapshot, explicit: string[] = []) {
  const own = hostname(main.url);
  const brand = likelyBrand(main);
  const ids = identityCandidates(main);
  const queries = [
    `"${brand}" competitors`,
    `"${brand}" alternatives`,
    `"${brand}" vs competitors`,
    `${brand} competitors alternatives`,
    `${ids[0] ?? brand} similar companies`,
    `${brand} market competitors`,
  ];
  const [searchGroups, directoryHits] = await Promise.all([
    Promise.all(queries.map(providerSearch)),
    directoryCompetitorHits(brand),
  ]);
  const hits = uniqueHits([...searchGroups.flat(), ...directoryHits]);
  const candidates = candidateDomains(hits, own, explicit);
  const evidenceByHost = new Map<string, SearchHit>();
  for (const hit of hits) {
    const host = hostname(hit.url);
    if (!evidenceByHost.has(host) || hit.source === 'directory') evidenceByHost.set(host, hit);
  }
  const hostFrequency = new Map<string, number>();
  for (const hit of hits) {
    const host = hostname(hit.url);
    if (host) hostFrequency.set(host, (hostFrequency.get(host) ?? 0) + 1);
  }
  const explicitHosts = new Set(explicit.map(hostname).filter(Boolean));
  const qualifiedCandidates = candidates
    .filter((candidate) => {
      const host = hostname(candidate);
      return explicitHosts.has(host) || (hostFrequency.get(host) ?? 0) >= 2;
    })
    .slice(0, 20);

  const sites: SiteSnapshot[] = [];
  for (const candidate of qualifiedCandidates) {
    const host = hostname(candidate);
    try {
      sites.push(await fetchSite(candidate));
    } catch {
      const hit = evidenceByHost.get(host) ?? hits.find((item) => hostname(item.url) === host);
      if (hit) sites.push(searchSnapshot(hit));
    }
  }

  const ranked = sites
    .map((site) => {
      const hit = evidenceByHost.get(hostname(site.url));
      const evidenceText = `${hit?.title ?? ''} ${hit?.snippet ?? ''}`.toLowerCase();
      const directoryBonus = hit?.source === 'directory' ? 8 : 0;
      const frequencyBonus = Math.min(hostFrequency.get(hostname(site.url)) ?? 0, 4);
      const directBonus = site.sourceType === 'direct-site' ? 3 : 0;
      const relevanceWords = [
        'competitor', 'alternative', 'similar', 'rival', 'footwear', 'apparel', 'retail',
        'ecommerce', 'sport', 'fashion', 'shopping', 'marketplace',
      ];
      const relevanceBonus = relevanceWords.reduce(
        (sum, word) => sum + (evidenceText.includes(word) ? 1 : 0),
        0
      );
      const noisePenalty =
        /market|stock|financial|investor|news|analysis|research|funding|salary|employees/i.test(evidenceText) &&
        !/shop|store|retail|ecommerce|product/i.test(evidenceText)
          ? 10
          : 0;
      return {
        site,
        score: directoryBonus + frequencyBonus + directBonus + relevanceBonus - noisePenalty,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return ranked.map((item) => item.site);
}

export function buildPrompt(main: SiteSnapshot, competitors: SiteSnapshot[]) {
  return [
    'COANTO competitive decision intelligence.',
    `Target evidence: ${JSON.stringify(main)}`,
    `Candidate evidence: ${JSON.stringify(competitors)}`,
    'Analyze only from supplied evidence plus your web research.',
    'Return JSON with competitors, signals, priority_matrix, threats, opportunities, scenarios, action_plan, trust, unknowns, summary, next_action, threat_level, opportunity_level.',
    'Each competitor must include name, url, why, evidence, sourceUrls.',
    'Never invent prices, revenue, market share, percentages, dates, or financial impact.',
    'Clearly distinguish facts, inference, recommendation, and unknown.',
  ].join('\n');
}

export function parseJsonBlock(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI returned no JSON object.');
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}
