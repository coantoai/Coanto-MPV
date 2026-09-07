export type AiProvider = 'openai' | 'gemini' | 'anthropic';

export type AiRun = {
  provider: AiProvider;
  model: string;
  text: string;
  sources: string[];
};

type JsonRecord = Record<string, unknown>;

const jsonInstruction = `Return JSON only. Do not invent facts. Every material claim must be traceable to supplied evidence or a web source. Distinguish observed facts, estimates, inferences, recommendations, and unknowns. Prefer explicit uncertainty over filling gaps.`;

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function providerRequest(url: string, init: RequestInit, provider: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`${provider} request timed out after 45 seconds.`);
    }
    throw error instanceof Error ? error : new Error(`${provider} request failed.`);
  } finally {
    clearTimeout(timeout);
  }
}

async function providerError(response: Response, provider: string) {
  let detail = '';
  try {
    const data = record(await response.json());
    const error = record(data['error']);
    detail = stringValue(error['message']) || stringValue(data['message']);
  } catch {
    // Keep upstream response bodies out of user-facing errors.
  }
  throw new Error(`${provider} API request failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : '.'}`);
}

function textFromOpenAi(response: unknown): string {
  const data = record(response);
  const direct = stringValue(data['output_text']);
  if (direct.trim()) return direct;
  const parts: string[] = [];
  for (const item of array(data['output'])) {
    const message = record(item);
    if (message['type'] !== 'message') continue;
    for (const content of array(message['content'])) {
      const value = record(content);
      if (value['type'] === 'output_text') {
        const text = stringValue(value['text']);
        if (text) parts.push(text);
      }
    }
  }
  return parts.join('\n').trim();
}

async function runOpenAi(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = process.env['OPENAI_MODEL']?.trim() || 'gpt-6-astra';
  const response = await providerRequest('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: `${jsonInstruction}\n\n${prompt}`,
      tools: [{ type: 'web_search_preview' }],
      include: ['web_search_call.action.sources'],
    }),
  }, 'OpenAI');
  if (!response.ok) await providerError(response, 'OpenAI');
  const data = await response.json();
  const text = textFromOpenAi(data);
  if (!text) throw new Error('OpenAI returned no text output.');
  const sources: string[] = [];
  for (const item of array(record(data)['output'])) {
    const value = record(item);
    if (value['type'] !== 'web_search_call') continue;
    for (const source of array(record(value['action'])['sources'])) {
      const url = stringValue(record(source)['url']);
      if (url) sources.push(url);
    }
  }
  return { provider: 'openai', model, text, sources: [...new Set(sources)] };
}

async function runGemini(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('GEMINI_API_KEY');
  const model = process.env['GEMINI_MODEL']?.trim() || 'gemini-3.7-flash';
  const response = await providerRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${jsonInstruction}\n\n${prompt}` }] }],
      tools: [{ google_search: {} }],
    }),
  }, 'Gemini');
  if (!response.ok) await providerError(response, 'Gemini');
  const data = record(await response.json());
  const texts: string[] = [];
  for (const candidate of array(data['candidates'])) {
    for (const part of array(record(candidate)['content'] ? record(record(candidate)['content'])['parts'] : [])) {
      const text = stringValue(record(part)['text']);
      if (text) texts.push(text);
    }
  }
  const text = texts.join('\n').trim();
  if (!text) throw new Error('Gemini returned no text output.');
  const sources: string[] = [];
  for (const candidate of array(data['candidates'])) {
    for (const chunk of array(record(record(candidate)['groundingMetadata'])['groundingChunks'])) {
      const url = stringValue(record(record(chunk)['web'])['uri']);
      if (url) sources.push(url);
    }
  }
  return { provider: 'gemini', model, text, sources: [...new Set(sources)] };
}

async function runAnthropic(prompt: string): Promise<AiRun> {
  const apiKey = requireEnv('ANTHROPIC_API_KEY');
  const model = process.env['ANTHROPIC_MODEL']?.trim() || 'claude-fable-5-1';
  const response = await providerRequest('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 12000,
      messages: [{ role: 'user', content: `${jsonInstruction}\n\n${prompt}` }],
      tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 8 }],
    }),
  }, 'Anthropic');
  if (!response.ok) await providerError(response, 'Anthropic');
  const data = record(await response.json());
  const texts = array(data['content']).map((item) => stringValue(record(item)['text'])).filter(Boolean);
  const text = texts.join('\n').trim();
  if (!text) throw new Error('Anthropic returned no text output.');
  const sources: string[] = [];
  for (const item of array(data['content'])) {
    if (record(item)['type'] !== 'web_search_tool_result') continue;
    for (const source of array(record(item)['content'])) {
      const url = stringValue(record(source)['url']);
      if (url) sources.push(url);
    }
  }
  return { provider: 'anthropic', model, text, sources: [...new Set(sources)] };
}

export async function runAiProvider(provider: AiProvider, prompt: string): Promise<AiRun> {
  if (provider === 'openai') return runOpenAi(prompt);
  if (provider === 'gemini') return runGemini(prompt);
  return runAnthropic(prompt);
}

export function configuredProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (process.env['OPENAI_API_KEY']?.trim()) providers.push('openai');
  if (process.env['GEMINI_API_KEY']?.trim()) providers.push('gemini');
  if (process.env['ANTHROPIC_API_KEY']?.trim()) providers.push('anthropic');
  return providers;
}

export async function runResearchAnalysis(prompt: string): Promise<AiRun> {
  const configured = configuredProviders();
  if (!configured.length) throw new Error('No independent AI provider is configured.');

  const requested = (process.env['AI_PROVIDER'] || '').trim().toLowerCase() as AiProvider;
  const provider = ['openai', 'gemini', 'anthropic'].includes(requested) && configured.includes(requested) ? requested : configured[0];
  return runAiProvider(provider, prompt);
}
