import { createEvidence } from '../src/lib/evidence-engine.server';
import { buildEvidenceGraph } from '../src/lib/evidence-graph.server';
import { assessClaimTrust } from '../src/lib/claim-trust.server';
import { createClaim, linkEvidenceToClaim } from '../src/lib/claim-engine.server';

const evidence = createEvidence({
  kind: 'direct',
  sourceUrl: 'https://example.com/',
  sourceGroup: 'example.com',
  content: 'Example competitor page.',
});
const claim = createClaim({ text: 'Example is listed at https://example.com/.', type: 'observed' });
const linked = linkEvidenceToClaim(claim, [{ ...evidence, supportsClaim: claim.id }]);
const graph = buildEvidenceGraph([linked], [evidence]);
const trust = assessClaimTrust(linked, [evidence], new Date('2026-09-09T09:00:00Z'));

if (linked.status !== 'SUPPORTED') throw new Error(`Expected supported claim, got ${linked.status}`);
if (graph.nodes.length !== 2) throw new Error(`Expected 2 graph nodes, got ${graph.nodes.length}`);
if (graph.edges.length !== 1) throw new Error(`Expected 1 graph edge, got ${graph.edges.length}`);
if (trust.claim.id !== claim.id) throw new Error('Trust result claim identity mismatch.');
if (trust.assessment.evidenceCount !== 1) throw new Error('Trust result evidence count mismatch.');

console.log('RESEARCH_PROOF_SMOKE_OK');
