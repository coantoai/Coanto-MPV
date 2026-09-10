import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '@/lib/auth-middleware';
import { getDatabase } from '@/lib/database.server';
import { getBusinessContext } from '@/lib/business-context.server';
import {
  buildAlertCandidates,
  buildExecutiveDigest,
  type AlertPreferences,
  type DecisionAlertInput,
  type IntelligenceAlertInput,
  type MonitoringAlertInput,
} from '@/lib/alerts-reports.server';
import type { Json } from '@/lib/json';

export type AlertItem = {
  id: string;
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
  readAt: string | null;
};

export type ExecutiveReportItem = {
  id: string;
  reportKey: string;
  title: string;
  summary: string;
  periodStart: string;
  periodEnd: string;
  payload: Json;
  createdAt: string;
};

const defaultPreferences: AlertPreferences = {
  minimumChangeScore: 70,
  includeDecisions: true,
  includeIntelligence: true,
  digestFrequency: 'weekly',
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonArray(value: unknown): Json[] {
  return Array.isArray(value) ? value as Json[] : value == null ? [] : [value as Json];
}

function mapAlert(row: any): AlertItem {
  return {
    id: String(row.id),
    kind: row.kind,
    severity: row.severity,
    title: String(row.title),
    summary: String(row.summary),
    sourceId: String(row.source_id),
    sourceType: String(row.source_type),
    score: number(row.score),
    confidence: number(row.confidence),
    evidence: jsonArray(row.evidence),
    occurredAt: String(row.occurred_at),
    readAt: row.read_at ? String(row.read_at) : null,
  };
}

function mapReport(row: any): ExecutiveReportItem {
  return {
    id: String(row.id),
    reportKey: String(row.report_key),
    title: String(row.title),
    summary: String(row.summary),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    payload: (row.payload ?? {}) as Json,
    createdAt: String(row.created_at),
  };
}

async function loadPreferences(userId: string): Promise<AlertPreferences> {
  const { data, error } = await getDatabase().from('alert_preferences').select('minimum_change_score,include_decisions,include_intelligence,digest_frequency').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return defaultPreferences;
  return {
    minimumChangeScore: Math.max(0, Math.min(100, Math.round(number((data as any).minimum_change_score)))),
    includeDecisions: Boolean((data as any).include_decisions),
    includeIntelligence: Boolean((data as any).include_intelligence),
    digestFrequency: (data as any).digest_frequency === 'daily' || (data as any).digest_frequency === 'off' ? (data as any).digest_frequency : 'weekly',
  };
}

export const getAlertPreferences = createServerFn({ method: 'GET' }).middleware([requireAuth]).handler(async ({ context }): Promise<AlertPreferences> => loadPreferences(context.userId));

export const saveAlertPreferences = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: AlertPreferences) => input).handler(async ({ data, context }): Promise<AlertPreferences> => {
  const minimumChangeScore = Math.max(0, Math.min(100, Math.round(number(data.minimumChangeScore))));
  const digestFrequency = data.digestFrequency === 'daily' || data.digestFrequency === 'off' ? data.digestFrequency : 'weekly';
  const value: AlertPreferences = {
    minimumChangeScore,
    includeDecisions: Boolean(data.includeDecisions),
    includeIntelligence: Boolean(data.includeIntelligence),
    digestFrequency,
  };
  const now = new Date().toISOString();
  const { error } = await getDatabase().from('alert_preferences').upsert({
    user_id: context.userId,
    minimum_change_score: value.minimumChangeScore,
    include_decisions: value.includeDecisions,
    include_intelligence: value.includeIntelligence,
    digest_frequency: value.digestFrequency,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  return value;
});

export const refreshAlerts = createServerFn({ method: 'POST' }).middleware([requireAuth]).handler(async ({ context }) => {
  const db = getDatabase();
  const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const preferences = await loadPreferences(context.userId);
  const [
    { data: monitoring, error: monitoringError },
    { data: decisions, error: decisionsError },
    { data: intelligence, error: intelligenceError },
  ] = await Promise.all([
    db.from('monitoring_events').select('id,event_type,severity,change_score,title,summary,evidence,detected_at').eq('user_id', context.userId).gte('detected_at', since).order('detected_at', { ascending: false }).limit(300),
    db.from('decisions').select('id,status,priority,score,confidence,evidence_count,evidence,title,action,last_seen_at').eq('user_id', context.userId).gte('last_seen_at', since).order('score', { ascending: false }).limit(100),
    db.from('business_insights').select('id,impact,confidence,title,summary,recommendation,evidence,created_at').eq('user_id', context.userId).gte('created_at', since).order('created_at', { ascending: false }).limit(100),
  ]);
  const firstError = monitoringError ?? decisionsError ?? intelligenceError;
  if (firstError) throw new Error(firstError.message);

  const monitoringInput: MonitoringAlertInput[] = (monitoring ?? []).map((row: any) => ({
    id: String(row.id), eventType: String(row.event_type), severity: String(row.severity), changeScore: number(row.change_score), title: String(row.title), summary: String(row.summary), evidence: (row.evidence ?? {}) as Json, detectedAt: String(row.detected_at),
  }));
  const decisionInput: DecisionAlertInput[] = (decisions ?? []).map((row: any) => ({
    id: String(row.id), status: String(row.status), priority: String(row.priority), score: number(row.score), confidence: number(row.confidence), evidenceCount: number(row.evidence_count), evidence: jsonArray(row.evidence), title: String(row.title), action: String(row.action), lastSeenAt: String(row.last_seen_at),
  }));
  const intelligenceInput: IntelligenceAlertInput[] = (intelligence ?? []).map((row: any) => ({
    id: String(row.id), impact: String(row.impact), confidence: number(row.confidence), title: String(row.title), summary: String(row.summary), recommendation: row.recommendation ? String(row.recommendation) : null, evidence: jsonArray(row.evidence), createdAt: String(row.created_at),
  }));
  const candidates = buildAlertCandidates({ preferences, monitoring: monitoringInput, decisions: decisionInput, intelligence: intelligenceInput });
  if (candidates.length) {
    const now = new Date().toISOString();
    const { error } = await db.from('alerts').upsert(candidates.map((candidate) => ({
      user_id: context.userId,
      alert_key: candidate.alertKey,
      kind: candidate.kind,
      severity: candidate.severity,
      title: candidate.title,
      summary: candidate.summary,
      source_id: candidate.sourceId,
      source_type: candidate.sourceType,
      score: candidate.score,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      occurred_at: candidate.occurredAt,
      updated_at: now,
    })), { onConflict: 'user_id,alert_key' });
    if (error) throw new Error(error.message);
  }
  return { ok: true, generated: candidates.length };
});

export const listAlerts = createServerFn({ method: 'GET' }).middleware([requireAuth]).inputValidator((input: { limit?: number; unreadOnly?: boolean }) => input ?? {}).handler(async ({ data, context }): Promise<AlertItem[]> => {
  const limit = Math.min(Math.max(Math.round(number(data.limit || 50)), 1), 100);
  let query = getDatabase().from('alerts').select('id,kind,severity,title,summary,source_id,source_type,score,confidence,evidence,occurred_at,read_at').eq('user_id', context.userId).order('score', { ascending: false }).order('occurred_at', { ascending: false }).limit(limit);
  if (data.unreadOnly) query = query.is('read_at', null);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  return (rows ?? []).map(mapAlert);
});

export const markAlertRead = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { id: string; read: boolean }) => input).handler(async ({ data, context }) => {
  const id = data.id.trim();
  if (!id) throw new Error('Alert id is required.');
  const { error } = await getDatabase().from('alerts').update({ read_at: data.read ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', context.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const generateExecutiveReport = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { days?: number }) => input ?? {}).handler(async ({ data, context }): Promise<ExecutiveReportItem> => {
  const db = getDatabase();
  const days = Math.min(Math.max(Math.round(number(data.days || 7)), 1), 90);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 3_600_000);
  const since = periodStart.toISOString();
  const [
    business,
    { data: competitors, error: competitorsError },
    { data: targets, error: targetsError },
    { data: monitoring, error: monitoringError },
    { data: decisions, error: decisionsError },
    { data: intelligence, error: intelligenceError },
    { data: evidenceLinks, error: evidenceError },
    { data: unreadAlerts, error: alertsError },
  ] = await Promise.all([
    getBusinessContext(context.userId),
    db.from('competitors').select('id').eq('user_id', context.userId).limit(500),
    db.from('monitoring_targets').select('id,active').eq('user_id', context.userId).limit(500),
    db.from('monitoring_events').select('id,event_type,severity,change_score,title,summary,evidence,detected_at').eq('user_id', context.userId).gte('detected_at', since).order('detected_at', { ascending: false }).limit(500),
    db.from('decisions').select('id,status,priority,score,confidence,evidence_count,evidence,title,action,last_seen_at').eq('user_id', context.userId).gte('last_seen_at', since).order('score', { ascending: false }).limit(200),
    db.from('business_insights').select('id,impact,confidence,title,summary,recommendation,evidence,created_at').eq('user_id', context.userId).gte('created_at', since).order('created_at', { ascending: false }).limit(200),
    db.from('analysis_evidence_links').select('evidence_id').eq('user_id', context.userId).limit(2000),
    db.from('alerts').select('id').eq('user_id', context.userId).is('read_at', null).limit(1000),
  ]);
  const firstError = competitorsError ?? targetsError ?? monitoringError ?? decisionsError ?? intelligenceError ?? evidenceError ?? alertsError;
  if (firstError) throw new Error(firstError.message);

  const monitoringInput: MonitoringAlertInput[] = (monitoring ?? []).map((row: any) => ({
    id: String(row.id), eventType: String(row.event_type), severity: String(row.severity), changeScore: number(row.change_score), title: String(row.title), summary: String(row.summary), evidence: (row.evidence ?? {}) as Json, detectedAt: String(row.detected_at),
  }));
  const decisionInput: DecisionAlertInput[] = (decisions ?? []).map((row: any) => ({
    id: String(row.id), status: String(row.status), priority: String(row.priority), score: number(row.score), confidence: number(row.confidence), evidenceCount: number(row.evidence_count), evidence: jsonArray(row.evidence), title: String(row.title), action: String(row.action), lastSeenAt: String(row.last_seen_at),
  }));
  const intelligenceInput: IntelligenceAlertInput[] = (intelligence ?? []).map((row: any) => ({
    id: String(row.id), impact: String(row.impact), confidence: number(row.confidence), title: String(row.title), summary: String(row.summary), recommendation: row.recommendation ? String(row.recommendation) : null, evidence: jsonArray(row.evidence), createdAt: String(row.created_at),
  }));
  const uniqueEvidence = new Set((evidenceLinks ?? []).map((row: any) => String(row.evidence_id)).filter(Boolean));
  const digest = buildExecutiveDigest({
    ...(business ? { businessName: business.businessName } : {}),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    competitors: (competitors ?? []).length,
    activeMonitoring: (targets ?? []).filter((row: any) => Boolean(row.active)).length,
    monitoringChanges: monitoringInput,
    decisions: decisionInput,
    intelligence: intelligenceInput,
    evidenceLinks: uniqueEvidence.size,
    unreadAlerts: (unreadAlerts ?? []).length,
  });
  const { data: row, error } = await db.from('executive_reports').upsert({
    user_id: context.userId,
    report_key: `${digest.reportKey}:${days}d`,
    report_type: 'competitive-digest',
    period_start: digest.periodStart,
    period_end: digest.periodEnd,
    title: digest.title,
    summary: digest.summary,
    payload: digest.payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,report_key' }).select('id,report_key,title,summary,period_start,period_end,payload,created_at').single();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('Report persistence failed.');
  return mapReport(row);
});

export const listExecutiveReports = createServerFn({ method: 'GET' }).middleware([requireAuth]).inputValidator((input: { limit?: number }) => input ?? {}).handler(async ({ data, context }): Promise<ExecutiveReportItem[]> => {
  const limit = Math.min(Math.max(Math.round(number(data.limit || 20)), 1), 50);
  const { data: rows, error } = await getDatabase().from('executive_reports').select('id,report_key,title,summary,period_start,period_end,payload,created_at').eq('user_id', context.userId).order('period_end', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (rows ?? []).map(mapReport);
});
