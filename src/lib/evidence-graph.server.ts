import type { ClaimRecord } from './claim-engine.server';
import type { EvidenceRecord } from './evidence-engine.server';

export type GraphNode =
  | { id: string; type: 'claim'; claim: ClaimRecord }
  | { id: string; type: 'evidence'; evidence: EvidenceRecord };

export type GraphEdgeType = 'SUPPORTS' | 'CONTRADICTS' | 'EVIDENCE_FOR' | 'EVIDENCE_AGAINST';

export type GraphEdge = {
  from: string;
  to: string;
  type: GraphEdgeType;
};

export type EvidenceGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  contradictions: string[];
};

export function buildEvidenceGraph(claims: ClaimRecord[], evidence: EvidenceRecord[]): EvidenceGraph {
  const nodes: GraphNode[] = [
    ...claims.map((claim) => ({ id: claim.id, type: 'claim' as const, claim })),
    ...evidence.map((item) => ({ id: item.id, type: 'evidence' as const, evidence: item })),
  ];
  const edges: GraphEdge[] = [];
  const claimIds = new Set(claims.map((claim) => claim.id));
  const evidenceIds = new Set(evidence.map((item) => item.id));

  for (const claim of claims) {
    for (const evidenceId of claim.supportingEvidenceIds) {
      if (evidenceIds.has(evidenceId)) edges.push({ from: evidenceId, to: claim.id, type: 'SUPPORTS' });
    }
    for (const evidenceId of claim.contradictingEvidenceIds) {
      if (evidenceIds.has(evidenceId)) edges.push({ from: evidenceId, to: claim.id, type: 'CONTRADICTS' });
    }
  }

  for (const item of evidence) {
    if (item.supportsClaim && claimIds.has(item.supportsClaim)) {
      edges.push({ from: item.id, to: item.supportsClaim, type: 'EVIDENCE_FOR' });
    }
    if (item.contradictsClaim && claimIds.has(item.contradictsClaim)) {
      edges.push({ from: item.id, to: item.contradictsClaim, type: 'EVIDENCE_AGAINST' });
    }
  }

  const contradictions = claims
    .filter((claim) => claim.supportingEvidenceIds.length > 0 && claim.contradictingEvidenceIds.length > 0)
    .map((claim) => claim.id);

  return {
    nodes,
    edges: dedupeEdges(edges),
    contradictions: [...new Set(contradictions)],
  };
}

function dedupeEdges(edges: GraphEdge[]) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
