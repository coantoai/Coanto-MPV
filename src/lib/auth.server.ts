import { createClient } from '@insforge/sdk';
import { getServerConfig } from './config.server';

export const AUTH_COOKIE = 'coanto_access_token';

export type AuthPrincipal = {
  userId: string;
  provider: 'insforge';
};

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function accessTokenFromRequest(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return cookieValue(request, AUTH_COOKIE);
}

export function authCookie(token: string): string {
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure`;
}

export function clearAuthCookie(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
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
