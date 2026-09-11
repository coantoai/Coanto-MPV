import { createFileRoute } from '@tanstack/react-router';
import { getDatabase } from '@/lib/database.server';
import { apiSecurityHeaders } from '@/lib/http-security.server';

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8' }),
  });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const startedAt = Date.now();
        try {
          const { error } = await getDatabase().from('business_contexts').select('user_id').limit(1);
          if (error) throw new Error(error.message);
          return json(request, {
            ok: true,
            ready: true,
            service: 'coanto',
            dependencies: { insforge: 'ready' },
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          });
        } catch {
          return json(request, {
            ok: false,
            ready: false,
            service: 'coanto',
            dependencies: { insforge: 'unavailable' },
            latencyMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
          }, 503);
        }
      },
    },
  },
});
