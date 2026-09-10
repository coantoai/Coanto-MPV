export type ApifyAcquiredPage = {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  text: string;
  markdown: string;
  actorId: string;
};

export type ApifyMode = 'off' | 'fallback' | 'preferred';

export type ApifyRuntimeConfig = {
  configured: boolean;
  token: string;
  actorId: string;
  mode: ApifyMode;
  timeoutSeconds: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(Number.isFinite(value) ? value : minimum)));
}

function actorId(value: string) {
  const normalized = value.trim().replace('/', '~');
  if (!/^[A-Za-z0-9_-]+~[A-Za-z0-9_-]+$/.test(normalized)) throw new Error('APIFY_ACTOR_ID must be owner/actor-name or owner~actor-name.');
  return normalized;
}

export function getApifyRuntimeConfig(): ApifyRuntimeConfig {
  const token = process.env['APIFY_TOKEN']?.trim() || '';
  const rawMode = process.env['APIFY_MODE']?.trim().toLowerCase();
  const mode: ApifyMode = rawMode === 'preferred' ? 'preferred' : rawMode === 'off' ? 'off' : token ? 'fallback' : 'off';
  const timeoutSeconds = clamp(Number(process.env['APIFY_TIMEOUT_SECONDS'] || 60), 15, 180);
  return {
    configured: Boolean(token) && mode !== 'off',
    token,
    actorId: actorId(process.env['APIFY_ACTOR_ID']?.trim() || 'apify~website-content-crawler'),
    mode,
    timeoutSeconds,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function headings(markdown: string, level: 1 | 2) {
  const prefix = '#'.repeat(level);
  const expression = new RegExp(`^${prefix}\\s+(.+)$`, 'gm');
  return [...markdown.matchAll(expression)].map((match) => (match[1] || '').trim()).filter(Boolean).slice(0, 40);
}

function markdownToText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Runs Apify's Website Content Crawler for exactly one public start page.
 * The token is sent only in the Authorization header. AI summarization is
 * explicitly disabled so acquisition can never manufacture evidence.
 */
export async function fetchSiteViaApify(url: string): Promise<ApifyAcquiredPage> {
  const config = getApifyRuntimeConfig();
  if (!config.configured) throw new Error('Apify acquisition is not configured.');
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Apify acquisition accepts HTTP(S) URLs only.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (config.timeoutSeconds + 5) * 1000);
  let response: Response;
  try {
    response = await fetch(`https://api.apify.com/v2/actors/${config.actorId}/run-sync-get-dataset-items?timeout=${config.timeoutSeconds}&maxItems=1`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startUrls: [{ url: target.toString() }],
        crawlerType: 'playwright:adaptive',
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        useSitemaps: false,
        respectRobotsTxtFile: true,
        removeCookieWarnings: true,
        saveMarkdown: true,
        saveHtml: false,
        saveFiles: false,
        saveScreenshots: false,
        summarize: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Apify acquisition timed out.');
    throw new Error(`Apify acquisition failed: ${error instanceof Error ? error.message : 'network error'}`);
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  if (!response.ok) throw new Error(`Apify acquisition failed (${response.status}): ${raw.slice(0, 240)}`);
  let parsed: unknown;
  try { parsed = raw ? JSON.parse(raw) : []; } catch { throw new Error('Apify returned invalid JSON.'); }
  const items = Array.isArray(parsed) ? parsed : [];
  const item = object(items[0]);
  if (!Object.keys(item).length) throw new Error('Apify returned no page result.');
  const metadata = object(item['metadata']);
  const markdown = string(item['markdown']) || string(item['text']) || string(item['content']);
  const text = string(item['text']) || markdownToText(markdown);
  if (!text && !markdown) throw new Error('Apify returned an empty page result.');
  const loadedUrl = string(item['loadedUrl']) || string(item['url']) || string(metadata['url']) || target.toString();
  return {
    url: loadedUrl,
    title: string(item['title']) || string(metadata['title']) || headings(markdown, 1)[0] || target.hostname,
    description: string(item['description']) || string(metadata['description']),
    h1: headings(markdown, 1),
    h2: headings(markdown, 2),
    text: text.slice(0, 30_000),
    markdown: markdown.slice(0, 60_000),
    actorId: config.actorId,
  };
}
