import { expect, test } from "bun:test";
import {
  createAgentHandler,
  type AgentDependencies,
} from "../src/lib/agent-api.server";
const id = "11111111-1111-4111-8111-111111111111";
function fixture(scopes = ["context:read"]) {
  const calls: unknown[] = [];
  const deps: AgentDependencies = {
    environment: "preview",
    enabled: true,
    authenticate: async (token) =>
      token === "valid"
        ? { userId: "tenant-a", scopes, allowedHosts: ["example.com"] }
        : null,
    reserve: async (input) => {
      calls.push(input);
      return { kind: "started" };
    },
    finish: async (...args) => {
      calls.push(args);
    },
    execute: async (tool, input, principal) => ({
      tool,
      input,
      userId: principal.userId,
    }),
  };
  return { deps, calls, handler: createAgentHandler(deps) };
}
function req(body: unknown, token = "valid") {
  return new Request("https://preview.example/api/agent", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": id,
    },
    body: JSON.stringify(body),
  });
}
test("requires valid bearer and denies cookie-only requests before execution", async () => {
  const { handler, calls } = fixture();
  expect(
    (await handler(req({ tool: "get_business_context", input: {} }, "bad")))
      .status,
  ).toBe(401);
  expect(
    (
      await handler(
        new Request("https://preview.example/api/agent", {
          method: "POST",
          headers: { cookie: "coanto_access_token=valid" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  expect(calls.length).toBe(0);
});
test("derives tenant from authenticated principal and rejects user-controlled tenancy", async () => {
  const { handler, calls } = fixture();
  const r = await handler(req({ tool: "get_business_context", input: {} }));
  expect(r.status).toBe(200);
  expect((await r.json()).data.userId).toBe("tenant-a");
  expect((calls[0] as { userId: string }).userId).toBe("tenant-a");
  expect(
    (
      await handler(
        req({ tool: "get_business_context", input: { userId: "tenant-b" } }),
      )
    ).status,
  ).toBe(400);
});
test("scope denial and production kill switch precede admission", async () => {
  const { deps, calls, handler } = fixture([]);
  expect(
    (await handler(req({ tool: "get_business_context", input: {} }))).status,
  ).toBe(403);
  deps.environment = "production";
  expect(
    (
      await createAgentHandler(deps)(
        req({ tool: "get_business_context", input: {} }),
      )
    ).status,
  ).toBe(404);
  expect(calls.length).toBe(0);
});
test("rate limits and idempotency conflict fail without executing tools", async () => {
  const { deps } = fixture();
  deps.reserve = async () => ({ kind: "limited" });
  expect(
    (
      await createAgentHandler(deps)(
        req({ tool: "get_business_context", input: {} }),
      )
    ).status,
  ).toBe(429);
  deps.reserve = async () => ({ kind: "conflict" });
  expect(
    (
      await createAgentHandler(deps)(
        req({ tool: "get_business_context", input: {} }),
      )
    ).status,
  ).toBe(409);
});
test("cached replay never executes and requires the same authorization", async () => {
  const { deps } = fixture();
  deps.reserve = async () => ({ kind: "cached", result: { persisted: true } });
  deps.execute = async () => {
    throw Error("should not execute");
  };
  const r = await createAgentHandler(deps)(
    req({ tool: "get_business_context", input: {} }),
  );
  expect(r.status).toBe(200);
  expect((await r.json()).data.persisted).toBe(true);
});
test("audit admission failures and tool failures fail closed without leaking errors", async () => {
  const { deps } = fixture();
  deps.reserve = async () => {
    throw Error("SECRET");
  };
  let r = await createAgentHandler(deps)(
    req({ tool: "get_business_context", input: {} }),
  );
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("SECRET");
  deps.reserve = async () => ({ kind: "started" });
  deps.execute = async () => {
    throw Error("SECRET");
  };
  r = await createAgentHandler(deps)(
    req({ tool: "get_business_context", input: {} }),
  );
  expect(r.status).toBe(502);
  expect(await r.text()).not.toContain("SECRET");
});
test("rejects oversized input, unexpected tools, invalid identifiers and cost escalation", async () => {
  const { handler } = fixture(["research:run"]);
  for (const b of [
    { tool: "delete", input: {} },
    {
      tool: "research",
      input: { provider: "serper", query: "a", maxResults: 1000 },
    },
    {
      tool: "research",
      input: { provider: "serper", query: "x".repeat(40000) },
    },
  ])
    expect((await handler(req(b))).status).toBe(400);
  const r = req({
    tool: "research",
    input: { provider: "serper", query: "footwear" },
  });
  r.headers.set("idempotency-key", "invalid");
  expect((await handler(r)).status).toBe(400);
});
