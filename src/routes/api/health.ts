import { createFileRoute } from "@tanstack/react-router";

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            service: "coanto",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          },
        ),
    },
  },
});
