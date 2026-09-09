import { discoverCompetitors, fetchSite } from '../src/lib/analyze.server';
import { runAiProvider, type AiProvider } from '../src/lib/ai-engine.server';
import { validateAiOutput } from '../src/lib/ai-output.server';
import { enforceEvidence } from '../src/lib/trust.server';

const providers: AiProvider[] = ['openai', 'gemini', 'openrouter', 'anthropic'];
const keys: Record<AiProvider, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const target = process.env.COANTO_E2E_URL?.trim() || 'https://www.allbirds.com/';

function compact(value: unknown, max: number) {
  return JSON.stringify(value).slice(0, max);
}

function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  for (let start = cleaned.indexOf('{'); start >= 0; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = cleaned.slice(start, i + 1);
          try { return JSON.parse(candidate); } catch { break; }
        }
      }
    }
  }
  throw new Error('provider returned no valid JSON object');
}

async function main() {
  const main = await fetchSite(target);
  const discovered = await discoverCompetitors(main);
  if (!discovered.length) throw new Error('E2E discovery returned no competitors.');

  const evidence = [
    `Target: ${main.url}`,
    `Title: ${main.title}`,
    `Description: ${main.description}`,
    `Observed evidence: ${main.evidence.join(' | ')}`,
    `Discovered competitors: ${compact(discovered.slice(0, 8), 9000)}`,
  ].join('\n');

  const prompt = [
    'You are COANTO running a real end-to-end competitive intelligence test.',
    'Use ONLY the supplied evidence plus your web research. Return JSON only.',
    'Every material competitor claim must have evidence and sourceUrls when available.',
    'Do not invent revenue, market share, prices, percentages, dates, or financial impact.',
    'Distinguish facts, inference, recommendation, and unknowns.',
    'Return at least one valid competitor and include these fields: name, url, why, evidence, sourceUrls.',
    'Also return: signals, scenarios, trust, unknowns, summary, next_action, threat_level, opportunity_level.',
    '',
    evidence,
  ].join('\n');

  const configured = providers.filter((provider) => Boolean(process.env[keys[provider]]));
  if (!configured.length) throw new Error('No AI provider secret is configured for the live E2E test.');

  let successful = 0;
  const failures: string[] = [];

  for (const provider of configured) {
    const started = Date.now();
    try {
      const run = await runAiProvider(provider, prompt);
      const parsed = validateAiOutput(parseJsonObject(run.text));
      const trusted = enforceEvidence(parsed, main, discovered, run.sources);
      const competitors = Array.isArray(trusted['competitors']) ? trusted['competitors'] : [];
      if (!competitors.length) throw new Error('evidence gate removed every AI competitor');
      const evidenced = competitors.filter((item) => {
        const row = item as Record<string, unknown>;
        return Boolean(String(row['evidence'] ?? '').trim()) && Boolean(String(row['evidenceSourceType'] ?? '').trim());
      });
      if (!evidenced.length) throw new Error('no competitor survived evidence enforcement');
      const metadata = trusted['metadata'] as Record<string, unknown> | undefined;
      if (metadata?.['claimLinkageChecked'] !== true) throw new Error('claim linkage check did not run');
      successful += 1;
      console.log(`PASS ${provider} model=${run.model} competitors=${competitors.length} evidenced=${evidenced.length} latency=${Date.now() - started}ms sources=${run.sources.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider}: ${message}`);
      console.error(`FAIL ${provider} latency=${Date.now() - started}ms error=${message}`);
      continue;
    }
  }

  console.log(`AI LIVE E2E RESULT: ${successful}/${configured.length} configured provider(s) passed.`);
  if (failures.length) console.log(`Provider failures: ${failures.join(' | ')}`);
  if (!successful) throw new Error(`No configured AI provider passed the live E2E test. ${failures.join(' | ')}`.slice(0, 1800));
  console.log('AI LIVE E2E PASS: at least one configured real AI provider completed evidence enforcement and contract validation.');
}

await main();
