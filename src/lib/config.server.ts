type RequiredKey = 'INSFORGE_URL' | 'INSFORGE_API_KEY';
type SupportedAiProvider = 'gemini' | 'openai' | 'openrouter' | 'anthropic';

type ServerConfig = {
  insforge: {
    url: string;
    apiKey: string;
  };
  ai: {
    preferredProvider: SupportedAiProvider;
  };
  monitoring: {
    cronSecret?: string;
  };
};

function required(name: RequiredKey): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${name} must use HTTP(S).`);
  }
  if (process.env['NODE_ENV'] === 'production' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  return url.toString().replace(/\/$/, '');
}

function preferredAiProvider(): SupportedAiProvider {
  const raw = process.env['AI_PROVIDER']?.trim().toLowerCase() || 'gemini';
  if (raw === 'gemini' || raw === 'openai' || raw === 'openrouter' || raw === 'anthropic') return raw;
  throw new Error('AI_PROVIDER must be gemini, openai, openrouter, or anthropic.');
}

/** Production configuration entrypoint. */
export function getServerConfig(): ServerConfig {
  const insforgeUrl = normalizeUrl(required('INSFORGE_URL'), 'INSFORGE_URL');
  const insforgeApiKey = required('INSFORGE_API_KEY');
  if (!insforgeApiKey.startsWith('ik_')) {
    throw new Error('INSFORGE_API_KEY must be an InsForge project API key (ik_...).');
  }

  const cronSecret = process.env['CRON_SECRET']?.trim();
  if (process.env['NODE_ENV'] === 'production' && cronSecret && cronSecret.length < 32) {
    throw new Error('CRON_SECRET must contain at least 32 characters in production.');
  }

  return {
    insforge: { url: insforgeUrl, apiKey: insforgeApiKey },
    ai: { preferredProvider: preferredAiProvider() },
    monitoring: cronSecret ? { cronSecret } : {},
  };
}
