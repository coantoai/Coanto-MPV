import { validateAiOutput } from './ai-output.server';
import { collectCitedSources } from './evidence-collector.server';
import { createClaim, linkEvidenceToClaim, type ClaimRecord } from './claim-engine.server';
import { buildEvidenceGraph, type EvidenceGraph } from './evidence-graph.server';
import { assessClaimTrust, type ClaimTrustResult } from './claim-trust.server';
import type { AiRun } from './ai-engine.server';
import type { EvidenceRecord } from './evidence-engine.server';

export type ResearchProof = {
  ai: AiRun;
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  graph: EvidenceGraph;
  trust: ClaimTrustResult[];
  rejectedSources: Array<{ url: string; reason: string }>;
};

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function textFromAi(ai: AiRun) {
  const start = ai.text.indexOf('{');
  const end = ai.text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI returned no JSON object.');
  return validateAiOutput(JSON.parse(ai.text.slice(start, end + 1))) as JsonRecord;
}
function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.toString();
  } catch {
    return '';
  }
}
function competitorClaims(ai: AiRun) {
  const output = textFromAi(ai);
  const claims: ClaimRecord[] = [];
  for (const item of array(output['competitors'])) {
    const competitor = record(item);
    const name = typeof competitor['name'] === 'string' ? competitor['name'].trim() : '';
    const url = typeof competitor['url'] === 'string' ? competitor['url'].trim() : '';
    if (!name || !url) continue;
    claims.push(createClaim({ text: `${name} is listed at ${url}.`, type: 'observed' }));
  }
  return claims;
}
function evidenceForClaim(claim: ClaimRecord, evidence: EvidenceRecord[]) {
  const match = / is listed at (https?:\/\/[^.\s]+(?:\.[^\s]+)+\.?\S*)\.$/.exec(claim.text);
  if (!match) return evidence;
  const target = canonicalUrl(match[1]);
  return evidence.filter((item) => canonicalUrl(item.sourceUrl) === target);
}

/**
 * Converts an AI research run into auditable proof without treating the AI text as evidence.
 * Only independently collected source observations can support the generated claims.
 */
export async function buildResearchProof(ai: AiRun, options: { sourceGroup?: string; observedAt?: string; now?: Date } = {}): Promise<ResearchProof> {
  const claims = competitorClaims(ai);
  const collected = await collectCitedSources(ai.sources, options);
  const linkedClaims = claims.map((claim) => linkEvidenceToClaim(claim, evidenceForClaim(claim, collected.records)));
  const graph = buildEvidenceGraph(linkedClaims, collected.records);
  const trust = linkedClaims.map((claim) => assessClaimTrust(claim, collected.records, options.now));
  return { ai, evidence: collected.records, claims: linkedClaims, graph, trust, rejectedSources: collected.rejected };
}
