export type AiProvider = 'openai' | 'gemini' | 'anthropic';

export type AiRun = {
  provider: AiProvider;
  model: string;
  text: string;
  sources: string[];
};

const jsonInstruction = `Return JSON only. Do not invent facts. Every material claim must be traceable to supplied evidence or a web source. Distinguish observed facts, estimates, inferences, recommendations, and unknowns. Prefer explicit uncertainty over filling gaps.`;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function textFromOpenAi(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const parts: string[] = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function runOpenAi(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = process.env['OPENAI_MODEL']?.trim() || 'gpt-6-astra';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: `${jsonInstruction}\n\n${prompt}`,
      tools: [{ type: 'web_search_preview' }],
      include: ['web_search_call.action.sources'],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = textFromOpenAi(data);
  if (!text) throw new Error('OpenAI returned no text output.');
  const sources = (data?.output ?? [])
    .filter((item: any) => item?.type === 'web_search_call')
    .flatMap((item: any) => item?.action?.sources ?? [])
    .map((source: any) => source?.url)
    .filter((url: unknown): url is string => typeof url === 'string');
  return { provider: 'openai', model, text, sources: [...new Set(sources)] };
}

async function runGemini(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.7-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${jsonInstruction}\n\n${prompt}` }] }],
      tools: [{ google_search: {} }],
    }),
  });
  if (!response.ok) throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = (data?.candidates ?? [])
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => part?.text)
    .filter((value: unknown): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  if (!text) throw new Error('Gemini returned no text output.');
  const sources = (data?.candidates ?? [])
    .flatMap((candidate: any) => candidate?.groundingMetadata?.groundingChunks ?? [])
    .map((chunk: any) => chunk?.web?.uri)
    .filter((url: unknown): url is string => typeof url === 'string');
  return { provider: 'gemini', model, text, sources: [...new Set(sources)] };
}

async function runAnthropic(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const model = process.env['ANTHROPIC_MODEL']?.trim() || 'claude-fable-5-1';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 12000,
      messages: [{ role: 'user', content: `${jsonInstruction}\n\n${prompt}` }],
      tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 8 }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = (data?.content ?? [])
    .map((item: any) => item?.text)
    .filter((value: unknown): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic returned no text output.');
  const sources = (data?.content ?? [])
    .filter((item: any) => item?.type === 'web_search_tool_result')
    .flatMap((item: any) => item?.content ?? [])
    .map((source: any) => source?.url)
    .filter((url: unknown): url is string => typeof url === 'string');
  return { provider: 'anthropic', model, text, sources: [...new Set(sources)] };
}

export async function runAiProvider(provider: AiProvider, prompt: string): Promise<AiRun> {
  if (provider === 'openai') return runOpenAi(prompt);
  if (provider === 'gemini') return runGemini(prompt);
  return runAnthropic(prompt);
}

export function configuredProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (process.env['OPENAI_API_KEY']) providers.push('openai');
  if (process.env['GEMINI_API_KEY']) providers.push('gemini');
  if (process.env['ANTHROPIC_API_KEY']) providers.push('anthropic');
  return providers;
}

export async function runResearchAnalysis(prompt: string): Promise<AiRun> {
  const requested = (process.env['AI_PROVIDER'] || 'openai').trim().toLowerCase() as AiProvider;
  if (!['openai', 'gemini', 'anthropic'].includes(requested)) throw new Error(`Unsupported AI_PROVIDER: ${requested}`);
  return runAiProvider(requested, prompt);
}
