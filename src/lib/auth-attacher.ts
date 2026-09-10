import { createMiddleware } from '@tanstack/react-start';

/**
 * Authentication is carried by the same-origin HttpOnly COANTO session cookie.
 * No bearer token is exposed to browser code.
 */
export const attachAuth = createMiddleware({ type: 'function' }).client(async ({ next }) => next());
