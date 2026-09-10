import { createMiddleware } from '@tanstack/react-start';
import { clientAuth } from '@/lib/auth-client';

/** @deprecated Prefer attachClientAuth. Kept temporarily for compatibility. */
export const attachClientAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  const session = await clientAuth.getSession();
  return next({
    headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
});

export const attachSupabaseAuth = attachClientAuth;
