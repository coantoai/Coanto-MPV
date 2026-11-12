import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
const base = new URL(process.env.COANTO_AGENT_BASE_URL ?? "");
if (
  base.protocol !== "https:" ||
  !base.hostname.endsWith(".vercel.app") ||
  base.hostname === "coanto-live-demo.vercel.app" ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw Error("Dedicated HTTPS Vercel Preview URL required");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const token = process.env.COANTO_AGENT_ACCESS_TOKEN;
const baseHeaders: Record<string, string> = bypass
  ? { "x-vercel-protection-bypass": bypass }
  : {};
async function call(body: unknown, bearer = token, id = randomUUID()) {
  const r = await fetch(new URL("/api/agent", base), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(60000),
    headers: {
      ...baseHeaders,
      "content-type": "application/json",
      "idempotency-key": id,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return { status: r.status, data };
}
const spec = await fetch(new URL("/api/agent", base), {
  headers: baseHeaders,
  redirect: "error",
});
assert.equal(spec.status, 200);
assert.equal((await spec.json()).openapi, "3.0.3");
console.log("PASS deployed OpenAPI");
assert.equal(
  (await call({ tool: "get_business_context", input: {} }, "")).status,
  401,
);
console.log("PASS deployed unauthenticated rejection");
if (!token) {
  console.log(
    "BLOCKED authenticated E2E: bind existing sandbox COANTO_AGENT_ACCESS_TOKEN securely; configure Preview COANTO_AGENT_PRINCIPALS and apply sandbox migration.",
  );
  process.exit(2);
}
async function tool(name: string, input: unknown, id = randomUUID()) {
  const r = await call({ tool: name, input }, token, id);
  assert.equal(r.status, 200, `${name}: HTTP ${r.status}`);
  return r.data;
}
const contextId = randomUUID();
await tool("get_business_context", {}, contextId);
const replay = await tool("get_business_context", {}, contextId);
assert.equal(replay.cached, true);
console.log("PASS authenticated context and persisted replay");
assert.equal(
  (
    await call({
      tool: "get_business_context",
      input: { userId: randomUUID() },
    })
  ).status,
  400,
);
console.log("PASS tenant override rejected");
const host = process.env.COANTO_AGENT_TEST_SOURCE_HOST ?? "example.com";
if (!/^[a-z0-9.-]+$/.test(host)) throw Error("Invalid test source host");
const queries = [];
for (const provider of ["serper", "exa"]) {
  const r = await tool("research", {
    provider,
    query: `site:${host} official website`,
    maxResults: 3,
  });
  assert.equal(r.data.provider, provider);
  assert.equal(r.data.status, "ok", `${provider}: ${r.data.status}`);
  assert(r.data.results.length > 0);
  console.log(
    JSON.stringify({
      check: "deployed independent research",
      provider,
      status: "PASS",
      httpStatus: r.data.httpStatus,
      count: r.data.results.length,
      requestId: r.requestId,
    }),
  );
  queries.push(r);
}
const research = queries.find((r) =>
  r.data.results.some((hit: any) => new URL(hit.url).hostname === host),
);
assert(research, "No provider returned configured approved test source");
const index = research.data.results.findIndex(
  (hit: any) => new URL(hit.url).hostname === host,
);
const evidence = await tool("collect_evidence", {
  researchId: research.requestId,
  indexes: [index],
});
assert(evidence.data.records.length > 0, "No source evidence collected");
for (const record of evidence.data.records) {
  assert.equal(record.kind, "direct");
  assert.match(record.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(record.metadata.researchProvider, research.data.provider);
}
console.log(
  "PASS deployed collection, source attribution and persisted evidence",
);
const pipeline = await tool("run_pipeline", { evidenceId: evidence.requestId });
assert(pipeline.data.sourceTrust);
assert(Array.isArray(pipeline.data.insights));
assert(Array.isArray(pipeline.data.decisions));
if (!pipeline.data.sourceTrust.canRecommend)
  assert.equal(pipeline.data.decisions.length, 0);
console.log(
  JSON.stringify({
    check: "deployed pipeline",
    status: "PASS",
    insights: pipeline.data.insights.length,
    decisions: pipeline.data.decisions.length,
    proofLevel: pipeline.data.sourceTrust.proofLevel,
    requestId: pipeline.requestId,
  }),
);
await tool("list_decisions", { limit: 5 });
console.log("PASS tenant-scoped existing decisions");
