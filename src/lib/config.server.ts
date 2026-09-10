type RequiredKey = 'INSFORGE_URL' | 'INSFORGE_API_KEY';

type ServerConfig = {
  insforge: {
    url: string;
    apiKey: string;
  };
  ai: {
    preferredProvider: string;
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
  return url.toString().replace(/\/$/, '');
}

/** Production configuration entrypoint. */
export function getServerConfig(): ServerConfig {
  const insforgeUrl = normalizeUrl(required('INSFORGE_URL'), 'INSFORGE_URL');
  const insforgeApiKey = required('INSFORGE_API_KEY');
  if (!insforgeApiKey.startsWith('ik_')) {
    throw new Error('INSFORGE_API_KEY must be an InsForge project API key (ik_...).');
  }

  const cronSecret = process.env['CRON_SECRET']?.trim();
  return {
    insforge: { url: insforgeUrl, apiKey: insforgeApiKey },
    ai: { preferredProvider: process.env['AI_PROVIDER']?.trim().toLowerCase() || 'gemini' },
    monitoring: cronSecret ? { cronSecret } : {},
  };
}
