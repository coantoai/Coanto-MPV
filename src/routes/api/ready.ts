import { createFileRoute } from '@tanstack/react-router';
import { getDatabase } from '@/lib/database.server';
import { apiSecurityHeaders } from '@/lib/http-security.server';
import { releaseIdentity } from '@/lib/release.server';

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8' }),
  });
}

// Only enum diagnostics and binding presence are returned, never URLs, values or raw errors.
function safePreviewDiagnostic(error: unknown, stage: 'configuration' | 'database') {
  const names = ['INSFORGE_URL','INSFORGE_API_KEY','INSFORGE_ANON_KEY','GEMINI_API_KEY','SERPER_API_KEY','EXA_API_KEY','GEMINI_MODEL','COANTO_AGENT_PRINCIPALS','INSFORGE_BASE_URL','VITE_INSFORGE_BASE_URL','VITE_INSFORGE_ANON_KEY'] as const;
  const bindings = Object.fromEntries(names.map(name => [name, Boolean(process.env[name]?.trim())]));
  const detail = error && typeof error === 'object' ? error as { message?: unknown; code?: unknown; statusCode?: unknown; status?: unknown } : {};
  const message = typeof detail.message === 'string' ? detail.message : '';
  const code = typeof detail.code === 'string' ? detail.code : '';
  const status = typeof detail.statusCode === 'number' ? detail.statusCode : typeof detail.status === 'number' ? detail.status : null;
  let reason = 'BACKEND_REQUEST_FAILED';
  if (!bindings['INSFORGE_URL'] || !bindings['INSFORGE_API_KEY']) reason = 'MISSING_BACKEND_BINDING';
  else if (message.includes('INSFORGE_URL must be a valid URL')) reason = 'INVALID_BACKEND_URL';
  else if (message.includes('INSFORGE_URL must')) reason = 'INSECURE_OR_UNSUPPORTED_BACKEND_URL';
  else if (message.includes('INSFORGE_API_KEY must')) reason = 'INVALID_PROJECT_KEY_FORMAT';
  else if (message.includes('AI_PROVIDER must')) reason = 'INVALID_AI_PROVIDER_CONFIGURATION';
  else if (message.includes('CRON_SECRET must')) reason = 'INVALID_CRON_SECRET_CONFIGURATION';
  else if (status === 401 || code === '28P01') reason = 'BACKEND_AUTHENTICATION_REJECTED';
  else if (status === 403 || code === '42501') reason = 'BACKEND_PERMISSION_DENIED';
  else if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|table .* not found|schema cache/i.test(message)) reason = 'BACKEND_SCHEMA_UNAVAILABLE';
  else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(message)) reason = 'BACKEND_CONNECTION_FAILED';
  return { stage, reason, bindings, ...(status && [400,401,403,404,409,429,500,502,503,504].includes(status) ? { backendStatus: status } : {}), ...(['42P01','PGRST205','42501','28P01'].includes(code) ? { backendCode: code } : {}) };
}

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        const release = releaseIdentity();
        let stage: 'configuration' | 'database' = 'configuration';
        try {
          const database = getDatabase();
          stage = 'database';
          const { error } = await database.from('business_contexts').select('user_id').limit(1);
          if (error) throw error;
          return json(request, {
            ok: true,
            ready: true,
            service: 'coanto',
            release,
            dependencies: { insforge: 'ready' },
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          const previewDiagnostic = process.env['VERCEL_ENV'] === 'preview'
            ? { diagnostic: safePreviewDiagnostic(error, stage) } : {};
          return json(request, {
            ok: false,
            ready: false,
            service: 'coanto',
            release,
            dependencies: { insforge: 'unavailable' },
            ...previewDiagnostic,
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          }, 503);
        }
      },
    },
  },
});
