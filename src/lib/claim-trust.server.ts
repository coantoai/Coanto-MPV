import type { ClaimRecord } from './claim-engine.server';
import { buildEvidenceGraph } from './evidence-graph.server';
import { assessTrust, type TrustAssessment } from './trust-engine.server';
import { evidenceToTrustItem, type EvidenceRecord } from './evidence-engine.server';

export type ClaimTrustResult = {
  claim: ClaimRecord;
  assessment: TrustAssessment;
  graph: ReturnType<typeof buildEvidenceGraph>;
};

/** Evaluates only evidence linked to a claim; graph construction remains deterministic and auditable. */
export function assessClaimTrust(claim: ClaimRecord, evidence: EvidenceRecord[], now = new Date()): ClaimTrustResult {
  const linkedIds = new Set([...claim.supportingEvidenceIds, ...claim.contradictingEvidenceIds]);
  const linkedEvidence = evidence.filter((item) => linkedIds.has(item.id));
  const graph = buildEvidenceGraph([claim], linkedEvidence);
  const assessment = assessTrust(linkedEvidence.map(evidenceToTrustItem), { now });
  return { claim, assessment, graph };
}
