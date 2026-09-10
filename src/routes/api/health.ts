import { createFileRoute } from '@tanstack/react-router';
import { apiSecurityHeaders } from '@/lib/http-security.server';

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(
          JSON.stringify({
            ok: true,
            service: 'coanto',
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8' }),
          },
        ),
    },
  },
});