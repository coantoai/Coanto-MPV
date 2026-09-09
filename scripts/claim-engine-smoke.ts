import { createClaim, dedupeClaims, linkEvidenceToClaim } from '../src/lib/claim-engine.server';
import { createEvidence } from '../src/lib/evidence-engine.server';

const evidence = createEvidence({
  kind: 'direct',
  sourceUrl: 'https://example.com/pricing',
  content: 'The monthly plan costs $29.',
  supportsClaim: 'claim-target',
  observedAt: '2026-09-09T09:00:00Z',
  retrievedAt: '2026-09-09T09:00:01Z',
});

const claim = createClaim({ text: 'The monthly plan costs $29.', type: 'observed' });
if (claim.status !== 'UNSUPPORTED') throw new Error(`Expected new claim to be unsupported, got ${claim.status}`);

const linked = linkEvidenceToClaim(claim, [evidence]);
if (linked.status !== 'SUPPORTED') throw new Error(`Expected linked claim to be supported, got ${linked.status}`);
if (linked.supportingEvidenceIds.length !== 1) throw new Error('Expected one supporting evidence link.');

const duplicate = createClaim({ text: '  The monthly plan costs $29.  ', type: 'observed' });
if (duplicate.id !== claim.id) throw new Error('Claim identity must be deterministic.');
if (dedupeClaims([claim, duplicate]).length !== 1) throw new Error('Claim dedupe failed.');

console.log('claim engine smoke: ok');
