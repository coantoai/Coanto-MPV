const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export type MutationGuard = { ok: true } | { ok: false; status: 403; reason: string };

/**
 * Protects cookie-authenticated mutations from browser cross-site requests.
 * Non-browser/server clients without Origin/Sec-Fetch-Site remain supported.
 */
export function guardSameOriginMutation(request: Request): MutationGuard {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { ok: true };

  let requestOrigin: string;
  try { requestOrigin = new URL(request.url).origin; }
  catch { return { ok: false, status: 403, reason: 'Invalid request origin.' }; }

  const origin = request.headers.get('origin')?.trim();
  if (origin) {
    try {
      if (new URL(origin).origin !== requestOrigin) return { ok: false, status: 403, reason: 'Cross-origin mutation rejected.' };
    } catch {
      return { ok: false, status: 403, reason: 'Invalid Origin header.' };
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite === 'cross-site') return { ok: false, status: 403, reason: 'Cross-site mutation rejected.' };
  return { ok: true };
}

export function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id')?.trim() || '';
  if (REQUEST_ID_PATTERN.test(supplied)) return supplied;
  return crypto.randomUUID();
}

export function apiSecurityHeaders(request: Request, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('x-frame-options', 'DENY');
  headers.set('cross-origin-resource-policy', 'same-origin');
  if (!headers.has('x-request-id')) headers.set('x-request-id', requestId(request));
  return headers;
}

/** Only the local /auth callback is accepted for verification redirects. */
export function safeAuthRedirect(request: Request, candidate: unknown): string {
  const origin = new URL(request.url).origin;
  const fallback = `${origin}/auth`;
  if (typeof candidate !== 'string' || !candidate.trim()) return fallback;
  try {
    const parsed = new URL(candidate, origin);
    if (parsed.origin !== origin || parsed.pathname !== '/auth') return fallback;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export function contentLengthTooLarge(request: Request, maximumBytes: number): boolean {
  const value = request.headers.get('content-length');
  if (!value) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > maximumBytes;
}

export function utf8TooLarge(value: string, maximumBytes: number): boolean {
  return new TextEncoder().encode(value).byteLength > maximumBytes;
}
