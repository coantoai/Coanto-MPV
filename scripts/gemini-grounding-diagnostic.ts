type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

async function main() {
  const apiKey = process.env['GEMINI_API_KEY']?.trim();
  const model = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.1-flash-lite';
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'استخدم Google Search الآن. ما أبرز موضوع حديث جدًا في السعودية اليوم قد يهم متجرًا صغيرًا يبيع عبر السوشيال ميديا؟ اذكر ما وجدته باختصار ولا تعتمد على معلوماتك القديمة.' }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.05, maxOutputTokens: 1200 },
    }),
  });

  console.log(`http_status=${response.status}`);
  const data = obj(await response.json());
  if (!response.ok) {
    const error = obj(data['error']);
    console.log(`api_error=${String(error['message'] || 'unknown').slice(0, 240)}`);
    process.exit(1);
  }

  const candidates = arr(data['candidates']);
  console.log(`candidates=${candidates.length}`);
  const candidate = obj(candidates[0]);
  const metadata = obj(candidate['groundingMetadata']);
  console.log(`candidate_keys=${Object.keys(candidate).sort().join(',')}`);
  console.log(`grounding_keys=${Object.keys(metadata).sort().join(',') || 'NONE'}`);
  console.log(`queries=${arr(metadata['webSearchQueries']).length}`);
  console.log(`chunks=${arr(metadata['groundingChunks']).length}`);
  console.log(`supports=${arr(metadata['groundingSupports']).length}`);
  console.log(`search_entry_point=${Object.keys(obj(metadata['searchEntryPoint'])).length ? 'present' : 'missing'}`);

  if (!arr(metadata['webSearchQueries']).length || !arr(metadata['groundingChunks']).length) {
    console.error('GEMINI_GROUNDING_DIAGNOSTIC_FAILED');
    process.exit(1);
  }
  console.log('GEMINI_GROUNDING_DIAGNOSTIC_OK');
}

main().catch((error) => {
  console.error('GEMINI_GROUNDING_DIAGNOSTIC_FAILED');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
