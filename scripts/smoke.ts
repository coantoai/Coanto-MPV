import { discoverCompetitors, getMainSnapshot, hostname, normalizeUrl, parseJsonBlock, type SiteSnapshot } from '../src/lib/analyze.server.ts';

const originalFetch = globalThis.fetch;
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.error(`FAIL ${name}`); }
}
function html(title: string, description: string, h1 = title) {
  return `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body><h1>${h1}</h1><h2>Shop</h2><p>${description}</p></body></html>`;
}
function searchHtml(rows: Array<{ url: string; title: string; snippet: string }>) {
  return rows.map((row) => `<div class="result"><a class="result__a" href="${row.url}">${row.title}</a><div class="result__snippet">${row.snippet}</div></div>`).join('');
}

check('normalize bare domain', normalizeUrl('example.com') === 'https://example.com');
check('preserve https', normalizeUrl('https://example.com') === 'https://example.com');
check('hostname strips www', hostname('https://www.example.com/path') === 'example.com');
check('hostname rejects malformed input', hostname('not a valid url %%') === '');
check('JSON block parses fenced payload', parseJsonBlock('prefix {"ok":true} suffix').ok === true);
check('JSON block rejects missing object', (() => { try { parseJsonBlock('no json'); return false; } catch { return true; } })());

const main: SiteSnapshot = {
  url: 'https://acme.test', title: 'Acme', description: 'Acme outdoor footwear', h1: ['Acme footwear'], h2: [], text: 'Outdoor footwear', sourceType: 'direct-site', evidence: ['Direct site observation']
};

let mode: 'normal' | 'blocked-main' | 'blocked-competitor' = 'normal';
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('html.duckduckgo.com')) {
    const rows = [
      { url: 'https://acme.test', title: 'Acme', snippet: 'own site' },
      { url: 'https://rival.test', title: 'Rival Shoes', snippet: 'Rival Shoes is an alternative and competitor to Acme outdoor footwear.' },
      { url: 'https://blocked-rival.test', title: 'Blocked Rival', snippet: 'Blocked Rival competes with Acme in outdoor footwear.' },
      { url: 'https://instagram.com/acme', title: 'Acme Instagram', snippet: 'social' },
    ];
    return new Response(searchHtml(rows), { status: 200, headers: { 'content-type': 'text/html' } });
  }
  if (url.startsWith('https://acme.test')) {
    if (mode === 'blocked-main') return new Response('blocked', { status: 403, headers: { 'content-type': 'text/html' } });
    return new Response(html('Acme', 'Acme outdoor footwear'), { status: 200, headers: { 'content-type': 'text/html' } });
  }
  if (url.startsWith('https://rival.test')) {
    return new Response(html('Rival Shoes', 'Rival outdoor footwear alternative to Acme'), { status: 200, headers: { 'content-type': 'text/html' } });
  }
  if (url.startsWith('https://blocked-rival.test')) {
    if (mode === 'blocked-competitor') return new Response('blocked', { status: 403, headers: { 'content-type': 'text/html' } });
    return new Response(html('Blocked Rival', 'Blocked Rival outdoor footwear competitor'), { status: 200, headers: { 'content-type': 'text/html' } });
  }
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
}) as typeof fetch;

const direct = await getMainSnapshot('https://acme.test');
check('direct main source is direct-site', direct.sourceType === 'direct-site');
check('direct main title extracted', direct.title === 'Acme');

mode = 'blocked-main';
const fallback = await getMainSnapshot('https://acme.test');
check('blocked main falls back to indexed evidence', fallback.sourceType === 'search-index');
check('blocked main retains evidence text', fallback.evidence[0]?.toLowerCase().includes('duckduckgo') === true);

mode = 'normal';
const discovered = await discoverCompetitors(main, []);
check('discovery finds rival', discovered.some((s) => hostname(s.url) === 'rival.test'));
check('discovery excludes own domain', discovered.every((s) => hostname(s.url) !== 'acme.test'));
check('discovery excludes social domains', discovered.every((s) => hostname(s.url) !== 'instagram.com'));
check('direct rival gets direct-site provenance', discovered.find((s) => hostname(s.url) === 'rival.test')?.sourceType === 'direct-site');

mode = 'blocked-competitor';
const blockedDiscovery = await discoverCompetitors(main, []);
check('blocked competitor remains discoverable from index', blockedDiscovery.some((s) => hostname(s.url) === 'blocked-rival.test'));
check('blocked competitor is marked search-index', blockedDiscovery.find((s) => hostname(s.url) === 'blocked-rival.test')?.sourceType === 'search-index');
check('blocked competitor evidence is explicit', blockedDiscovery.find((s) => hostname(s.url) === 'blocked-rival.test')?.evidence[0]?.includes('Blocked Rival') === true);

mode = 'normal';
const explicit = await discoverCompetitors(main, ['https://rival.test']);
check('explicit competitor is supported', explicit.some((s) => hostname(s.url) === 'rival.test'));
check('candidate list stays bounded', explicit.length <= 10);
check('search-only evidence never pretends direct visit', blockedDiscovery.find((s) => hostname(s.url) === 'blocked-rival.test')?.sourceType !== 'direct-site');
check('primary baseline stays separate from discovered competitors', discovered.every((s) => s.url !== main.url));

console.log(`Smoke tests: ${passed} passed, ${failed} failed`);
globalThis.fetch = originalFetch;
if (failed) process.exit(1);
