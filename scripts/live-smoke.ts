import { buildPrompt, discoverCompetitors, getMainSnapshot, hostname } from "../src/lib/analyze.server.ts";
import { filterCommercialCompetitors } from "../src/lib/competitor-filter.server.ts";

const targets = ["https://www.allbirds.com/", "https://www.nike.com/", "https://www.shopify.com/"];

let failures = 0;
for (const target of targets) {
  console.log(`\n=== ${target} ===`);
  try {
    const main = await getMainSnapshot(target);
    const mainHost = hostname(main.url);
    if (!mainHost) throw new Error("Main snapshot has no valid hostname");
    if (!main.evidence.length) throw new Error("Main snapshot has no evidence");
    console.log(`MAIN source=${main.sourceType} host=${mainHost} title=${main.title.slice(0, 120)} evidence=${main.evidence.length}`);

    const discovered = await discoverCompetitors(main);
    console.log(`DISCOVERED_RAW=${discovered.map((site) => hostname(site.url)).join(",")}`);
    const competitors = filterCommercialCompetitors(main, discovered);
    console.log(`DISCOVERED=${discovered.length} COMMERCIAL=${competitors.length}`);

    for (const competitor of competitors.slice(0, 10)) {
      const host = hostname(competitor.url);
      if (!host || host === mainHost || host.endsWith(`.${mainHost}`)) throw new Error(`Invalid competitor host: ${host}`);
      if (!competitor.evidence.length) throw new Error(`Competitor ${host} has no evidence`);
      if (competitor.sourceType !== "direct-site" && competitor.sourceType !== "search-index") throw new Error(`Unsupported evidence source for ${host}`);
      console.log(`- ${host} [${competitor.sourceType}] ${competitor.title.slice(0, 100)} evidence=${competitor.evidence.length}`);
    }

    if (!competitors.length) throw new Error("Live discovery returned zero commercial competitors");
    const prompt = buildPrompt(main, competitors);
    if (!/(evidence|الأدلة)/i.test(prompt)) throw new Error("Analysis prompt does not contain evidence context");
    if (!prompt.includes(main.url)) throw new Error("Analysis prompt does not contain the main source URL");
    for (const competitor of competitors.slice(0, 10)) {
      if (!prompt.includes(competitor.url)) throw new Error(`Analysis prompt does not contain competitor URL: ${hostname(competitor.url)}`);
    }
    console.log(`PROMPT evidence-bound=yes chars=${prompt.length}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${target}:`, error instanceof Error ? error.message : error);
  }
}
if (failures > 0) process.exitCode = 1;
