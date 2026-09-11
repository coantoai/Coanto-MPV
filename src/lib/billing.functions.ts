import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from './auth-middleware';
import { getBillingOverview as readBillingOverview } from './billing.server';

export const getBillingOverview = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(async ({ context }) => readBillingOverview(context.userId));
