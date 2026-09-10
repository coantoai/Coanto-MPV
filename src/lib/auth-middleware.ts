import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { authenticateRequest } from './auth.server';

/** Provider-neutral server authentication boundary. */
export const requireAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const request = getRequest();
  if (!request) throw new Error('Unauthorized');

  const principal = await authenticateRequest(request);
  if (!principal) throw new Error('Unauthorized');

  return next({
    context: {
      userId: principal.userId,
      authProvider: principal.provider,
    },
  });
});
