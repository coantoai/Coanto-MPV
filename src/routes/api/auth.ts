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
  return new Response(JSON.stringify(body), { status, headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8', ...headers }) });
}
function publicAuthClient() {
  const { insforge } = getServerConfig();
  const anonKey = process.env['INSFORGE_ANON_KEY']?.trim();
  if (!anonKey) throw new Error('INSFORGE_ANON_KEY is required for public authentication.');
  return createClient({ baseUrl: insforge.url, anonKey });
}
async function noteFailure(email: string, action: 'signin' | 'signup', request: Request) { try { await recordAuthFailure(email, action, request); } catch (error) { console.error('Auth throttle failure write failed', { action, error }); } }
async function clearFailures(email: string, request: Request) { try { await clearSubjectAuthFailures(email, request); } catch (error) { console.error('Auth throttle cleanup failed', { error }); } }

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/auth')({
  server: { handlers: {
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
      let body: { action?: string; email?: string; password?: string; otp?: string; redirectTo?: string };
      try { body = JSON.parse(raw); } catch { return json(request, { error: 'Invalid request.' }, 400); }
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
      const action = ['signup','signin','verify-email','reset-request','reset-confirm'].includes(body.action || '') ? body.action! : null;
      if (!action) return json(request, { error: 'Unsupported auth action.' }, 400);
      if (!email || email.length > MAX_EMAIL) return json(request, { error: 'أدخل بريدًا إلكترونيًا صحيحًا.' }, 400);
      const client = publicAuthClient();

      if (action === 'verify-email') {
        if (!/^\d{6}$/.test(otp)) return json(request, { error: 'أدخل رمز التحقق المكوّن من 6 أرقام.' }, 400);
        const { data, error } = await client.auth.verifyEmail({ email, otp });
        if (error) return json(request, { error: 'رمز التحقق غير صحيح أو انتهت صلاحيته.' }, 400);
        if (!data?.accessToken) return json(request, { error: 'تم تأكيد البريد ولكن تعذّر إنشاء جلسة الدخول.' }, 502);
        return json(request, { authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, data.accessToken) });
      }

      if (action === 'reset-request') {
        const { error } = await client.auth.sendResetPasswordEmail({ email, redirectTo: safeAuthRedirect(request, body.redirectTo) });
        if (error) console.warn('Password reset email request rejected', { statusCode: error.statusCode });
        // Keep the response generic so account existence is never disclosed.
        return json(request, { resetCodeSent: true });
      }

      if (action === 'reset-confirm') {
        if (!/^\d{6}$/.test(otp)) return json(request, { error: 'أدخل الرمز المكوّن من 6 أرقام.' }, 400);
        if (!password || password.length < 6 || password.length > MAX_PASSWORD) return json(request, { error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' }, 400);
        const exchanged = await client.auth.exchangeResetPasswordToken({ email, code: otp });
        if (exchanged.error || !exchanged.data?.token) return json(request, { error: 'الرمز غير صحيح أو انتهت صلاحيته.' }, 400);
        const reset = await client.auth.resetPassword({ newPassword: password, otp: exchanged.data.token });
        if (reset.error) return json(request, { error: 'تعذّر تغيير كلمة المرور. حاول مرة أخرى.' }, 400);
        return json(request, { passwordReset: true });
      }

      if (!password || password.length < 6 || password.length > MAX_PASSWORD) return json(request, { error: 'Invalid email or password.' }, 400);
      const rateAction = action as 'signin' | 'signup';
      let throttle;
      try { throttle = await checkAuthRateLimit(email, rateAction, request); }
      catch (error) { console.error('Auth throttle unavailable', { action, error }); return json(request, { error: 'Authentication service is temporarily unavailable.' }, 503, { 'retry-after': '30' }); }
      if (!throttle.allowed) return json(request, { error: 'Too many authentication attempts. Try again later.' }, 429, { 'retry-after': String(throttle.retryAfterSeconds) });

      if (action === 'signup') {
        const redirectTo = safeAuthRedirect(request, body.redirectTo);
        const { data, error } = await client.auth.signUp({ email, password, redirectTo });
        if (error) { await noteFailure(email, 'signup', request); return json(request, { error: 'Unable to create this account with the supplied details.' }, 400); }
        await clearFailures(email, request);
        if (!data?.accessToken) return json(request, { authenticated: false, verificationRequired: true }, 202);
        return json(request, { authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, data.accessToken) });
      }

      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) { await noteFailure(email, 'signin', request); return json(request, { error: 'Invalid email or password.' }, 401); }
      await clearFailures(email, request);
      if (!data?.accessToken) return json(request, { error: 'Authentication session was not created.' }, 502);
      return json(request, { authenticated: true, userId: data.user?.id }, 200, { 'set-cookie': authCookie(request, data.accessToken) });
    },
    DELETE: async ({ request }) => {
      const mutation = guardSameOriginMutation(request);
      if (!mutation.ok) return json(request, { error: 'Cross-site request rejected.' }, mutation.status);
      const token = accessTokenFromRequest(request);
      if (token) { try { const { insforge } = getServerConfig(); const client = createClient({ baseUrl: insforge.url, accessToken: token }); await client.auth.signOut(); } catch {} }
      return json(request, { ok: true }, 200, { 'set-cookie': clearAuthCookie(request) });
    },
  } },
});
