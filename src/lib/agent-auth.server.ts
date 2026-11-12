import { z } from "zod";
import { authenticateRequest } from "./auth.server";
import type { AgentPrincipal } from "./agent-api.server";
const principal = z
  .object({
    userId: z.string().uuid(),
    scopes: z
      .array(
        z.enum([
          "context:read",
          "research:run",
          "evidence:collect",
          "artifacts:read",
          "intelligence:run",
          "decisions:read",
        ]),
      )
      .max(6),
    allowedHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).max(20),
  })
  .strict();
export async function authenticateAgent(
  token: string,
): Promise<AgentPrincipal | null> {
  const configured = z
    .array(principal)
    .max(20)
    .parse(JSON.parse(process.env["COANTO_AGENT_PRINCIPALS"] ?? "[]"));
  if (!configured.length) return null;
  const verified = await authenticateRequest(
    new Request("https://coanto.invalid/api/agent", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  if (!verified) return null;
  return configured.find((p) => p.userId === verified.userId) ?? null;
}
