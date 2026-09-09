import { createEvidence, dedupeEvidence, evidenceToTrustItem, validateEvidenceInput } from '../src/lib/evidence-engine.server.ts';

const now = '2026-09-09T00:00:00.000Z';
const base = {
  kind: 'direct' as const,
  sourceUrl: 'https://example.com/product',
  sourceGroup: 'example.com',
  observedAt: now,
  retrievedAt: now,
  content: 'Price: $99. Product is available.'
};

const a = createEvidence(base);
const b = createEvidence({ ...base });
if (a.id !== b.id || a.contentHash !== b.contentHash) throw new Error('Evidence identity is not deterministic.');
if (!/^ev_[a-f0-9]{24}$/.test(a.id)) throw new Error('Evidence ID format is invalid.');
if (a.sourceDomain !== 'example.com') throw new Error('Source domain normalization failed.');
if (dedupeEvidence([a, b]).length !== 1) throw new Error('Evidence deduplication failed.');
if (evidenceToTrustItem(a).directness !== 1) throw new Error('Trust mapping failed.');

let rejected = false;
try { validateEvidenceInput({ ...base, sourceUrl: 'ftp://example.com/a' }); } catch { rejected = true; }
if (!rejected) throw new Error('Unsafe protocol was accepted.');

rejected = false;
try { validateEvidenceInput({ ...base, retrievedAt: '2026-09-08T00:00:00.000Z' }); } catch { rejected = true; }
if (!rejected) throw new Error('Invalid timestamp ordering was accepted.');

console.log('EVIDENCE_SMOKE_OK', JSON.stringify({ id: a.id, hash: a.contentHash, deduped: dedupeEvidence([a, b]).length }));
