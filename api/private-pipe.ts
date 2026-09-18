type Json = Record<string, unknown>;

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function authorized(req: Request) {
  const expected = process.env.COANTO_PIPE_TOKEN;
  if (!expected) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}

function n8nHeaders() {
  const key = process.env.N8N_API_KEY;
  if (!key) throw new Error("N8N_API_KEY is not configured");
  return { "X-N8N-API-KEY": key, "content-type": "application/json" };
}

function n8nBase() {
  const base = process.env.N8N_BASE_URL;
  if (!base) throw new Error("N8N_BASE_URL is not configured");
  return base.replace(/\/$/, "");
}

async function n8n(path: string, init: RequestInit = {}) {
  const res = await fetch(`${n8nBase()}/api/v1${path}`, {
    ...init,
    headers: { ...n8nHeaders(), ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) throw new Error(`n8n ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

function allowedWebhooks(): Record<string, string> {
  const raw = process.env.COANTO_PIPE_WEBHOOKS || "{}";
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("COANTO_PIPE_WEBHOOKS must be a JSON object");
  return parsed;
}

export default async function handler(req: Request) {
  if (!authorized(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "health";

  try {
    if (req.method === "GET" && action === "health") {
      return json({
        ok: true,
        service: "coanto-private-pipe",
        n8nConfigured: Boolean(process.env.N8N_BASE_URL && process.env.N8N_API_KEY),
        allowedWorkflowAliases: Object.keys(allowedWebhooks()),
      });
    }

    if (req.method === "GET" && action === "workflows") {
      const data = await n8n("/workflows?limit=100");
      return json({ ok: true, data });
    }

    if (req.method === "GET" && action === "executions") {
      const workflowId = url.searchParams.get("workflowId");
      const qs = workflowId ? `?limit=50&workflowId=${encodeURIComponent(workflowId)}` : "?limit=50";
      const data = await n8n(`/executions${qs}`);
      return json({ ok: true, data });
    }

    if (req.method === "POST" && action === "run") {
      const body = await req.json().catch(() => ({})) as { workflow?: string; input?: unknown };
      if (!body.workflow) return json({ ok: false, error: "workflow alias required" }, 400);

      const hooks = allowedWebhooks();
      const target = hooks[body.workflow];
      if (!target) return json({ ok: false, error: "workflow is not allowlisted" }, 403);

      const res = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "coanto-private-pipe", input: body.input ?? {} }),
      });
      const text = await res.text();
      let result: unknown = text;
      try { result = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) return json({ ok: false, error: "workflow failed", status: res.status, result }, 502);
      return json({ ok: true, workflow: body.workflow, result });
    }

    return json({ ok: false, error: "unsupported action" }, 404);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "unknown error" }, 500);
  }
}
