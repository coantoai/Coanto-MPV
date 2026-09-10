import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { authenticateRequest } from './auth.server';

/**
 * Server authentication boundary used by application server functions.
 *
 * The provider-specific database client in context is transitional only. Domain
 * code should depend on `userId` for tenancy and move persistence behind adapters.
 */
export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const request = getRequest();
  if (!request) throw new Error('Unauthorized');

  const principal = await authenticateRequest(request);
  if (!principal) throw new Error('Unauthorized');

  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!token || !url || !key) throw new Error('Unauthorized');

  const dataClient = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });

  return next({
    context: {
      userId: principal.userId,
      authProvider: principal.provider,
      // Transitional compatibility until persistence is fully moved to InsForge.
      supabase: dataClient,
    },
  });
});
