import { discoverCompetitors, buildPrompt, getMainSnapshot, hostname } from "../src/lib/analyze.server.ts";
import { runResearchAnalysis } from "../src/lib/ai-engine.server.ts";

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
    if (!competitors.length) throw new Error("Live discovery returned zero competitors");

    if (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) {
      const ai = await runResearchAnalysis(buildPrompt(main, competitors));
      console.log(`AI provider=${ai.provider} model=${ai.model} webSources=${ai.sources.length} outputChars=${ai.text.length}`);
      if (!ai.text || ai.text.length < 100) throw new Error("AI returned insufficient analysis output");
    } else {
      console.log("AI live call skipped: no independent AI provider secret configured.");
    }
  } catch (error) {
    console.error(`FAIL ${target}:`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
