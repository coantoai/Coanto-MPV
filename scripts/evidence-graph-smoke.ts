import { createEvidence } from '../src/lib/evidence-engine.server';
import { createClaim } from '../src/lib/claim-engine.server';
import { buildEvidenceGraph } from '../src/lib/evidence-graph.server';

const supporting = createEvidence({
  kind: 'direct',
  sourceUrl: 'https://example.com/',
  sourceGroup: 'example',
  content: 'The product is available for sale.',
  supportsClaim: 'Product is available for sale.',
});
const contradicting = createEvidence({
  kind: 'search',
  sourceUrl: 'https://example.org/',
  sourceGroup: 'example-org',
  content: 'The product is unavailable.',
  contradictsClaim: 'Product is available for sale.',
});
const claim = createClaim({
  text: 'Product is available for sale.',
  type: 'observed',
  evidence: [supporting, contradicting],
});
const graph = buildEvidenceGraph([claim], [supporting, contradicting]);

if (graph.nodes.length !== 3) throw new Error(`Expected 3 graph nodes, got ${graph.nodes.length}`);
if (graph.edges.length !== 2) throw new Error(`Expected 2 graph edges, got ${graph.edges.length}`);
if (graph.contradictions.length !== 1 || graph.contradictions[0] !== claim.id) throw new Error('Contradiction detection failed.');
if (claim.status !== 'UNRESOLVED') throw new Error(`Expected unresolved claim, got ${claim.status}`);

console.log('EVIDENCE_GRAPH_SMOKE_OK');
