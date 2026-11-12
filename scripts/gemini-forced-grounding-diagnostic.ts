const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) throw new Error('GEMINI_API_KEY missing');
const model = process.env.GEMINI_DISCOVERY_MODEL?.trim() || 'gemini-3.1-flash-lite';
const prompt = [
  'You must use Google Search now. Search the live web for the current official Allbirds website and one recent, verifiable product or company update.',
  'Do not answer from memory. Return a concise factual summary and include the source URLs returned by Google Search.',
  'If Google Search cannot be executed, say so explicitly.'
].join(' ');
const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
  body: JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1200 }
  }),
  signal: AbortSignal.timeout(60000)
});
const raw = await response.json();
if (!response.ok) {
  console.error('GEMINI_FORCED_GROUNDING_HTTP_ERROR', JSON.stringify({ status: response.status, error: raw?.error ?? raw }));
  process.exit(1);
}
const candidate = raw?.candidates?.[0] ?? {};
const metadata = candidate?.groundingMetadata ?? {};
const queries = Array.isArray(metadata.webSearchQueries) ? metadata.webSearchQueries : [];
const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
const sources = chunks.map((chunk) => chunk?.web).filter((web) => typeof web?.uri === 'string' && /^https?:\/\//i.test(web.uri)).map((web) => ({ title: web.title ?? '', uri: web.uri }));
const answer = (candidate?.content?.parts ?? []).map((part) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim();
const result = { model, httpStatus: response.status, finishReason: candidate.finishReason ?? null, searchQueries: queries, sourceCount: sources.length, sources, answer };
console.log('GEMINI_FORCED_GROUNDING_RESULT=' + JSON.stringify(result, null, 2));
if (queries.length < 1 || sources.length < 1) {
  console.error('FAIL: Google Search Grounding did not return both executed search queries and source URLs.');
  process.exit(2);
}
console.log('PASS: forced Google Search Grounding returned real query metadata and source URLs.');
