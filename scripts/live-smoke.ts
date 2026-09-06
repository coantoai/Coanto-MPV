import { discoverCompetitors, getMainSnapshot, hostname } from "../src/lib/analyze.server.ts";

const targets = [
  "https://www.allbirds.com/",
  "https://www.adidas.com/qa/en",
  "https://www.noon.com/uae-en/",
];

for (const target of targets) {
  console.log(`\n=== ${target} ===`);
  try {
    const main = await getMainSnapshot(target);
    console.log(`MAIN source=${main.sourceType} host=${hostname(main.url)} title=${main.title.slice(0, 120)}`);
    const competitors = await discoverCompetitors(main);
    console.log(`COMPETITORS=${competitors.length}`);
    for (const competitor of competitors.slice(0, 10)) {
      console.log(`- ${hostname(competitor.url)} [${competitor.sourceType}] ${competitor.title.slice(0, 100)}`);
    }
    if (!competitors.length) {
      throw new Error("Live discovery returned zero competitors");
    }
  } catch (error) {
    console.error(`FAIL ${target}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.env.LOVABLE_API_KEY) {
  console.log("\nAI secret detected: AI gateway is configured for live runtime testing.");
} else {
  console.log("\nAI live call not executed: LOVABLE_API_KEY is not configured in this environment.");
}
