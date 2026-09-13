export type ClientAuthSession = { accessToken: string; userId?: string };
export type AuthResult = { session: ClientAuthSession | null; message?: string };
type AuthResponse = { authenticated?: boolean; userId?: string; verificationRequired?: boolean; resetCodeSent?: boolean; passwordReset?: boolean; error?: string };
async function responseBody(response: Response): Promise<AuthResponse> { try { return await response.json() as AuthResponse; } catch { return {}; } }
async function post(payload: Record<string, string>) {
  const response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await responseBody(response);
  if (!response.ok && response.status !== 202) throw new Error(body.error || 'تعذّر إتمام العملية.');
  return body;
}

/** Browser auth facade. Tokens stay in an HttpOnly cookie managed by the server. */
export const clientAuth = {
  async getSession(): Promise<ClientAuthSession | null> {
    const response = await fetch('/api/auth', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) return null;
    const body = await responseBody(response);
    if (!response.ok || !body.authenticated) throw new Error(body.error || 'تعذّر التحقق من الجلسة.');
    return body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' };
  },
  async signIn(email: string, password: string): Promise<AuthResult> {
    const body = await post({ action: 'signin', email: email.trim(), password });
    return { session: body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' } };
  },
  async signUp(email: string, password: string, redirectTo?: string): Promise<AuthResult> {
    const payload: Record<string, string> = { action: 'signup', email: email.trim(), password };
    if (redirectTo) payload['redirectTo'] = redirectTo;
    const body = await post(payload);
    if (body.verificationRequired) return { session: null, message: 'verification-required' };
    return { session: body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' } };
  },
  async verifyEmail(email: string, otp: string): Promise<AuthResult> {
    const body = await post({ action: 'verify-email', email: email.trim(), otp: otp.trim() });
    return { session: body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' } };
  },
  async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    const payload: Record<string, string> = { action: 'reset-request', email: email.trim() };
    if (redirectTo) payload['redirectTo'] = redirectTo;
    await post(payload);
  },
  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    await post({ action: 'reset-confirm', email: email.trim(), otp: otp.trim(), password: newPassword });
  },
  async signOut(): Promise<void> {
    const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error('تعذّر تسجيل الخروج.');
  },
};
