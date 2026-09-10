import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@insforge/sdk';
import { getServerConfig } from '@/lib/config.server';
import { accessTokenFromRequest, authenticateRequest, authCookie, clearAuthCookie } from '@/lib/auth.server';

const MAX_BODY = 16_000;
function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
function publicAuthClient() {
  const { insforge } = getServerConfig();
  return createClient({ baseUrl: insforge.url });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/auth')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateRequest(request);
        return principal ? json({ authenticated: true, userId: principal.userId }) : json({ authenticated: false }, 401);
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json({ error: 'Request too large.' }, 413);
        let body: { action?: string; email?: string; password?: string; redirectTo?: string };
        try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!email || !password) return json({ error: 'Email and password are required.' }, 400);
        const client = publicAuthClient();
        if (body.action === 'signup') {
          const payload = body.redirectTo ? { email, password, redirectTo: body.redirectTo } : { email, password };
          const { data, error } = await client.auth.signUp(payload);
          if (error) return json({ error: error.message || 'Sign up failed.' }, error.statusCode || 400);
          const token = data?.accessToken;
          if (!token) return json({ authenticated: false, verificationRequired: true }, 202);
          return json({ authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, token) });
        }
        if (body.action === 'signin') {
          const { data, error } = await client.auth.signInWithPassword({ email, password });
          if (error) return json({ error: error.message || 'Sign in failed.' }, error.statusCode || 401);
          const token = data?.accessToken;
          if (!token) return json({ error: 'Authentication session was not created.' }, 502);
          return json({ authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, token) });
        }
        return json({ error: 'Unsupported auth action.' }, 400);
      },
      DELETE: async ({ request }) => {
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
        return json({ ok: true }, 200, { 'set-cookie': clearAuthCookie(request) });
      },
    },
  },
});
