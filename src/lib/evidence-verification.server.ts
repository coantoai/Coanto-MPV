import type { EvidenceRecord, EvidenceStatus } from './evidence-engine.server';

export type EvidenceVerification = {
  status: EvidenceStatus;
  confidence: number;
  reasons: string[];
};

const MAX_DIRECT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_INDEXED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }

/**
 * Deterministic verification policy. It does not infer facts from content.
 * It only assesses provenance quality, freshness and collection integrity.
 */
export function verifyEvidence(record: EvidenceRecord, now = new Date()): EvidenceVerification {
  const reasons: string[] = [];
  const observed = Date.parse(record.observedAt);
  const retrieved = Date.parse(record.retrievedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(retrieved) || retrieved < observed) {
    return { status: 'REJECTED', confidence: 0, reasons: ['invalid-timestamps'] };
  }
  if (!record.content.trim() || !/^[a-f0-9]{64}$/i.test(record.contentHash)) {
    return { status: 'REJECTED', confidence: 0, reasons: ['invalid-content-integrity'] };
  }

  const ageMs = Math.max(0, now.getTime() - observed);
  let confidence = 0.45;
  if (record.kind === 'direct') {
    confidence = 0.9;
    reasons.push('direct-source');
    if (ageMs > MAX_DIRECT_AGE_MS) { confidence -= 0.25; reasons.push('stale-direct-observation'); }
  } else if (record.kind === 'search') {
    confidence = 0.68;
    reasons.push('indexed-source');
    if (ageMs > MAX_INDEXED_AGE_MS) { confidence -= 0.25; reasons.push('stale-indexed-observation'); }
  } else if (record.kind === 'calculation') {
    confidence = 0.85;
    reasons.push('deterministic-calculation');
  } else if (record.kind === 'historical') {
    confidence = 0.58;
    reasons.push('historical-source');
  } else {
    confidence = 0.35;
    reasons.push('inference-not-primary-evidence');
  }

  if (record.sourceUrl.startsWith('https://')) confidence += 0.03;
  if (record.content.length < 20) { confidence -= 0.2; reasons.push('thin-content'); }
  confidence = clamp(confidence);

  const status: EvidenceStatus = record.kind === 'inference' || confidence < 0.72 ? 'UNVERIFIED' : 'VERIFIED';
  return { status, confidence: Math.round(confidence * 100) / 100, reasons };
}

export function applyEvidenceVerification(record: EvidenceRecord, now = new Date()): EvidenceRecord {
  const verification = verifyEvidence(record, now);
  return {
    ...record,
    status: verification.status,
    metadata: {
      ...(record.metadata ?? {}),
      verificationConfidence: verification.confidence,
      verificationReasons: verification.reasons.join(','),
      verificationPolicy: 'coanto-evidence-v1',
    },
  };
}
