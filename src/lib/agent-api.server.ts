import { createHash } from "node:crypto";
import { z } from "zod";

export const toolInputs = {
  get_business_context: z.object({}).strict(),
  research: z
    .object({
      provider: z.enum(["serper", "exa"]),
      query: z.string().trim().min(3).max(500),
      maxResults: z.number().int().min(1).max(5).default(5),
    })
    .strict(),
  collect_evidence: z
    .object({
      researchId: z.string().uuid(),
      indexes: z.array(z.number().int().min(0).max(4)).min(1).max(3),
    })
    .strict(),
  get_artifact: z.object({ requestId: z.string().uuid() }).strict(),
  run_pipeline: z.object({ evidenceId: z.string().uuid() }).strict(),
  list_decisions: z
    .object({ limit: z.number().int().min(1).max(20).default(10) })
    .strict(),
} as const;
export type AgentTool = keyof typeof toolInputs;
export type AgentPrincipal = {
  userId: string;
  scopes: string[];
  allowedHosts: string[];
};
export const toolPolicies: Record<AgentTool, { scope: string; units: number }> =
  {
    get_business_context: { scope: "context:read", units: 1 },
    research: { scope: "research:run", units: 10 },
    collect_evidence: { scope: "evidence:collect", units: 10 },
    get_artifact: { scope: "artifacts:read", units: 1 },
    run_pipeline: { scope: "intelligence:run", units: 5 },
    list_decisions: { scope: "decisions:read", units: 1 },
  };
export type Admission =
  | { kind: "started" }
  | { kind: "cached"; result: unknown }
  | { kind: "limited" | "conflict" | "running" };
export type AgentDependencies = {
  environment: string;
  enabled: boolean;
  authenticate(token: string): Promise<AgentPrincipal | null>;
  reserve(input: {
    userId: string;
    requestId: string;
    tool: AgentTool;
    inputHash: string;
    units: number;
  }): Promise<Admission>;
  finish(
    userId: string,
    requestId: string,
    result: unknown,
    errorCode: string | null,
  ): Promise<void>;
  execute(
    tool: AgentTool,
    input: Record<string, unknown>,
    principal: AgentPrincipal,
  ): Promise<unknown>;
};
const envelope = z
  .object({
    tool: z.enum(Object.keys(toolInputs) as [AgentTool, ...AgentTool[]]),
    input: z.record(z.unknown()),
  })
  .strict();
const MAX_BYTES = 16_384;
// Canonical ordering makes equivalent JSON inputs share the same idempotency hash.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
async function readBounded(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw Error("body");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createAgentHandler(deps: AgentDependencies) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, {
        status,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          ...(status === 429 ? { "retry-after": "60" } : {}),
        },
      });
    if (!deps.enabled || deps.environment === "production")
      return json({ error: "NOT_FOUND" }, 404);
    if (request.method !== "POST")
      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer ([^\s]{1,8192})$/)?.[1];
    if (!token) return json({ error: "UNAUTHENTICATED" }, 401);
    let principal: AgentPrincipal | null;
    try {
      principal = await deps.authenticate(token);
    } catch {
      return json({ error: "AUTH_UNAVAILABLE" }, 503);
    }
    if (!principal) return json({ error: "UNAUTHENTICATED" }, 401);
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return json({ error: "INVALID_CONTENT_TYPE" }, 415);
    const requestId = request.headers.get("idempotency-key");
    if (!z.string().uuid().safeParse(requestId).success)
      return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 400);
    let tool: AgentTool, input: Record<string, unknown>;
    try {
      const parsed = envelope.parse(await readBounded(request));
      tool = parsed.tool;
      input = toolInputs[tool].parse(parsed.input);
    } catch {
      return json({ error: "INVALID_INPUT" }, 400);
    }
    const policy = toolPolicies[tool];
    if (!principal.scopes.includes(policy.scope)) {
      console.info("coanto.agent.denied", {
        userId: principal.userId,
        tool,
        reason: "scope",
      });
      return json({ error: "INSUFFICIENT_SCOPE" }, 403);
    }
    const inputHash = createHash("sha256")
      .update(canonical({ tool, input }))
      .digest("hex");
    let admission: Admission;
    try {
      admission = await deps.reserve({
        userId: principal.userId,
        requestId: requestId!,
        tool,
        inputHash,
        units: policy.units,
      });
    } catch {
      return json({ error: "AUDIT_OR_BUDGET_UNAVAILABLE" }, 503);
    }
    if (admission.kind === "limited") {
      console.info("coanto.agent.denied", {
        userId: principal.userId,
        tool,
        reason: "budget",
      });
      return json({ error: "BUDGET_EXCEEDED" }, 429);
    }
    if (admission.kind === "conflict" || admission.kind === "running")
      return json(
        {
          error:
            admission.kind === "conflict"
              ? "IDEMPOTENCY_CONFLICT"
              : "OPERATION_IN_PROGRESS",
        },
        409,
      );
    if (admission.kind === "cached")
      return json({ requestId, tool, cached: true, data: admission.result });
    let result: unknown;
    try {
      result = await deps.execute(tool, input, principal);
    } catch {
      try {
        await deps.finish(principal.userId, requestId!, null, "TOOL_FAILED");
      } catch {
        return json({ error: "AUDIT_UNAVAILABLE" }, 503);
      }
      return json({ requestId, tool, error: "TOOL_FAILED" }, 502);
    }
    try {
      await deps.finish(principal.userId, requestId!, result, null);
    } catch {
      return json({ requestId, error: "PERSISTENCE_UNCONFIRMED" }, 503);
    }
    return json({ requestId, tool, cached: false, data: result });
  };
}
