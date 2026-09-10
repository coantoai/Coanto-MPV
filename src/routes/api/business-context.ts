import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@/lib/auth.server';
import { getBusinessContext, saveBusinessContext } from '@/lib/business-context.server';

const MAX_BODY = 32_000;
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/business-context')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateRequest(request);
        if (!principal) return json({ error: 'Authentication required.' }, 401);
        try {
          const context = await getBusinessContext(principal.userId);
          return json({ completed: Boolean(context), context });
        } catch (error) {
          console.error('Business context read failed', error);
          return json({ error: 'تعذّر تحميل بيانات النشاط.' }, 500);
        }
      },
      PUT: async ({ request }) => {
        const principal = await authenticateRequest(request);
        if (!principal) return json({ error: 'Authentication required.' }, 401);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json({ error: 'Request too large.' }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }
        try {
          const context = await saveBusinessContext(principal.userId, body);
          return json({ completed: true, context });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid business context.';
          if (/failed:/i.test(message)) {
            console.error('Business context persistence failed', error);
            return json({ error: 'تعذّر حفظ بيانات النشاط.' }, 500);
          }
          return json({ error: message }, 400);
        }
      },
    },
  },
});
