import { createHash } from 'node:crypto';
import type { EvidenceRecord } from './evidence-engine.server';

export type ClaimType = 'observed' | 'derived' | 'inference' | 'recommendation';
export type ClaimStatus = 'SUPPORTED' | 'CONTRADICTED' | 'UNRESOLVED' | 'UNSUPPORTED';

export type ClaimRecord = {
  id: string;
  text: string;
  normalized: string;
  type: ClaimType;
  status: ClaimStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  createdAt: string;
  version: number;
};

export type ClaimInput = {
  text: string;
  type?: ClaimType;
  evidence?: EvidenceRecord[];
  createdAt?: string;
};

function clean(value: string) {
  return value.replaceAll(String.fromCharCode(0), '').replace(/\s+/g, ' ').trim().slice(0, 2_000);
}

function normalizeClaim(text: string) {
  return clean(text).toLocaleLowerCase('en-US');
}

function claimId(normalized: string, type: ClaimType) {
  const hash = createHash('sha256').update(`${type}\n${normalized}`, 'utf8').digest('hex');
  return `cl_${hash.slice(0, 24)}`;
}

function classifyEvidence(evidence: EvidenceRecord[]) {
  const supporting = evidence.filter((item) => Boolean(item.supportsClaim) && !item.contradictsClaim).map((item) => item.id);
  const contradicting = evidence.filter((item) => Boolean(item.contradictsClaim)).map((item) => item.id);
  return { supporting: [...new Set(supporting)], contradicting: [...new Set(contradicting)] };
}

function statusOf(supporting: string[], contradicting: string[]): ClaimStatus {
  if (supporting.length > 0 && contradicting.length > 0) return 'UNRESOLVED';
  if (contradicting.length > 0) return 'CONTRADICTED';
  if (supporting.length > 0) return 'SUPPORTED';
  return 'UNSUPPORTED';
}

/** Creates an atomic, deterministic claim. A claim is never evidence itself. */
export function createClaim(input: ClaimInput): ClaimRecord {
  const text = clean(input.text);
  if (!text) throw new Error('Claim text is required.');
  const type = input.type ?? 'observed';
  const normalized = normalizeClaim(text);
  const { supporting, contradicting } = classifyEvidence(input.evidence ?? []);
  return {
    id: claimId(normalized, type),
    text,
    normalized,
    type,
    status: statusOf(supporting, contradicting),
    supportingEvidenceIds: supporting,
    contradictingEvidenceIds: contradicting,
    createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    version: 1,
  };
}

/** Re-evaluates a claim against its current evidence links without changing its identity. */
export function refreshClaim(claim: ClaimRecord, evidence: EvidenceRecord[]): ClaimRecord {
  const linked = new Set([...claim.supportingEvidenceIds, ...claim.contradictingEvidenceIds]);
  const relevant = evidence.filter((item) => linked.has(item.id));
  const { supporting, contradicting } = classifyEvidence(relevant);
  return {
    ...claim,
    status: statusOf(supporting, contradicting),
    supportingEvidenceIds: supporting,
    contradictingEvidenceIds: contradicting,
    version: claim.version + 1,
  };
}

/** Links evidence to a claim using evidence IDs only; raw text is never accepted as evidence. */
export function linkEvidenceToClaim(claim: ClaimRecord, evidence: Pick<EvidenceRecord, 'id' | 'supportsClaim' | 'contradictsClaim'>[]): ClaimRecord {
  const existing = new Set([...claim.supportingEvidenceIds, ...claim.contradictingEvidenceIds]);
  const supporting = [...claim.supportingEvidenceIds];
  const contradicting = [...claim.contradictingEvidenceIds];

  for (const item of evidence) {
    if (existing.has(item.id)) continue;
    if (item.contradictsClaim) contradicting.push(item.id);
    else if (item.supportsClaim) supporting.push(item.id);
  }

  return {
    ...claim,
    status: statusOf(supporting, contradicting),
    supportingEvidenceIds: [...new Set(supporting)],
    contradictingEvidenceIds: [...new Set(contradicting)],
    version: claim.version + 1,
  };
}

export function dedupeClaims(claims: ClaimRecord[]) {
  const seen = new Map<string, ClaimRecord>();
  for (const claim of claims) {
    if (!seen.has(claim.id)) seen.set(claim.id, claim);
  }
  return [...seen.values()];
}
