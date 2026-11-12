import { createFileRoute } from "@tanstack/react-router";
import { createAgentHandler } from "@/lib/agent-api.server";
import { authenticateAgent } from "@/lib/agent-auth.server";
import {
  reserveAgentOperation,
  finishAgentOperation,
} from "@/lib/agent-store.server";
import { agentServices } from "@/lib/agent-services.server";
import { agentOpenApi } from "@/lib/agent-openapi";
function active() {
  return (
    process.env["VERCEL_ENV"] !== "production" &&
    process.env["COANTO_AGENT_ENABLED"] !== "false"
  );
}
export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        active()
          ? Response.json(agentOpenApi(new URL(request.url).origin), {
              headers: {
                "cache-control": "no-store",
                "x-content-type-options": "nosniff",
              },
            })
          : new Response(null, { status: 404 }),
      POST: async ({ request }) =>
        createAgentHandler({
          environment: process.env["VERCEL_ENV"] ?? "development",
          enabled: active(),
          authenticate: authenticateAgent,
          reserve: reserveAgentOperation,
          finish: finishAgentOperation,
          execute: agentServices,
        })(request),
    },
  },
});
