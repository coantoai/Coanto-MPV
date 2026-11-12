import { expect, test } from 'bun:test';
import { assessTrust, shouldRefuseToGuess, type EvidenceItem } from '../src/lib/trust-engine.server';
const now = new Date('2026-09-09T00:00:00Z');
function assess(supports: number, contradictions: number) {
  const evidence: EvidenceItem[] = Array.from({ length: supports + contradictions }, (_, index) => ({
    id: String(index), sourceUrl: `https://source-${index}.example/`, kind: 'direct',
    observedAt: '2026-09-08T00:00:00Z', directness: 1, reliability: 0.95,
    supportsClaim: index < supports, contradictsClaim: index >= supports,
  }));
  return assessTrust(evidence, { now });
}
for (const [support, contradictions] of [[2, 1], [4, 2], [1, 1], [0, 1]]) {
  test(`${support} supporting and ${contradictions} contradicting sources force uncertainty and refusal`, () => {
    const result = assess(support, contradictions);
    expect(result.proofLevel).toBe('UNCERTAIN');
    expect(result.canRecommend).toBe(false);
    expect(shouldRefuseToGuess(result)).toBe(true);
  });
}
test('uncontested independent direct evidence remains proven', () => {
  const result = assess(3, 0);
  expect(result.proofLevel).toBe('PROVEN');
  expect(result.canRecommend).toBe(true);
});
