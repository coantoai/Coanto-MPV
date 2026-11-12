import { afterEach, expect, test } from "bun:test";
import { searchAgentProvider } from "../src/lib/agent-search.server";
import {
  createAgentServices,
  type AgentServiceDependencies,
} from "../src/lib/agent-services.server";
const original = globalThis.fetch;
const serper = process.env.SERPER_API_KEY,
  exa = process.env.EXA_API_KEY;
afterEach(() => {
  globalThis.fetch = original;
  if (serper === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = serper;
  if (exa === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = exa;
});
test("independent search preserves provider and never falls back on rejection", async () => {
  process.env.SERPER_API_KEY = "test";
  process.env.EXA_API_KEY = "test";
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(null, { status: 401 });
  }) as typeof fetch;
  const r = await searchAgentProvider("serper", "footwear competitors", 5);
  expect(r.provider).toBe("serper");
  expect(r.status).toBe("http-error");
  expect(r.httpStatus).toBe(401);
  expect(r.results).toEqual([]);
  expect(calls).toEqual(["https://google.serper.dev/search"]);
});
test("maps Exa real response contract and rejects unsafe result URLs", async () => {
  process.env.EXA_API_KEY = "test";
  globalThis.fetch = (async () =>
    Response.json({
      results: [
        {
          url: "https://example.com",
          title: "Example",
          text: "Independent source",
        },
        { url: "http://127.0.0.1", title: "private" },
      ],
    })) as typeof fetch;
  const r = await searchAgentProvider("exa", "footwear competitors", 5);
  expect(r.status).toBe("ok");
  expect(r.results.length).toBe(1);
  expect(r.results[0]?.provider).toBe("exa");
  expect(r.results[0]?.sourceType).toBe("search-index");
});
const principal = {
  userId: "tenant-a",
  scopes: [],
  allowedHosts: ["example.com"],
};
function fixture() {
  const reads: unknown[] = [];
  const deps: AgentServiceDependencies = {
    context: async () => ({ businessName: "Acme" }),
    research: async () => ({
      provider: "serper",
      status: "ok",
      results: [],
      checkedAt: new Date().toISOString(),
    }),
    readArtifact: async (user, id) => {
      reads.push([user, id]);
      throw Error("not found");
    },
    collect: async () => ({ records: [], rejected: [] }),
    monitoring: async () => [],
    listDecisions: async () => [],
  };
  return { deps, reads, run: createAgentServices(deps) };
}
test("all artifact lookups use authenticated tenant; no user evidence accepted", async () => {
  const { run, reads } = fixture();
  await expect(
    run(
      "collect_evidence",
      { researchId: "other-tenant", indexes: [0] },
      principal,
    ),
  ).rejects.toThrow();
  expect(reads).toEqual([["tenant-a", "other-tenant"]]);
});
test("denies unapproved evidence destinations before collection", async () => {
  const { deps } = fixture();
  let collected = false;
  deps.collect = async () => {
    collected = true;
    return { records: [], rejected: [] };
  };
  deps.readArtifact = async () => ({
    tool: "research",
    result_json: {
      provider: "exa",
      status: "ok",
      results: [
        {
          url: "https://evil.example/",
          provider: "exa",
          title: "Bad",
          snippet: "",
          sourceType: "search-index",
        },
      ],
    },
    created_at: new Date().toISOString(),
  });
  await expect(
    createAgentServices(deps)(
      "collect_evidence",
      { researchId: "r", indexes: [0] },
      principal,
    ),
  ).rejects.toThrow();
  expect(collected).toBe(false);
});
test("research observations cannot be passed off as verified pipeline evidence", async () => {
  const { deps } = fixture();
  deps.readArtifact = async () => ({
    tool: "research",
    result_json: {},
    created_at: new Date().toISOString(),
  });
  await expect(
    createAgentServices(deps)("run_pipeline", { evidenceId: "r" }, principal),
  ).rejects.toThrow();
});
test("no monitoring changes produces no fabricated intelligence or decisions", async () => {
  const { deps } = fixture();
  deps.readArtifact = async () => ({
    tool: "collect_evidence",
    result_json: {
      records: [],
      trust: { canRecommend: true, proofLevel: "PROVEN" },
    },
    created_at: new Date().toISOString(),
  });
  const r = (await createAgentServices(deps)(
    "run_pipeline",
    { evidenceId: "r" },
    principal,
  )) as { decisions: unknown[]; insights: unknown[] };
  expect(r.decisions).toEqual([]);
  expect(r.insights).toEqual([]);
});
test("artifact reads require the original tool scope and prohibit recursive replay wrappers", async () => {
  const { deps } = fixture();
  deps.readArtifact = async () => ({
    tool: "list_decisions",
    result_json: [{ action: "private" }],
    created_at: new Date().toISOString(),
  });
  await expect(
    createAgentServices(deps)(
      "get_artifact",
      { requestId: "r" },
      { ...principal, scopes: ["artifacts:read"] },
    ),
  ).rejects.toThrow();
  deps.readArtifact = async () => ({
    tool: "get_artifact",
    result_json: { tool: "list_decisions" },
    created_at: new Date().toISOString(),
  });
  await expect(
    createAgentServices(deps)(
      "get_artifact",
      { requestId: "r" },
      { ...principal, scopes: ["artifacts:read"] },
    ),
  ).rejects.toThrow();
});

test("agent source policy rejects private, reserved and unapproved destinations", async () => {
  const { isPublicAgentIpv4, requireAgentHost } =
    await import("../src/lib/agent-acquisition.server");
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
  ])
    expect(isPublicAgentIpv4(ip)).toBe(false);
  expect(isPublicAgentIpv4("93.184.216.34")).toBe(true);
  for (const url of [
    "https://example.com@evil.example/",
    "http://example.com",
    "https://example.com:444/",
    "https://127.0.0.1/",
  ])
    expect(() => requireAgentHost(url, ["example.com"])).toThrow();
});
test("legacy search retains public HTTP results while Agent search rejects them", async () => {
  process.env.SERPER_API_KEY = "test";
  globalThis.fetch = (async () =>
    Response.json({
      organic: [
        {
          link: "http://example.com/",
          title: "Public legacy source",
          snippet: "Footwear information",
        },
      ],
    })) as typeof fetch;
  const { searchEvidenceForUrl } = await import("../src/lib/analyze.server");
  expect((await searchEvidenceForUrl("http://example.com/"))?.description).toBe(
    "Footwear information",
  );
  expect(
    (await searchAgentProvider("serper", "example footwear", 5)).results,
  ).toEqual([]);
});
test("pinned HTTPS lookup honors Node all-address and single-address contracts", async () => {
  const { pinnedAgentLookup } =
    await import("../src/lib/agent-acquisition.server");
  const lookup = pinnedAgentLookup("93.184.216.34");
  lookup("example.com", { all: true }, (error, address) => {
    expect(error).toBeNull();
    expect(address).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
  lookup("example.com", { family: 4 }, (error, address, family) => {
    expect(error).toBeNull();
    expect(address).toBe("93.184.216.34");
    expect(family).toBe(4);
  });
});
