import { assessTrust, shouldRefuseToGuess, type TrustAssessment } from './trust-engine.server';
import type { EvidenceRecord } from './evidence-engine.server';
import type { ClaimRecord } from './claim-engine.server';
import { buildEvidenceGraph } from './evidence-graph.server';

export type DecisionTrustGate = {
  allowed: boolean;
  assessment: TrustAssessment;
  claimId: string;
  proofLevel: TrustAssessment['proofLevel'];
  reasons: string[];
};

/**
 * Converts a claim's graph-linked evidence into the single trust gate used
 * before COANTO can publish a recommendation.
 */
export function evaluateDecisionTrust(
  claim: ClaimRecord,
  evidence: EvidenceRecord[],
  options: { now?: Date; minimumRecommendationScore?: number } = {},
): DecisionTrustGate {
  const graph = buildEvidenceGraph([claim], evidence);
  const linkedIds = new Set(
    graph.edges
      .filter((edge) => edge.to === claim.id && (edge.type === 'SUPPORTS' || edge.type === 'CONTRADICTS'))
      .map((edge) => edge.from),
  );

  const linkedEvidence = evidence.filter((item) => linkedIds.has(item.id)).map((item) => ({
    id: item.id,
    sourceUrl: item.sourceUrl,
    sourceDomain: item.sourceDomain,
    sourceGroup: item.sourceGroup,
    kind: item.kind,
    observedAt: item.observedAt,
    supportsClaim: claim.supportingEvidenceIds.includes(item.id),
    contradictsClaim: claim.contradictingEvidenceIds.includes(item.id),
    directness: item.kind === 'direct' ? 1 : item.kind === 'calculation' ? 0.95 : item.kind === 'search' ? 0.65 : 0.5,
    reliability: item.status === 'VERIFIED' ? 0.9 : item.status === 'REJECTED' ? 0 : 0.6,
  }));

  const assessment = assessTrust(linkedEvidence, options);
  return {
    allowed: !shouldRefuseToGuess(assessment),
    assessment,
    claimId: claim.id,
    proofLevel: assessment.proofLevel,
    reasons: assessment.reasons,
  };
}
