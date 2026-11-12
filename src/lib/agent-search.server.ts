import { z } from "zod";
import { validateTargetUrl } from "./analyze.server";
export type SearchProvider = "serper" | "exa";
export type ProviderHit = {
  url: string;
  title: string;
  snippet: string;
  provider: SearchProvider;
  sourceType: "search-index";
};
export type ProviderResearch = {
  provider: SearchProvider;
  status:
    | "ok"
    | "empty"
    | "missing-key"
    | "http-error"
    | "network-error"
    | "invalid-response";
  httpStatus?: number;
  results: ProviderHit[];
  checkedAt: string;
};
const row = z.object({
  link: z.string().nullish(),
  url: z.string().nullish(),
  title: z.string().nullish(),
  snippet: z.string().nullish(),
  text: z.string().nullish(),
  description: z.string().nullish(),
});
export function safeAgentUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !validateTargetUrl(raw).ok
  )
    throw Error("Unsafe URL");
  u.hash = "";
  return u.toString();
}
export async function searchAgentProvider(
  provider: SearchProvider,
  query: string,
  maxResults = 5,
  allowPublicHttp = false,
): Promise<ProviderResearch> {
  const checkedAt = new Date().toISOString(),
    key =
      process.env[
        provider === "serper" ? "SERPER_API_KEY" : "EXA_API_KEY"
      ]?.trim();
  const result = (
    status: ProviderResearch["status"],
    results: ProviderHit[] = [],
    httpStatus?: number,
  ): ProviderResearch => ({
    provider,
    status,
    results,
    checkedAt,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
  if (!key) return result("missing-key");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      provider === "serper"
        ? "https://google.serper.dev/search"
        : "https://api.exa.ai/search",
      {
        method: "POST",
        signal: controller.signal,
        redirect: "error",
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
          [provider === "serper" ? "X-API-KEY" : "x-api-key"]: key,
        },
        body: JSON.stringify(
          provider === "serper"
            ? { q: query, num: maxResults }
            : {
                query,
                type: "auto",
                numResults: maxResults,
                contents: { text: { maxCharacters: 350 } },
              },
        ),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return result("http-error", [], response.status);
    }
    const reader = response.body?.getReader();
    if (!reader) return result("invalid-response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        return result("invalid-response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    let data: {
      organic?: z.infer<typeof row>[] | undefined;
      results?: z.infer<typeof row>[] | undefined;
    };
    try {
      data = z
        .object({
          organic: z.array(row).max(100).optional(),
          results: z.array(row).max(100).optional(),
        })
        .parse(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return result("invalid-response");
    }
    const hits: ProviderHit[] = [];
    const seen = new Set<string>();
    for (const item of (provider === "serper" ? data.organic : data.results) ??
      []) {
      try {
        const raw = item.link ?? item.url ?? "";
        const legacy = new URL(raw);
        const url =
          allowPublicHttp &&
          legacy.protocol === "http:" &&
          !legacy.username &&
          !legacy.password &&
          validateTargetUrl(raw).ok
            ? legacy.href
            : safeAgentUrl(raw);
        if (seen.has(url)) continue;
        seen.add(url);
        hits.push({
          url,
          title: (item.title ?? "").slice(0, 500),
          snippet: (item.snippet ?? item.text ?? "").slice(0, 1500),
          provider,
          sourceType: "search-index",
        });
      } catch {
        /* reject unsafe sources */
      }
      if (hits.length >= maxResults) break;
    }
    return result(hits.length ? "ok" : "empty", hits, response.status);
  } catch {
    return result("network-error");
  } finally {
    clearTimeout(timer);
  }
}
