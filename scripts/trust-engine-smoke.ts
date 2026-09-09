import { assessTrust, shouldRefuseToGuess } from '../src/lib/trust-engine.server';

const now = new Date('2026-09-09T00:00:00Z');

const proven = assessTrust([
  { id: 'a', sourceUrl: 'https://shop.example.com/p/1', sourceGroup: 'shop.example.com', kind: 'direct', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true, directness: 1, reliability: 0.95 },
  { id: 'b', sourceUrl: 'https://catalog.example.org/p/1', sourceGroup: 'catalog.example.org', kind: 'direct', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true, directness: 1, reliability: 0.9 },
  { id: 'c', sourceUrl: 'https://calc.example.net/check', sourceGroup: 'calc.example.net', kind: 'calculation', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true, directness: 1, reliability: 0.95 },
], { now });
if (proven.proofLevel !== 'PROVEN' || !proven.canRecommend) throw new Error(`Expected PROVEN, got ${proven.proofLevel}/${proven.score}`);

const copied = assessTrust([
  { id: 'a', sourceUrl: 'https://one.example/a', sourceGroup: 'same-publisher', kind: 'search', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true },
  { id: 'b', sourceUrl: 'https://two.example/b', sourceGroup: 'same-publisher', kind: 'search', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true },
  { id: 'c', sourceUrl: 'https://three.example/c', sourceGroup: 'same-publisher', kind: 'search', observedAt: '2026-09-08T00:00:00Z', supportsClaim: true },
], { now });
if (copied.independentSources !== 1) throw new Error(`Expected one independent group, got ${copied.independentSources}`);

const conflict = assessTrust([
  { id: 'a', sourceUrl: 'https://a.example', kind: 'direct', supportsClaim: true, directness: 1, reliability: 0.9, observedAt: '2026-09-08T00:00:00Z' },
  { id: 'b', sourceUrl: 'https://b.example', kind: 'direct', supportsClaim: true, directness: 1, reliability: 0.9, observedAt: '2026-09-08T00:00:00Z' },
  { id: 'c', sourceUrl: 'https://c.example', kind: 'direct', supportsClaim: false, contradictsClaim: true, directness: 1, reliability: 0.9, observedAt: '2026-09-08T00:00:00Z' },
], { now });
if (conflict.proofLevel !== 'UNCERTAIN' || !shouldRefuseToGuess(conflict)) throw new Error('Conflict must force uncertainty/refusal.');

console.log('COANTO Trust Engine smoke: PASS');
