import { createHash } from 'node:crypto';

export type DecisionInsightInput = {
  id: string;
  title: string;
  summary: string;
  category: string;
  impact: string;
  confidence: number;
  evidence: unknown[];
  recommendation: string | null;
  sourceAnalysisId: string | null;
};

export type DecisionCandidate = {
  decisionKey: string;
  sourceInsightId: string;
  sourceAnalysisId: string | null;
  category: string;
  title: string;
  action: string;
  rationale: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  score: number;
  confidence: number;
  evidenceCount: number;
  evidence: Array<Record<string, unknown>>;
  rank: number;
};

export type DecisionEngineResult = {
  decisions: DecisionCandidate[];
  rejected: Array<{ insightId: string; reason: 'missing-action' | 'missing-evidence' | 'low-confidence' }>;
};

const MIN_DECISION_CONFIDENCE = 0.6;

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function recordEvidence(value: unknown[]): Array<Record<string, unknown>> {
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)).slice(0, 12);
}

function scoreOf(impact: string, confidence: number, evidenceCount: number) {
  const impactScore = impact === 'high' ? 35 : impact === 'medium' ? 22 : 10;
  const confidenceScore = Math.round(Math.max(0, Math.min(1, confidence)) * 50);
  const evidenceScore = Math.min(15, evidenceCount * 3);
  return Math.max(0, Math.min(100, impactScore + confidenceScore + evidenceScore));
}

function priorityOf(score: number): DecisionCandidate['priority'] {
  if (score >= 95) return 'critical';
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function stableDecisionKey(category: string, action: string) {
  const canonical = `${normalize(category).toLowerCase()}\n${normalize(action).toLowerCase()}`;
  return `dec_${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 24)}`;
}

/**
 * Converts persisted intelligence into ranked decisions. It refuses to publish
 * an action when there is no evidence lineage or confidence is below the gate.
 * No AI-generated text is promoted into evidence here.
 */
export function buildDecisions(insights: DecisionInsightInput[]): DecisionEngineResult {
  const decisions: DecisionCandidate[] = [];
  const rejected: DecisionEngineResult['rejected'] = [];

  for (const insight of insights) {
    const action = normalize(insight.recommendation ?? '');
    if (!action) {
      rejected.push({ insightId: insight.id, reason: 'missing-action' });
      continue;
    }
    const evidence = recordEvidence(insight.evidence);
    if (!evidence.length) {
      rejected.push({ insightId: insight.id, reason: 'missing-evidence' });
      continue;
    }
    const confidence = Math.max(0, Math.min(1, Number(insight.confidence) || 0));
    if (confidence < MIN_DECISION_CONFIDENCE) {
      rejected.push({ insightId: insight.id, reason: 'low-confidence' });
      continue;
    }
    const score = scoreOf(insight.impact, confidence, evidence.length);
    const title = normalize(insight.title) || 'قرار تنافسي';
    decisions.push({
      decisionKey: stableDecisionKey(insight.category, action),
      sourceInsightId: insight.id,
      sourceAnalysisId: insight.sourceAnalysisId,
      category: normalize(insight.category || 'competition'),
      title,
      action,
      rationale: `${normalize(insight.summary)} القرار يمر عبر بوابة COANTO لأنه مدعوم بـ ${evidence.length} مرجع/أحداث موثقة وثقة ${Math.round(confidence * 100)}%.`,
      priority: priorityOf(score),
      score,
      confidence,
      evidenceCount: evidence.length,
      evidence,
      rank: 0,
    });
  }

  decisions.sort((a, b) => b.score - a.score || b.confidence - a.confidence || b.evidenceCount - a.evidenceCount || a.decisionKey.localeCompare(b.decisionKey));
  return { decisions: decisions.map((decision, index) => ({ ...decision, rank: index + 1 })), rejected };
}
