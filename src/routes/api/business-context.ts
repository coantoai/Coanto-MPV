import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@/lib/auth.server';
import { getBusinessContext, saveBusinessContext } from '@/lib/business-context.server';
import { apiSecurityHeaders, contentLengthTooLarge, guardSameOriginMutation, utf8TooLarge } from '@/lib/http-security.server';

const MAX_BODY = 32_000;
function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8' }),
  });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/business-context')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const principal = await authenticateRequest(request);
        if (!principal) return json(request, { error: 'Authentication required.' }, 401);
        try {
          const context = await getBusinessContext(principal.userId);
          return json(request, { completed: Boolean(context), context });
        } catch (error) {
          console.error('Business context read failed', error);
          return json(request, { error: 'تعذّر تحميل بيانات النشاط.' }, 500);
        }
      },
      PUT: async ({ request }) => {
        const mutation = guardSameOriginMutation(request);
        if (!mutation.ok) return json(request, { error: 'Cross-site request rejected.' }, mutation.status);
        const principal = await authenticateRequest(request);
        if (!principal) return json(request, { error: 'Authentication required.' }, 401);
        if (contentLengthTooLarge(request, MAX_BODY)) return json(request, { error: 'Request too large.' }, 413);
        const raw = await request.text();
        if (utf8TooLarge(raw, MAX_BODY)) return json(request, { error: 'Request too large.' }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return json(request, { error: 'Invalid JSON.' }, 400); }
        try {
          const context = await saveBusinessContext(principal.userId, body);
          return json(request, { completed: true, context });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid business context.';
          if (/failed:/i.test(message)) {
            console.error('Business context persistence failed', error);
            return json(request, { error: 'تعذّر حفظ بيانات النشاط.' }, 500);
          }
          return json(request, { error: message }, 400);
        }
      },
    },
  },
});