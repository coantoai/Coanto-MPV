import { discoverCompetitors, getMainSnapshot, hostname } from "../src/lib/analyze.server.ts";
import { filterCommercialCompetitors } from "../src/lib/competitor-filter.server.ts";

const targets = ["https://www.allbirds.com/", "https://www.adidas.com/qa/en", "https://www.noon.com/uae-en/"];

let failures = 0;
for (const target of targets) {
  console.log(`\n=== ${target} ===`);
  try {
    const main = await getMainSnapshot(target);
    console.log(`MAIN source=${main.sourceType} host=${hostname(main.url)} title=${main.title.slice(0, 120)}`);
    const discovered = await discoverCompetitors(main);
    const competitors = filterCommercialCompetitors(main, discovered);
    console.log(`DISCOVERED=${discovered.length} COMMERCIAL=${competitors.length}`);
    for (const competitor of competitors.slice(0, 10)) {
      console.log(`- ${hostname(competitor.url)} [${competitor.sourceType}] ${competitor.title.slice(0, 100)}`);
    }
    if (!competitors.length) throw new Error("Live discovery returned zero commercial competitors");
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${target}:`, error instanceof Error ? error.message : error);
  }
}
if (failures > 0) process.exitCode = 1;
