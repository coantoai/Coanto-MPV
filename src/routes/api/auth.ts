import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@insforge/sdk';
import { getServerConfig } from '@/lib/config.server';
import { accessTokenFromRequest, authenticateRequest, authCookie, clearAuthCookie } from '@/lib/auth.server';
import { checkAuthRateLimit, clearSubjectAuthFailures, recordAuthFailure } from '@/lib/auth-rate-limit.server';
import { apiSecurityHeaders, contentLengthTooLarge, guardSameOriginMutation, safeAuthRedirect, utf8TooLarge } from '@/lib/http-security.server';

const MAX_BODY = 16_000;
const MAX_EMAIL = 320;
const MAX_PASSWORD = 256;
function json(request: Request, body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8', ...headers }),
  });
}
function publicAuthClient() {
  const { insforge } = getServerConfig();
  return createClient({ baseUrl: insforge.url });
}
async function noteFailure(email: string, action: 'signin' | 'signup', request: Request) {
  try { await recordAuthFailure(email, action, request); }
  catch (error) { console.error('Auth throttle failure write failed', { action, error }); }
}
async function clearFailures(email: string, request: Request) {
  try { await clearSubjectAuthFailures(email, request); }
  catch (error) { console.error('Auth throttle cleanup failed', { error }); }
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateRequest(request);
        return principal ? json(request, { authenticated: true, userId: principal.userId }) : json(request, { authenticated: false }, 401);
      },
      POST: async ({ request }) => {
        const mutation = guardSameOriginMutation(request);
        if (!mutation.ok) return json(request, { error: 'Cross-site request rejected.' }, mutation.status);
        if (contentLengthTooLarge(request, MAX_BODY)) return json(request, { error: 'Request too large.' }, 413);
        const raw = await request.text();
        if (utf8TooLarge(raw, MAX_BODY)) return json(request, { error: 'Request too large.' }, 413);
        let body: { action?: string; email?: string; password?: string; redirectTo?: string };
        try { body = JSON.parse(raw); } catch { return json(request, { error: 'Invalid request.' }, 400); }
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!email || !password) return json(request, { error: 'Email and password are required.' }, 400);
        if (email.length > MAX_EMAIL || password.length < 6 || password.length > MAX_PASSWORD) return json(request, { error: 'Invalid email or password.' }, 400);
        const action = body.action === 'signup' ? 'signup' : body.action === 'signin' ? 'signin' : null;
        if (!action) return json(request, { error: 'Unsupported auth action.' }, 400);

        let throttle;
        try { throttle = await checkAuthRateLimit(email, action, request); }
        catch (error) {
          console.error('Auth throttle unavailable', { action, error });
          return json(request, { error: 'Authentication service is temporarily unavailable.' }, 503, { 'retry-after': '30' });
        }
        if (!throttle.allowed) return json(request, { error: 'Too many authentication attempts. Try again later.' }, 429, { 'retry-after': String(throttle.retryAfterSeconds) });

        const client = publicAuthClient();
        if (action === 'signup') {
          const redirectTo = safeAuthRedirect(request, body.redirectTo);
          const { data, error } = await client.auth.signUp({ email, password, redirectTo });
          if (error) {
            await noteFailure(email, action, request);
            console.warn('InsForge sign-up rejected', { statusCode: error.statusCode });
            return json(request, { error: 'Unable to create this account with the supplied details.' }, error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400);
          }
          await clearFailures(email, request);
          const token = data?.accessToken;
          if (!token) return json(request, { authenticated: false, verificationRequired: true }, 202);
          return json(request, { authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, token) });
        }

        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          await noteFailure(email, action, request);
          console.warn('InsForge sign-in rejected', { statusCode: error.statusCode });
          return json(request, { error: 'Invalid email or password.' }, 401);
        }
        await clearFailures(email, request);
        const token = data?.accessToken;
        if (!token) return json(request, { error: 'Authentication session was not created.' }, 502);
        return json(request, { authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, token) });
      },
      DELETE: async ({ request }) => {
        const mutation = guardSameOriginMutation(request);
        if (!mutation.ok) return json(request, { error: 'Cross-site request rejected.' }, mutation.status);
        const token = accessTokenFromRequest(request);
        if (token) {
          try {
            const { insforge } = getServerConfig();
            const client = createClient({ baseUrl: insforge.url, accessToken: token });
            await client.auth.signOut();
          } catch {
            // Cookie removal is authoritative for the local session even if remote revocation fails.
          }
        }
        return json(request, { ok: true }, 200, { 'set-cookie': clearAuthCookie(request) });
      },
    },
  },
});
