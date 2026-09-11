import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '@/lib/auth-middleware';
import { getDatabase } from '@/lib/database.server';
import { getBusinessContext } from '@/lib/business-context.server';

export type DashboardDecision = {
  id: string;
  title: string;
  action: string;
  priority: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  status: string;
  updatedAt: string;
};

export type DashboardChange = {
  id: string;
  targetId: string;
  targetName: string;
  eventType: string;
  severity: string;
  score: number;
  title: string;
  summary: string;
  detectedAt: string;
  acknowledged: boolean;
};

export type DashboardInsight = {
  id: string;
  title: string;
  category: string;
  impact: string;
  confidence: number;
  summary: string;
  recommendation: string | null;
  createdAt: string;
};

export type DashboardCompetitor = {
  id: string;
  name: string;
  domain: string;
  relevanceScore: number;
  verificationStatus: string;
  lastSeenAt: string;
};

export type DashboardSnapshot = {
  generatedAt: string;
  business: { name: string; websiteUrl: string; primaryMarket: string } | null;
  health: {
    competitors: number;
    activeMonitoring: number;
    unreadChanges: number;
    highPriorityChanges: number;
    verifiedEvidenceLinks: number;
    analyses30d: number;
    patterns30d: number;
    averageChangeScore: number;
  };
  topDecision: DashboardDecision | null;
  changes: DashboardChange[];
  insights: DashboardInsight[];
  competitors: DashboardCompetitor[];
  degradedSources: string[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultOr<T>(result: PromiseSettledResult<T>, fallback: T, source: string, degraded: string[]): T {
  if (result.status === 'fulfilled') return result.value;
  degraded.push(source);
  console.error('dashboard-source-failed', source, result.reason instanceof Error ? result.reason.message : 'unknown error');
  return fallback;
}

function dataOr<T extends Record<string, unknown>>(result: PromiseSettledResult<{ data: T[] | null; error: { message: string } | null }>, source: string, degraded: string[]) {
  const value = resultOr(result, { data: [] as T[], error: null }, source, degraded);
  if (value.error) {
    degraded.push(source);
    console.error('dashboard-query-failed', source, value.error.message);
    return [] as T[];
  }
  return value.data ?? [];
}

function countOr(result: PromiseSettledResult<{ count: number | null; error: { message: string } | null }>, fallback: number, source: string, degraded: string[]) {
  const value = resultOr(result, { count: null, error: null }, source, degraded);
  if (value.error || value.count === null) {
    if (!degraded.includes(source)) degraded.push(source);
    if (value.error) console.error('dashboard-count-failed', source, value.error.message);
    return fallback;
  }
  return value.count;
}

export const getDashboardSnapshot = createServerFn({ method: 'GET' }).middleware([requireAuth]).handler(async ({ context }): Promise<DashboardSnapshot> => {
  const db = getDatabase();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();
  const userId = context.userId;

  const [
    businessResult,
    competitorsResult,
    targetsResult,
    eventsResult,
    insightsResult,
    decisionsResult,
    metricsResult,
    competitorsCountResult,
    activeMonitoringCountResult,
    unreadChangesCountResult,
    highPriorityCountResult,
    evidenceLinksCountResult,
    analysesCountResult,
  ] = await Promise.allSettled([
    getBusinessContext(userId),
    db.from('competitors').select('id,name,domain,relevance_score,verification_status,last_seen_at').eq('user_id', userId).order('relevance_score', { ascending: false }).limit(20),
    db.from('monitoring_targets').select('id,name,active').eq('user_id', userId).limit(200),
    db.from('monitoring_events').select('id,target_id,event_type,severity,change_score,title,summary,detected_at,acknowledged_at').eq('user_id', userId).gte('detected_at', since).order('detected_at', { ascending: false }).limit(100),
    db.from('business_insights').select('id,title,category,impact,confidence,summary,recommendation,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
    db.from('decisions').select('id,title,action,priority,score,confidence,evidence_count,status,last_seen_at').eq('user_id', userId).neq('status', 'dismissed').order('score', { ascending: false }).order('last_seen_at', { ascending: false }).limit(1),
    db.from('business_metrics').select('metric_key,metric_value,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    db.from('competitors').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('monitoring_targets').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    db.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('detected_at', since).neq('event_type', 'error').is('acknowledged_at', null),
    db.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('detected_at', since).neq('event_type', 'error').or('change_score.gte.85,severity.eq.high'),
    db.from('analysis_evidence_links').select('evidence_id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('analyses').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
  ]);

  const degradedSources: string[] = [];
  const business = resultOr(businessResult, null, 'business-context', degradedSources);
  const competitors = dataOr(competitorsResult as PromiseSettledResult<any>, 'competitors', degradedSources);
  const targets = dataOr(targetsResult as PromiseSettledResult<any>, 'monitoring-targets', degradedSources);
  const events = dataOr(eventsResult as PromiseSettledResult<any>, 'monitoring-events', degradedSources);
  const insights = dataOr(insightsResult as PromiseSettledResult<any>, 'business-insights', degradedSources);
  const decisions = dataOr(decisionsResult as PromiseSettledResult<any>, 'decisions', degradedSources);
  const metrics = dataOr(metricsResult as PromiseSettledResult<any>, 'business-metrics', degradedSources);

  const targetNames = new Map(targets.map((row: any) => [String(row.id), String(row.name)]));
  const eventRows = events;
  const metricMap = new Map<string, number>();
  for (const row of metrics) {
    const key = String((row as any).metric_key);
    if (!metricMap.has(key)) metricMap.set(key, number((row as any).metric_value));
  }

  const fallbackUnread = eventRows.filter((row: any) => String(row.event_type) !== 'error' && !row.acknowledged_at).length;
  const fallbackHighPriority = eventRows.filter((row: any) => String(row.event_type) !== 'error' && (number(row.change_score) >= 85 || String(row.severity) === 'high')).length;
  const competitorCount = countOr(competitorsCountResult as PromiseSettledResult<any>, competitors.length, 'competitors-count', degradedSources);
  const activeMonitoring = countOr(activeMonitoringCountResult as PromiseSettledResult<any>, targets.filter((row: any) => Boolean(row.active)).length, 'monitoring-count', degradedSources);
  const unreadChanges = countOr(unreadChangesCountResult as PromiseSettledResult<any>, fallbackUnread, 'unread-changes-count', degradedSources);
  const highPriorityChanges = countOr(highPriorityCountResult as PromiseSettledResult<any>, fallbackHighPriority, 'high-priority-count', degradedSources);
  const verifiedEvidenceLinks = countOr(evidenceLinksCountResult as PromiseSettledResult<any>, 0, 'evidence-links-count', degradedSources);
  const analyses30d = countOr(analysesCountResult as PromiseSettledResult<any>, 0, 'analyses-count', degradedSources);

  const mappedChanges: DashboardChange[] = eventRows.filter((row: any) => String(row.event_type) !== 'error').slice(0, 12).map((row: any) => ({
    id: String(row.id),
    targetId: String(row.target_id),
    targetName: targetNames.get(String(row.target_id)) ?? 'منافس',
    eventType: String(row.event_type),
    severity: String(row.severity),
    score: number(row.change_score),
    title: String(row.title),
    summary: String(row.summary),
    detectedAt: String(row.detected_at),
    acknowledged: Boolean(row.acknowledged_at),
  }));
  const top = decisions?.[0] as any;

  return {
    generatedAt: now.toISOString(),
    business: business ? { name: business.businessName, websiteUrl: business.websiteUrl, primaryMarket: business.primaryMarket } : null,
    health: {
      competitors: competitorCount,
      activeMonitoring,
      unreadChanges,
      highPriorityChanges,
      verifiedEvidenceLinks,
      analyses30d,
      patterns30d: metricMap.get('cross_competitor_patterns_30d') ?? 0,
      averageChangeScore: metricMap.get('average_change_score_30d') ?? 0,
    },
    topDecision: top ? {
      id: String(top.id),
      title: String(top.title),
      action: String(top.action),
      priority: String(top.priority),
      score: number(top.score),
      confidence: number(top.confidence),
      evidenceCount: number(top.evidence_count),
      status: String(top.status),
      updatedAt: String(top.last_seen_at),
    } : null,
    changes: mappedChanges,
    insights: insights.map((row: any) => ({
      id: String(row.id),
      title: String(row.title),
      category: String(row.category),
      impact: String(row.impact),
      confidence: number(row.confidence),
      summary: String(row.summary),
      recommendation: row.recommendation ? String(row.recommendation) : null,
      createdAt: String(row.created_at),
    })),
    competitors: competitors.slice(0, 8).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      domain: String(row.domain),
      relevanceScore: number(row.relevance_score),
      verificationStatus: String(row.verification_status),
      lastSeenAt: String(row.last_seen_at),
    })),
    degradedSources: [...new Set(degradedSources)],
  };
});
