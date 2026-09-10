import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type AuthPrincipal = {
  userId: string;
  provider: 'supabase';
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

async function authenticateWithSupabase(token: string): Promise<AuthPrincipal | null> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) return null;

  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await client.auth.getClaims(token);
  const subject = data?.claims?.sub;
  if (error || !subject) return null;
  return { userId: String(subject), provider: 'supabase' };
}

/**
 * Server-side COANTO auth boundary.
 *
 * Application routes must depend on this function rather than a vendor SDK.
 * Supabase is the current auth implementation; InsForge is the target backend.
 * Keeping this boundary stable lets us migrate auth without rewriting routes.
 */
export async function authenticateRequest(request: Request): Promise<AuthPrincipal | null> {
  const token = bearerToken(request);
  if (!token) return null;
  return authenticateWithSupabase(token);
}

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  return (await authenticateRequest(request))?.userId ?? null;
}
