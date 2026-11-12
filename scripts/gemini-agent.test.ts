import { expect, test } from "bun:test";
import { runGeminiAgent } from "../src/lib/gemini-agent.server";
test("Gemini calls only validated independent provider tools and receives attributed responses", async () => {
  let turns = 0;
  const calls: unknown[] = [];
  const result = await runGeminiAgent("Research footwear", {
    generate: async () =>
      ++turns === 1
        ? {
            parts: [
              {
                functionCall: {
                  name: "research",
                  args: { provider: "serper", query: "footwear" },
                },
              },
              {
                functionCall: {
                  name: "research",
                  args: { provider: "exa", query: "footwear" },
                },
              },
            ],
          }
        : {
            parts: [{ text: "Two independently attributed provider results." }],
          },
    invoke: async (tool, input) => {
      calls.push([tool, input.provider]);
      return { provider: input.provider, status: "ok", results: [] };
    },
  });
  expect(calls).toEqual([
    ["research", "serper"],
    ["research", "exa"],
  ]);
  expect(result.status).toBe("completed");
  expect(result.toolCalls).toBe(2);
});
test("rejects a turn with forbidden SQL or tenant fields before any tool execution", async () => {
  for (const call of [
    { name: "sql", args: { query: "select 1" } },
    { name: "get_business_context", args: { userId: "other" } },
  ]) {
    let invoked = false;
    await expect(
      runGeminiAgent("context", {
        generate: async () => ({ parts: [{ functionCall: call }] }),
        invoke: async () => {
          invoked = true;
          return {};
        },
      }),
    ).rejects.toThrow();
    expect(invoked).toBe(false);
  }
});
test("stops an agent loop at three model turns", async () => {
  let calls = 0;
  const r = await runGeminiAgent("context", {
    generate: async () => ({
      parts: [{ functionCall: { name: "get_business_context", args: {} } }],
    }),
    invoke: async () => {
      calls++;
      return {};
    },
  });
  expect(calls).toBe(3);
  expect(r.status).toBe("turn-limit");
});
