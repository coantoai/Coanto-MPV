export type ClientAuthSession = {
  accessToken: string;
  userId?: string;
};

export type AuthResult = {
  session: ClientAuthSession | null;
  message?: string;
};

type AuthResponse = {
  authenticated?: boolean;
  userId?: string;
  verificationRequired?: boolean;
  error?: string;
};

async function responseBody(response: Response): Promise<AuthResponse> {
  try { return await response.json() as AuthResponse; } catch { return {}; }
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
    const response = await fetch('/api/auth', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'signin', email: email.trim(), password }),
    });
    const body = await responseBody(response);
    if (!response.ok) throw new Error(body.error || 'تعذّر تسجيل الدخول.');
    return { session: body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' } };
  },

  async signUp(email: string, password: string, redirectTo?: string): Promise<AuthResult> {
    const payload: Record<string, string> = { action: 'signup', email: email.trim(), password };
    if (redirectTo) payload.redirectTo = redirectTo;
    const response = await fetch('/api/auth', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await responseBody(response);
    if (!response.ok && response.status !== 202) throw new Error(body.error || 'تعذّر إنشاء الحساب.');
    if (body.verificationRequired) return { session: null, message: 'verification-required' };
    return { session: body.userId ? { accessToken: '', userId: body.userId } : { accessToken: '' } };
  },

  async signOut(): Promise<void> {
    const response = await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error('تعذّر تسجيل الخروج.');
  },
};
