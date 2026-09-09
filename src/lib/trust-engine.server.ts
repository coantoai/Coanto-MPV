export type ProofLevel =
  | 'PROVEN'
  | 'HIGH_CONFIDENCE'
  | 'PROBABLE'
  | 'UNCERTAIN'
  | 'UNVERIFIED';

export type EvidenceKind = 'direct' | 'search' | 'calculation' | 'historical' | 'inference';

export type EvidenceItem = {
  id: string;
  sourceUrl: string;
  sourceDomain?: string;
  sourceGroup?: string;
  kind: EvidenceKind;
  observedAt?: string;
  supportsClaim: boolean;
  contradictsClaim?: boolean;
  directness?: number;
  reliability?: number;
};

export type TrustAssessment = {
  proofLevel: ProofLevel;
  score: number;
  evidenceCount: number;
  independentSources: number;
  supportingSources: number;
  contradictingSources: number;
  reasons: string[];
  canRecommend: boolean;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function finite(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function domainOf(item: EvidenceItem) {
  if (item.sourceDomain?.trim()) return item.sourceDomain.trim().toLowerCase();
  try {
    return new URL(item.sourceUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function groupOf(item: EvidenceItem) {
  return (item.sourceGroup?.trim() || domainOf(item) || item.id).toLowerCase();
}

function freshness(item: EvidenceItem, now: Date) {
  if (!item.observedAt) return 0.5;
  const observed = Date.parse(item.observedAt);
  if (!Number.isFinite(observed)) return 0.25;
  const ageDays = Math.max(0, (now.getTime() - observed) / 86_400_000);
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.9;
  if (ageDays <= 30) return 0.75;
  if (ageDays <= 90) return 0.55;
  return 0.3;
}

/**
 * Deterministic trust assessment. Models may propose claims; this function
 * decides how much the evidence deserves to be trusted.
 */
export function assessTrust(
  evidence: EvidenceItem[],
  options: { now?: Date; minimumRecommendationScore?: number } = {},
): TrustAssessment {
  const now = options.now ?? new Date();
  const unique = new Map<string, EvidenceItem>();
  for (const item of evidence) {
    if (!item.id || !item.sourceUrl) continue;
    unique.set(item.id, item);
  }

  const items = [...unique.values()];
  const supporting = items.filter((x) => x.supportsClaim && !x.contradictsClaim);
  const contradicting = items.filter((x) => x.contradictsClaim);
  const independentGroups = new Set(supporting.map(groupOf));
  const independentSources = independentGroups.size;

  if (!items.length) {
    return {
      proofLevel: 'UNVERIFIED',
      score: 0,
      evidenceCount: 0,
      independentSources: 0,
      supportingSources: 0,
      contradictingSources: 0,
      reasons: ['لا توجد أدلة قابلة للتحقق.'],
      canRecommend: false,
    };
  }

  const supportQuality = supporting.length
    ? supporting.reduce((sum, item) => {
        const directness = finite(item.directness, item.kind === 'direct' ? 1 : item.kind === 'calculation' ? 0.95 : 0.65);
        const reliability = finite(item.reliability, 0.6);
        return sum + clamp(directness) * clamp(reliability) * freshness(item, now);
      }, 0) / supporting.length
    : 0;

  const independence = supporting.length ? clamp(independentSources / Math.min(4, supporting.length)) : 0;
  const contradictionPenalty = clamp(contradicting.length / Math.max(1, supporting.length + contradicting.length));
  const directEvidence = supporting.filter((x) => x.kind === 'direct' || x.kind === 'calculation').length;
  const directnessBonus = supporting.length ? clamp(directEvidence / Math.min(3, supporting.length)) : 0;

  // Independence is deliberately weighted more than raw source count:
  // ten copies of the same source are not ten independent proofs.
  const rawScore =
    supportQuality * 0.4 +
    independence * 0.3 +
    directnessBonus * 0.2 +
    (1 - contradictionPenalty) * 0.1;
  const score = Math.round(clamp(rawScore) * 100);
  const threshold = options.minimumRecommendationScore ?? 70;

  let proofLevel: ProofLevel;
  if (contradicting.length && contradictionPenalty >= 0.34) proofLevel = 'UNCERTAIN';
  else if (score >= 90 && independentSources >= 2 && directEvidence >= 1) proofLevel = 'PROVEN';
  else if (score >= 75 && independentSources >= 2) proofLevel = 'HIGH_CONFIDENCE';
  else if (score >= 55 && supporting.length >= 1) proofLevel = 'PROBABLE';
  else proofLevel = 'UNVERIFIED';

  const reasons: string[] = [
    `${independentSources} مصدر/مجموعة مستقلة من الأدلة الداعمة.`,
    `${supporting.length} دليل داعم مقابل ${contradicting.length} دليل متعارض.`,
  ];
  if (independentSources < 2 && supporting.length > 1) reasons.push('عدد الأدلة لا يساوي عدد المصادر المستقلة؛ قد تكون الأدلة مترابطة.');
  if (contradicting.length) reasons.push('تم العثور على تعارض ويجب عدم تقديم النتيجة كحقيقة محسومة.');
  if (directEvidence === 0) reasons.push('لا يوجد دليل مباشر أو حسابي كافٍ حتى الآن.');
  if (score < threshold) reasons.push('النتيجة تحت حد الثقة المطلوب للتوصية.');

  return {
    proofLevel,
    score,
    evidenceCount: items.length,
    independentSources,
    supportingSources: supporting.length,
    contradictingSources: contradicting.length,
    reasons,
    canRecommend: score >= threshold && proofLevel !== 'UNCERTAIN' && proofLevel !== 'UNVERIFIED',
  };
}

export function shouldRefuseToGuess(assessment: TrustAssessment) {
  return !assessment.canRecommend;
}
