import { afterEach, expect, test } from 'bun:test';
import { searchEvidenceForUrl } from '../src/lib/analyze.server';
import { discoverCompetitorsWithExa } from '../src/lib/exa-competitor-discovery.server';

const originalFetch = globalThis.fetch;
const names = ['SERPER_API_KEY', 'EXA_API_KEY', 'BRAVE_SEARCH_API_KEY', 'BING_SEARCH_V7_KEY'] as const;
const originalKeys = Object.fromEntries(names.map(name => [name, process.env[name]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const name of names) {
    if (originalKeys[name] === undefined) delete process.env[name];
    else process.env[name] = originalKeys[name];
  }
});
function isolateKeys() {
  for (const name of names) delete process.env[name];
}

test('Serper supplies indexed evidence without calling Exa or fallback providers', async () => {
  isolateKeys();
  process.env.SERPER_API_KEY = 'test-only-serper-key';
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    calls.push(String(input));
    if (String(input) !== 'https://google.serper.dev/search') throw new Error('Unexpected provider');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ q: 'site:allbirds.com', num: 10 });
    expect(new Headers(init?.headers).get('X-API-KEY')).toBe('test-only-serper-key');
    return Response.json({ organic: [{ link: 'https://allbirds.com/', title: 'Allbirds', snippet: 'Natural footwear' }] });
  }) as typeof fetch;
  const result = await searchEvidenceForUrl('https://allbirds.com/');
  expect(result?.sourceType).toBe('search-index');
  expect(result?.description).toBe('Natural footwear');
  expect(result?.evidence[0]).toContain('(serper)');
  expect(calls).toEqual(['https://google.serper.dev/search']);
});

test('Serper rejection preserves the existing Brave fallback', async () => {
  isolateKeys();
  process.env.SERPER_API_KEY = 'test-only-serper-key';
  process.env.BRAVE_SEARCH_API_KEY = 'test-only-brave-key';
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input); calls.push(url);
    if (url === 'https://google.serper.dev/search') return new Response(null, { status: 401 });
    if (url.startsWith('https://api.search.brave.com/')) return Response.json({ web: { results: [{ url: 'https://allbirds.com/', title: 'Allbirds', description: 'Fallback footwear evidence' }] } });
    throw new Error('Unexpected provider');
  }) as typeof fetch;
  const result = await searchEvidenceForUrl('https://allbirds.com/');
  expect(result?.description).toBe('Fallback footwear evidence');
  expect(result?.evidence[0]).toContain('(brave)');
  expect(calls.length).toBe(2);
});

test('Exa independently verifies competitor sites without calling Serper', async () => {
  isolateKeys();
  process.env.EXA_API_KEY = 'test-only-exa-key';
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push(url);
    if (url === 'https://api.exa.ai/search') {
      expect(new Headers(init?.headers).get('x-api-key')).toBe('test-only-exa-key');
      return Response.json({ results: [{ url: 'https://rival.example/', title: 'Rival', text: 'Natural footwear' }] });
    }
    if (url.startsWith('https://rival.example')) return new Response('<html><title>Rival</title><h1>Footwear shop</h1><p>Natural shoes and footwear products</p></html>', { headers: { 'content-type': 'text/html' } });
    throw new Error('Unexpected provider');
  }) as typeof fetch;
  const result = await discoverCompetitorsWithExa({ url: 'https://allbirds.com/', title: 'Allbirds', description: 'Natural footwear', h1: [], h2: [], text: '', sourceType: 'direct-site', evidence: [] });
  expect(result.status).toBe('ok');
  expect(result.candidateCount).toBe(1);
  expect(result.snapshots[0]?.sourceType).toBe('direct-site');
  expect(calls.some(url => url.includes('serper'))).toBe(false);
});
