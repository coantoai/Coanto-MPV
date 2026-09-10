import type { Json } from './json';

export type AlertPreferences = {
  minimumChangeScore: number;
  includeDecisions: boolean;
  includeIntelligence: boolean;
  digestFrequency: 'daily' | 'weekly' | 'off';
};

export type AlertCandidate = {
  alertKey: string;
  kind: 'monitoring' | 'decision' | 'intelligence';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  sourceId: string;
  sourceType: string;
  score: number;
  confidence: number;
  evidence: Json[];
  occurredAt: string;
};

export type MonitoringAlertInput = {
  id: string;
  eventType: string;
  severity: string;
  changeScore: number;
  title: string;
  summary: string;
  evidence: Json;
  detectedAt: string;
};

export type DecisionAlertInput = {
  id: string;
  status: string;
  priority: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  evidence: Json[];
  title: string;
  action: string;
  lastSeenAt: string;
};

export type IntelligenceAlertInput = {
  id: string;
  impact: string;
  confidence: number;
  title: string;
  summary: string;
  recommendation: string | null;
  evidence: Json[];
  createdAt: string;
};

export type ExecutiveDigest = {
  reportKey: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  summary: string;
  payload: Json;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function severityFrom(score: number, explicit = ''): AlertCandidate['severity'] {
  const value = explicit.toLowerCase();
  if (value === 'critical' || score >= 95) return 'critical';
  if (value === 'high' || score >= 85) return 'high';
  if (value === 'medium' || score >= 70) return 'medium';
  return 'low';
}

function evidenceArray(value: Json | Json[] | null | undefined): Json[] {
  if (Array.isArray(value)) return value as Json[];
  if (value == null) return [];
  return [value];
}

export function buildAlertCandidates(input: {
  preferences: AlertPreferences;
  monitoring: MonitoringAlertInput[];
  decisions: DecisionAlertInput[];
  intelligence: IntelligenceAlertInput[];
}): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  for (const event of input.monitoring) {
    const score = clampScore(event.changeScore);
    if (event.eventType === 'error' || score < input.preferences.minimumChangeScore) continue;
    candidates.push({
      alertKey: `monitoring:${event.id}`,
      kind: 'monitoring',
      severity: severityFrom(score, event.severity),
      title: event.title,
      summary: event.summary,
      sourceId: event.id,
      sourceType: event.eventType,
      score,
      confidence: score >= 85 ? 0.9 : 0.75,
      evidence: evidenceArray(event.evidence),
      occurredAt: event.detectedAt,
    });
  }

  if (input.preferences.includeDecisions) {
    for (const decision of input.decisions) {
      const score = clampScore(decision.score);
      const confidence = clampConfidence(decision.confidence);
      if ((decision.status !== 'proposed' && decision.status !== 'accepted') || score < 75 || confidence < 0.6 || decision.evidenceCount < 1) continue;
      candidates.push({
        alertKey: `decision:${decision.id}`,
        kind: 'decision',
        severity: severityFrom(score, decision.priority),
        title: decision.title,
        summary: decision.action,
        sourceId: decision.id,
        sourceType: 'evidence-gated-decision',
        score,
        confidence,
        evidence: decision.evidence,
        occurredAt: decision.lastSeenAt,
      });
    }
  }

  if (input.preferences.includeIntelligence) {
    for (const insight of input.intelligence) {
      const confidence = clampConfidence(insight.confidence);
      const evidence = insight.evidence;
      const impact = insight.impact.toLowerCase();
      if (!evidence.length || confidence < 0.7 || (impact !== 'high' && confidence < 0.85)) continue;
      const score = clampScore((impact === 'high' ? 82 : 70) + Math.round(confidence * 12));
      candidates.push({
        alertKey: `intelligence:${insight.id}`,
        kind: 'intelligence',
        severity: severityFrom(score, impact),
        title: insight.title,
        summary: insight.recommendation || insight.summary,
        sourceId: insight.id,
        sourceType: 'competitive-intelligence',
        score,
        confidence,
        evidence,
        occurredAt: insight.createdAt,
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score || Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function buildExecutiveDigest(input: {
  businessName?: string;
  periodStart: string;
  periodEnd: string;
  competitors: number;
  activeMonitoring: number;
  monitoringChanges: MonitoringAlertInput[];
  decisions: DecisionAlertInput[];
  intelligence: IntelligenceAlertInput[];
  evidenceLinks: number;
  unreadAlerts: number;
}): ExecutiveDigest {
  const meaningfulChanges = input.monitoringChanges.filter((item) => item.eventType !== 'error');
  const highPriorityChanges = meaningfulChanges.filter((item) => item.changeScore >= 85 || item.severity === 'high' || item.severity === 'critical');
  const actionableDecisions = input.decisions.filter((item) => (item.status === 'proposed' || item.status === 'accepted') && item.evidenceCount > 0).sort((a, b) => b.score - a.score);
  const strongInsights = input.intelligence.filter((item) => item.evidence.length > 0 && item.confidence >= 0.7).sort((a, b) => b.confidence - a.confidence);
  const topDecision = actionableDecisions[0] ?? null;
  const topChanges = meaningfulChanges.sort((a, b) => b.changeScore - a.changeScore).slice(0, 5);
  const topInsights = strongInsights.slice(0, 5);
  const name = input.businessName?.trim() || 'نشاطك';
  const reportKey = `competitive-digest:${input.periodEnd.slice(0, 10)}`;
  const summary = topDecision
    ? `${name}: ${meaningfulChanges.length} تغيّر تنافسي، ${highPriorityChanges.length} عالي الأولوية، وأهم قرار حالي بدرجة ${topDecision.score}/100.`
    : `${name}: ${meaningfulChanges.length} تغيّر تنافسي و${strongInsights.length} رؤية موثقة، ولا يوجد قرار قابل للتنفيذ اجتاز بوابة الدليل في هذه الفترة.`;

  const payload: Json = {
    version: 1,
    generatedFrom: 'persisted-coanto-evidence-intelligence-decisions',
    evidencePolicy: 'AI output is not evidence; every surfaced decision must retain evidence lineage.',
    health: {
      competitors: input.competitors,
      activeMonitoring: input.activeMonitoring,
      evidenceLinks: input.evidenceLinks,
      unreadAlerts: input.unreadAlerts,
      changes: meaningfulChanges.length,
      highPriorityChanges: highPriorityChanges.length,
      actionableDecisions: actionableDecisions.length,
      strongInsights: strongInsights.length,
    },
    topDecision: topDecision ? {
      id: topDecision.id,
      title: topDecision.title,
      action: topDecision.action,
      score: topDecision.score,
      confidence: topDecision.confidence,
      evidenceCount: topDecision.evidenceCount,
      status: topDecision.status,
    } : null,
    topChanges: topChanges.map((item) => ({ id: item.id, eventType: item.eventType, title: item.title, summary: item.summary, score: item.changeScore, severity: item.severity, detectedAt: item.detectedAt })),
    topInsights: topInsights.map((item) => ({ id: item.id, title: item.title, summary: item.summary, impact: item.impact, confidence: item.confidence, recommendation: item.recommendation })),
  };

  return {
    reportKey,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    title: `التقرير التنفيذي التنافسي — ${name}`,
    summary,
    payload,
  };
}
