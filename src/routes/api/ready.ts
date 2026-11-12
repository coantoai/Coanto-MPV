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

// Preview diagnostics expose only allow-listed classifications and metadata,
// never credentials, backend URLs, raw messages, details, or hints.
function safePreviewDiagnostic(error: unknown, stage: 'configuration' | 'database') {
  const names = ['INSFORGE_URL','INSFORGE_API_KEY','INSFORGE_ANON_KEY','GEMINI_API_KEY','SERPER_API_KEY','EXA_API_KEY','GEMINI_MODEL','COANTO_AGENT_PRINCIPALS','INSFORGE_BASE_URL','VITE_INSFORGE_BASE_URL','VITE_INSFORGE_ANON_KEY'] as const;
  const bindings = Object.fromEntries(names.map(name => [name, Boolean(process.env[name]?.trim())]));
  const detail = error && typeof error === 'object'
    ? error as { message?: unknown; code?: unknown; statusCode?: unknown; status?: unknown; name?: unknown }
    : {};
  const messageObject = detail.message && typeof detail.message === 'object' ? detail.message as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown } : null;
  const message = typeof detail.message === 'string' ? detail.message : messageObject && typeof messageObject.message === 'string' ? messageObject.message : '';
  const messageFields = messageObject ? Object.keys(messageObject).slice(0, 16) : [];
  const messageType = messageObject ? (typeof messageObject.name === 'string' ? messageObject.name : (messageObject as object).constructor?.name || 'OBJECT') : typeof detail.message;
  const safeMessage = message
    .replace(/https?:\/\/[^\s]+/gi, '<url>')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/\b(?:ik|sk|pk)_[A-Za-z0-9_-]+\b/g, '<redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<token>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>')
    .replace(/[?&][^\s]+/g, '?<redacted>')
    .slice(0, 180);
  const code = typeof detail.code === 'string' && /^[A-Z0-9_]{2,24}$/.test(detail.code) ? detail.code : '';
  const status = typeof detail.statusCode === 'number' ? detail.statusCode : typeof detail.status === 'number' ? detail.status : null;
  let reason = 'BACKEND_REQUEST_FAILED';
  let messageClass = 'UNCLASSIFIED';
  if (!bindings['INSFORGE_URL'] || !bindings['INSFORGE_API_KEY']) reason = 'MISSING_BACKEND_BINDING';
  else if (message.includes('INSFORGE_URL must be a valid URL')) reason = 'INVALID_BACKEND_URL';
  else if (message.includes('INSFORGE_URL must')) reason = 'INSECURE_OR_UNSUPPORTED_BACKEND_URL';
  else if (message.includes('INSFORGE_API_KEY must')) reason = 'INVALID_PROJECT_KEY_FORMAT';
  else if (message.includes('AI_PROVIDER must')) reason = 'INVALID_AI_PROVIDER_CONFIGURATION';
  else if (message.includes('CRON_SECRET must')) reason = 'INVALID_CRON_SECRET_CONFIGURATION';
  else if (status === 401 || code === '28P01' || code === 'PGRST301') reason = 'BACKEND_AUTHENTICATION_REJECTED';
  else if (status === 403 || code === '42501') reason = 'BACKEND_PERMISSION_DENIED';
  else if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|table .* not found|schema cache/i.test(message)) reason = 'BACKEND_SCHEMA_UNAVAILABLE';
  else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(message)) reason = 'BACKEND_CONNECTION_FAILED';
  else if (code === 'PGRST116') reason = 'BACKEND_QUERY_RETURNED_NO_MATCH';
  else if (/no backend services available for app/i.test(message)) reason = 'BACKEND_SERVICES_UNAVAILABLE';
  if (/no backend services available for app/i.test(message)) messageClass = 'BACKEND_SERVICE_UNAVAILABLE';
  else if (/relation .* does not exist|table .* not found|schema cache|could not find the table/i.test(message)) messageClass = 'TABLE_OR_SCHEMA_NOT_FOUND';
  else if (/permission denied|not authorized|insufficient privilege|row-level security|row level security/i.test(message)) messageClass = 'PERMISSION_OR_RLS';
  else if (/invalid.*(key|token|jwt)|unauthorized|authentication/i.test(message)) messageClass = 'AUTHENTICATION';
  else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(message)) messageClass = 'NETWORK';
  else if (/does not exist|not found/i.test(message)) messageClass = 'RESOURCE_NOT_FOUND';
  else if (message) messageClass = 'OTHER_BACKEND_ERROR';
  const errorType = error && typeof error === 'object'
    ? (typeof detail.name === 'string' ? detail.name : (error as object).constructor?.name || 'OBJECT')
    : typeof error;
  const errorFields = error && typeof error === 'object' ? Object.keys(error).slice(0, 20) : [];
  const nested = detail.error && typeof detail.error === 'object'
    ? detail.error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown }
    : detail.cause && typeof detail.cause === 'object'
      ? detail.cause as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; name?: unknown }
      : null;
  const nestedMessage = nested && typeof nested.message === 'string' ? nested.message : '';
  const nestedCode = nested && typeof nested.code === 'string' && /^[A-Z0-9_]{2,24}$/.test(nested.code) ? nested.code : '';
  const nestedStatus = nested && typeof nested.status === 'number' ? nested.status : nested && typeof nested.statusCode === 'number' ? nested.statusCode : null;
  const nestedMessageClass = /permission denied|not authorized|insufficient privilege|row-level security|row level security/i.test(nestedMessage) ? 'PERMISSION_OR_RLS'
    : /relation .* does not exist|table .* not found|schema cache|could not find the table/i.test(nestedMessage) ? 'TABLE_OR_SCHEMA_NOT_FOUND'
    : /invalid.*(key|token|jwt)|unauthorized|authentication/i.test(nestedMessage) ? 'AUTHENTICATION'
    : /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(nestedMessage) ? 'NETWORK'
    : nestedMessage ? 'OTHER_BACKEND_ERROR' : 'UNAVAILABLE';
  return {
    stage,
    reason,
    messageClass,
    errorType,
    errorFields,
    messageType,
    ...(message ? { safeMessage } : {}),
    ...(messageObject ? { messageFields } : {}),
    ...(nested ? { nestedErrorType: typeof nested.name === 'string' ? nested.name : 'OBJECT', nestedMessageClass, ...(nestedCode ? { nestedBackendCode: nestedCode } : {}), ...(nestedStatus ? { nestedBackendStatus: nestedStatus } : {}) } : {}),
    bindings,
    ...(code ? { backendCode: code } : {}),
    ...(status && [400,401,403,404,409,429,500,502,503,504].includes(status) ? { backendStatus: status } : {}),
  };
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
