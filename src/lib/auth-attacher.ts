import { createMiddleware } from '@tanstack/react-start';
import { clientAuth } from './auth-client';

/**
 * Client-side authentication attachment boundary.
 *
 * Application bootstrap depends on this module, not on a provider-specific SDK.
 * The current provider remains transitional until InsForge auth migration is complete.
 */
export const attachAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const session = await clientAuth.getSession();
  return next({
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
});
