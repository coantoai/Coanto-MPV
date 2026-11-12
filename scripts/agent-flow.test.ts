import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createAgentHandler,
  type AgentDependencies,
} from "../src/lib/agent-api.server";
import {
  createAgentServices,
  type AgentServiceDependencies,
} from "../src/lib/agent-services.server";
import { createEvidence } from "../src/lib/evidence-engine.server";
const scopes = [
  "context:read",
  "research:run",
  "evidence:collect",
  "artifacts:read",
  "intelligence:run",
  "decisions:read",
];
function record(host: string, contradicts = false) {
  return createEvidence({
    kind: "direct",
    sourceUrl: `https://${host}/`,
    sourceGroup: host,
    content:
      "Observed product price changed from $100 to $120 in the controlled test fixture.",
    ...(contradicts ? { contradictsClaim: "fixture-claim" } : {}),
  });
}
test("HTTP tool flow: identity -> independent research -> evidence attribution -> persistence -> intelligence/decisions -> tenant denial", async () => {
  const artifacts = new Map<
    string,
    {
      tool: string;
      result_json: unknown;
      created_at: string;
      hash: string;
      running: boolean;
    }
  >();
  const services: AgentServiceDependencies = {
    context: async (userId) => ({ businessName: userId }),
    research: async (provider) => ({
      provider,
      status: "ok",
      httpStatus: 200,
      checkedAt: new Date().toISOString(),
      results: ["one.example", "two.example"].map((host) => ({
        provider,
        url: `https://${host}/`,
        title: host,
        snippet: "Observed product data",
        sourceType: "search-index",
      })),
    }),
    readArtifact: async (user, id) => {
      const item = artifacts.get(`${user}:${id}`);
      if (!item || item.running) throw Error("Unavailable");
      return item;
    },
    collect: async () => ({
      records: [record("one.example"), record("two.example")],
      rejected: [],
    }),
    monitoring: async () => [
      {
        id: "fixture-event",
        eventType: "price-change",
        severity: "high",
        changeScore: 90,
        title: "Observed price change",
        summary: "Fixture baseline/current difference",
        evidence: { url: "https://one.example/" },
        detectedAt: new Date().toISOString(),
        targetId: "fixture-target",
      },
    ],
    listDecisions: async () => [],
  };
  const deps: AgentDependencies = {
    environment: "preview",
    enabled: true,
    authenticate: async (token) =>
      ["tenant-a", "tenant-b"].includes(token)
        ? {
            userId: token,
            scopes,
            allowedHosts: ["one.example", "two.example"],
          }
        : null,
    reserve: async (input) => {
      const key = `${input.userId}:${input.requestId}`,
        old = artifacts.get(key);
      if (old)
        return old.hash !== input.inputHash
          ? { kind: "conflict" }
          : old.running
            ? { kind: "running" }
            : { kind: "cached", result: old.result_json };
      artifacts.set(key, {
        tool: input.tool,
        result_json: null,
        created_at: new Date().toISOString(),
        hash: input.inputHash,
        running: true,
      });
      return { kind: "started" };
    },
    finish: async (user, id, result, error) => {
      const item = artifacts.get(`${user}:${id}`)!;
      item.result_json = result;
      item.running = Boolean(error);
    },
    execute: createAgentServices(services),
  };
  const handler = createAgentHandler(deps);
  async function call(
    tool: string,
    input: unknown,
    tenant = "tenant-a",
    id = randomUUID(),
  ) {
    const response = await handler(
      new Request("https://preview.example/api/agent", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tenant}`,
          "content-type": "application/json",
          "idempotency-key": id,
        },
        body: JSON.stringify({ tool, input }),
      }),
    );
    return { status: response.status, body: await response.json() };
  }
  const context = await call("get_business_context", {});
  expect(context.body.data.businessName).toBe("tenant-a");
  const serper = await call("research", {
      provider: "serper",
      query: "footwear",
    }),
    exa = await call("research", { provider: "exa", query: "footwear" });
  expect(serper.body.data.provider).toBe("serper");
  expect(exa.body.data.provider).toBe("exa");
  const evidence = await call("collect_evidence", {
    researchId: serper.body.requestId,
    indexes: [0, 1],
  });
  expect(evidence.status).toBe(200);
  expect(evidence.body.data.records[0].metadata.researchProvider).toBe(
    "serper",
  );
  expect(evidence.body.data.records[0].status).toBe("VERIFIED");
  const pipeline = await call("run_pipeline", {
    evidenceId: evidence.body.requestId,
  });
  expect(pipeline.status).toBe(200);
  expect(pipeline.body.data.insights.length).toBe(1);
  expect(pipeline.body.data.decisions.length).toBe(1);
  const replay = await call(
    "research",
    { provider: "serper", query: "footwear" },
    "tenant-a",
    serper.body.requestId,
  );
  expect(replay.body.cached).toBe(true);
  const denied = await call(
    "collect_evidence",
    { researchId: serper.body.requestId, indexes: [0] },
    "tenant-b",
  );
  expect(denied.status).toBe(502);
  const saved = artifacts.get(`tenant-a:${evidence.body.requestId}`)!;
  saved.result_json = {
    records: [
      record("one.example"),
      record("two.example"),
      record("three.example", true),
    ],
  };
  const refused = await call("run_pipeline", {
    evidenceId: evidence.body.requestId,
  });
  expect(refused.body.data.sourceTrust.proofLevel).toBe("UNCERTAIN");
  expect(refused.body.data.decisions).toEqual([]);
});
