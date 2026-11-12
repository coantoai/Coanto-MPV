import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
export const pinnedAgentLookup =
  (address: string): LookupFunction =>
  (_host, options, callback) =>
    options.all
      ? callback(null, [{ address, family: 4 }])
      : callback(null, address, 4);
import { extract, type SiteSnapshot } from "./analyze.server";
import { safeAgentUrl } from "./agent-search.server";

export function isPublicAgentIpv4(address: string) {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  const [a, b, c] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a! >= 224 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function requireAgentHost(raw: string, allowedHosts: string[]) {
  const url = new URL(safeAgentUrl(raw));
  if (!allowedHosts.includes(url.hostname))
    throw Error("Source host not approved");
  return url;
}
// Pin a validated public IPv4 address to the HTTPS connection. Preserve TLS hostname verification.
// No provider keys, bearer tokens or bypass headers are ever sent to collected sources.
export async function acquireAgentSnapshot(
  raw: string,
  allowedHosts: string[],
): Promise<SiteSnapshot & { acquisitionProvider: "direct" }> {
  let url = requireAgentHost(raw, allowedHosts);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await lookup(url.hostname, { all: true, family: 4 });
    if (
      !addresses.length ||
      addresses.some((a) => !isPublicAgentIpv4(a.address))
    )
      throw Error("Nonpublic source resolution");
    const address = addresses[0]!.address;
    const result = await new Promise<{
      status: number;
      type: string;
      location: string | undefined;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "Accept-Encoding": "identity",
            "User-Agent": "COANTO-Agent-Evidence/1.0",
          },
          lookup: pinnedAgentLookup(address),
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            resolve({
              status,
              type: "",
              location: res.headers.location,
              body: "",
            });
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          res.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length > 1_000_000) {
              req.destroy(Error("Source too large"));
              return;
            }
            chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              status,
              type: String(res.headers["content-type"] ?? ""),
              location: undefined,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      const timeout = setTimeout(
        () => req.destroy(Error("Source timeout")),
        12_000,
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", reject);
      req.end();
    });
    if (result.status >= 300 && result.status < 400) {
      if (!result.location || redirects === 3)
        throw Error("Invalid source redirect");
      url = requireAgentHost(new URL(result.location, url).href, allowedHosts);
      continue;
    }
    if (
      result.status < 200 ||
      result.status >= 300 ||
      !/(?:text\/html|application\/xhtml\+xml)/i.test(result.type)
    )
      throw Error("Source acquisition failed");
    return { ...extract(result.body, url.href), acquisitionProvider: "direct" };
  }
  throw Error("Source redirect limit");
}
