import { createClient } from '@insforge/sdk';
import { getServerConfig } from './config.server';

export const AUTH_COOKIE = 'coanto_access_token';
const MAX_ACCESS_TOKEN_LENGTH = 8_192;

export type AuthPrincipal = {
  userId: string;
  provider: 'insforge';
};

function validToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim();
  return token && token.length <= MAX_ACCESS_TOKEN_LENGTH ? token : null;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try { return validToken(decodeURIComponent(rest.join('='))); }
      catch { return null; }
    }
  }
  return null;
}

export function accessTokenFromRequest(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return validToken(header.slice(7));
  return cookieValue(request, AUTH_COOKIE);
}

function secureCookie(request: Request): boolean {
  try { return new URL(request.url).protocol === 'https:'; } catch { return true; }
}

export function authCookie(request: Request, token: string): string {
  const safe = validToken(token);
  if (!safe) throw new Error('Invalid authentication token.');
  return `${AUTH_COOKIE}=${encodeURIComponent(safe)}; Path=/; HttpOnly; SameSite=Lax${secureCookie(request) ? '; Secure' : ''}`;
}

export function clearAuthCookie(request: Request): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secureCookie(request) ? '; Secure' : ''}; Max-Age=0`;
}

export async function authenticateRequest(request: Request): Promise<AuthPrincipal | null> {
  const token = accessTokenFromRequest(request);
  if (!token) return null;
  const { insforge } = getServerConfig();
  const client = createClient({ baseUrl: insforge.url, accessToken: token });
  const { data, error } = await client.auth.getCurrentUser();
  const userId = data?.user?.id;
  if (error || !userId) return null;
  return { userId: String(userId), provider: 'insforge' };
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  return (await authenticateRequest(request))?.userId ?? null;
}