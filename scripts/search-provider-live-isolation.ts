// One real request per provider. No fallback: one provider cannot hide the other's failure.
const providers = [
  { name: 'Serper', key: 'SERPER_API_KEY', url: 'https://google.serper.dev/search', header: 'X-API-KEY', body: { q: 'Allbirds sustainable footwear competitors official websites', num: 5 }, field: 'organic', link: 'link' },
  { name: 'Exa', key: 'EXA_API_KEY', url: 'https://api.exa.ai/search', header: 'x-api-key', body: { query: 'Allbirds sustainable footwear competitors official websites', type: 'auto', numResults: 5 }, field: 'results', link: 'url' },
];
let failures = 0;
for (const provider of providers) {
  const key = process.env[provider.key]?.trim();
  if (!key) { console.log(JSON.stringify({ provider: provider.name, result: 'BLOCKED', credential: 'absent' })); failures++; continue; }
  try {
    const response = await fetch(provider.url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { [provider.header]: key, 'content-type': 'application/json' }, body: JSON.stringify(provider.body) });
    if (!response.ok) { console.log(JSON.stringify({ provider: provider.name, result: 'FAIL', httpStatus: response.status })); failures++; continue; }
    const data = await response.json() as Record<string, Array<Record<string, unknown>>>;
    const rows = data[provider.field] ?? [];
    const domains = rows.flatMap(row => { try { return [new URL(String(row[provider.link])).hostname]; } catch { return []; } });
    const passed = domains.length > 0;
    console.log(JSON.stringify({ provider: provider.name, result: passed ? 'PASS' : 'FAIL', httpStatus: response.status, query: provider.body, resultCount: rows.length, domains }));
    if (!passed) failures++;
  } catch { console.log(JSON.stringify({ provider: provider.name, result: 'FAIL', reason: 'Request failed; inspect network access or retry provider independently.' })); failures++; }
}
process.exitCode = failures ? 1 : 0;
export {};
