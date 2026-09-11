const brave = process.env['BRAVE_SEARCH_API_KEY']?.trim() || '';
const bing = process.env['BING_SEARCH_V7_KEY']?.trim() || '';

async function readJson(response: Response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) as Record<string, unknown> : {}; }
  catch { throw new Error(`Search provider returned invalid JSON (${response.status}).`); }
}

async function braveProbe() {
  const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=competitive%20intelligence&count=1', {
    headers: { Accept: 'application/json', 'X-Subscription-Token': brave },
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(`Brave Search launch probe failed (${response.status}).`);
  const web = body['web'] as { results?: unknown[] } | undefined;
  if (!Array.isArray(web?.results) || web.results.length === 0) throw new Error('Brave Search launch probe returned no result.');
  console.log('SEARCH_PROVIDER_LIVE_OK brave');
}

async function bingProbe() {
  const response = await fetch('https://api.bing.microsoft.com/v7.0/search?q=competitive%20intelligence&count=1&textDecorations=false&textFormat=Raw', {
    headers: { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': bing },
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(`Bing Search launch probe failed (${response.status}).`);
  const webPages = body['webPages'] as { value?: unknown[] } | undefined;
  if (!Array.isArray(webPages?.value) || webPages.value.length === 0) throw new Error('Bing Search launch probe returned no result.');
  console.log('SEARCH_PROVIDER_LIVE_OK bing');
}

if (!brave && !bing) throw new Error('No launch search provider is configured.');
const failures: string[] = [];
if (brave) {
  try { await braveProbe(); process.exit(0); }
  catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
}
if (bing) {
  try { await bingProbe(); process.exit(0); }
  catch (error) { failures.push(error instanceof Error ? error.message : String(error)); }
}
throw new Error(`No configured launch search provider passed. ${failures.join(' | ')}`);
