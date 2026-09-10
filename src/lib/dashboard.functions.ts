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
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const getDashboardSnapshot = createServerFn({ method: 'GET' }).middleware([requireAuth]).handler(async ({ context }): Promise<DashboardSnapshot> => {
  const db = getDatabase();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();
  const business = await getBusinessContext(context.userId);

  const [
    { data: competitors, error: competitorsError },
    { data: targets, error: targetsError },
    { data: events, error: eventsError },
    { data: insights, error: insightsError },
    { data: decisions, error: decisionsError },
    { data: analyses, error: analysesError },
    { data: evidenceLinks, error: evidenceError },
    { data: metrics, error: metricsError },
  ] = await Promise.all([
    db.from('competitors').select('id,name,domain,relevance_score,verification_status,last_seen_at').eq('user_id', context.userId).order('relevance_score', { ascending: false }).limit(20),
    db.from('monitoring_targets').select('id,name,active').eq('user_id', context.userId).limit(100),
    db.from('monitoring_events').select('id,target_id,event_type,severity,change_score,title,summary,detected_at,acknowledged_at').eq('user_id', context.userId).gte('detected_at', since).order('detected_at', { ascending: false }).limit(100),
    db.from('business_insights').select('id,title,category,impact,confidence,summary,recommendation,created_at').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(8),
    db.from('decisions').select('id,title,action,priority,score,confidence,evidence_count,status,last_seen_at').eq('user_id', context.userId).neq('status', 'dismissed').order('score', { ascending: false }).order('last_seen_at', { ascending: false }).limit(1),
    db.from('analyses').select('id,created_at').eq('user_id', context.userId).gte('created_at', since).limit(500),
    db.from('analysis_evidence_links').select('evidence_id').eq('user_id', context.userId).limit(1000),
    db.from('business_metrics').select('metric_key,metric_value,created_at').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100),
  ]);

  const firstError = competitorsError ?? targetsError ?? eventsError ?? insightsError ?? decisionsError ?? analysesError ?? evidenceError ?? metricsError;
  if (firstError) throw new Error(firstError.message);

  const targetNames = new Map((targets ?? []).map((row: any) => [String(row.id), String(row.name)]));
  const eventRows = events ?? [];
  const metricMap = new Map<string, number>();
  for (const row of metrics ?? []) {
    const key = String((row as any).metric_key);
    if (!metricMap.has(key)) metricMap.set(key, number((row as any).metric_value));
  }
  const uniqueEvidence = new Set((evidenceLinks ?? []).map((row: any) => String(row.evidence_id)).filter(Boolean));
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
  const unreadChanges = eventRows.filter((row: any) => String(row.event_type) !== 'error' && !row.acknowledged_at).length;
  const highPriorityChanges = eventRows.filter((row: any) => String(row.event_type) !== 'error' && (number(row.change_score) >= 85 || String(row.severity) === 'high')).length;
  const top = decisions?.[0] as any;

  return {
    generatedAt: now.toISOString(),
    business: business ? { name: business.businessName, websiteUrl: business.websiteUrl, primaryMarket: business.primaryMarket } : null,
    health: {
      competitors: (competitors ?? []).length,
      activeMonitoring: (targets ?? []).filter((row: any) => Boolean(row.active)).length,
      unreadChanges,
      highPriorityChanges,
      verifiedEvidenceLinks: uniqueEvidence.size,
      analyses30d: (analyses ?? []).length,
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
    insights: (insights ?? []).map((row: any) => ({
      id: String(row.id),
      title: String(row.title),
      category: String(row.category),
      impact: String(row.impact),
      confidence: number(row.confidence),
      summary: String(row.summary),
      recommendation: row.recommendation ? String(row.recommendation) : null,
      createdAt: String(row.created_at),
    })),
    competitors: (competitors ?? []).slice(0, 8).map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      domain: String(row.domain),
      relevanceScore: number(row.relevance_score),
      verificationStatus: String(row.verification_status),
      lastSeenAt: String(row.last_seen_at),
    })),
  };
});
