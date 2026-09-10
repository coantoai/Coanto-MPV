import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '@/lib/auth-middleware';
import { getDatabase } from '@/lib/database.server';
import { validateTargetUrl } from '@/lib/analyze.server';
import { executeMonitoringCheck } from '@/lib/monitoring-runner.server';
import type { Json } from '@/lib/json';

export type MonitoringTarget = {
  id: string;
  name: string;
  url: string;
  intervalHours: number;
  active: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  createdAt: string;
};

export type MonitoringEvent = {
  id: string;
  targetId: string;
  eventType: string;
  severity: string;
  changeScore: number;
  title: string;
  summary: string;
  evidence: Json;
  detectedAt: string;
  acknowledgedAt: string | null;
};

export type MonitoringCheck = {
  changed: boolean;
  alertCreated: boolean;
  suppressedDuplicate: boolean;
  score: number;
  event: MonitoringEvent | null;
  checkedAt: string;
};

const mapTarget = (row: any): MonitoringTarget => ({
  id: String(row.id),
  name: String(row.name),
  url: String(row.url),
  intervalHours: Number(row.interval_hours),
  active: Boolean(row.active),
  lastCheckedAt: row.last_checked_at ?? null,
  nextCheckAt: row.next_check_at ?? null,
  createdAt: String(row.created_at),
});

const mapEvent = (row: any): MonitoringEvent => ({
  id: String(row.id),
  targetId: String(row.target_id),
  eventType: String(row.event_type),
  severity: String(row.severity),
  changeScore: Number(row.change_score ?? 0),
  title: String(row.title),
  summary: String(row.summary),
  evidence: row.evidence ?? {},
  detectedAt: String(row.detected_at),
  acknowledgedAt: row.acknowledged_at ?? null,
});

export const listMonitoringTargets = createServerFn({ method: 'GET' }).middleware([requireAuth]).handler(async ({ context }) => {
  const { data, error } = await getDatabase().from('monitoring_targets').select('id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at').eq('user_id', context.userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTarget);
});

export const createMonitoringTarget = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { name: string; url: string; intervalHours?: number }) => input).handler(async ({ data, context }) => {
  const name = data.name.trim();
  const url = data.url.trim();
  if (!name || !url) throw new Error('اسم الموقع والرابط مطلوبان');
  const validation = validateTargetUrl(url);
  if (!validation.ok) throw new Error(validation.reason ?? 'الرابط غير صالح.');
  const safeUrl = validation.url;
  if (!safeUrl) throw new Error('الرابط غير صالح.');
  const hours = Math.min(Math.max(Math.round(data.intervalHours ?? 24), 1), 720);
  const db = getDatabase();
  const { data: existing, error: existingError } = await db.from('monitoring_targets').select('id').eq('user_id', context.userId).eq('url', safeUrl).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) throw new Error('هذا الموقع موجود بالفعل ضمن المراقبة.');
  const { data: row, error } = await db.from('monitoring_targets').insert({ user_id: context.userId, name, url: safeUrl, interval_hours: hours, active: true, next_check_at: new Date().toISOString() }).select('id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at').single();
  if (error) throw new Error(error.message);
  return mapTarget(row);
});

export const addDiscoveredCompetitorToMonitoring = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { competitorId: string; intervalHours?: number }) => input).handler(async ({ data, context }) => {
  const db = getDatabase();
  const { data: competitor, error: competitorError } = await db.from('competitors').select('id,name,url,verification_status').eq('id', data.competitorId).eq('user_id', context.userId).maybeSingle();
  if (competitorError) throw new Error(competitorError.message);
  if (!competitor) throw new Error('المنافس غير موجود.');
  if (String(competitor.verification_status) === 'lead') throw new Error('لا يمكن مراقبة منافس غير متحقق منه.');
  const safeUrl = String(competitor.url);
  const { data: existing, error: existingError } = await db.from('monitoring_targets').select('id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at').eq('user_id', context.userId).eq('url', safeUrl).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return mapTarget(existing);
  const hours = Math.min(Math.max(Math.round(data.intervalHours ?? 24), 1), 720);
  const { data: row, error } = await db.from('monitoring_targets').insert({ user_id: context.userId, name: String(competitor.name), url: safeUrl, interval_hours: hours, active: true, next_check_at: new Date().toISOString() }).select('id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at').single();
  if (error) throw new Error(error.message);
  return mapTarget(row);
});

export const deleteMonitoringTarget = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { id: string }) => input).handler(async ({ data, context }) => {
  const db = getDatabase();
  const { error: snapshotsError } = await db.from('monitoring_snapshots').delete().eq('target_id', data.id).eq('user_id', context.userId);
  if (snapshotsError) throw new Error(snapshotsError.message);
  const { error: eventsError } = await db.from('monitoring_events').delete().eq('target_id', data.id).eq('user_id', context.userId);
  if (eventsError) throw new Error(eventsError.message);
  const { error } = await db.from('monitoring_targets').delete().eq('id', data.id).eq('user_id', context.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const setMonitoringActive = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { id: string; active: boolean }) => input).handler(async ({ data, context }) => {
  const patch = data.active ? { active: true, next_check_at: new Date().toISOString() } : { active: false };
  const { error } = await getDatabase().from('monitoring_targets').update(patch).eq('id', data.id).eq('user_id', context.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const listMonitoringEvents = createServerFn({ method: 'GET' }).middleware([requireAuth]).inputValidator((input: { limit?: number }) => input ?? {}).handler(async ({ data, context }) => {
  const limit = Math.min(Math.max(data.limit ?? 50, 1), 100);
  const { data: rows, error } = await getDatabase().from('monitoring_events').select('id,target_id,event_type,severity,change_score,title,summary,evidence,detected_at,acknowledged_at').eq('user_id', context.userId).order('detected_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (rows ?? []).map(mapEvent);
});

export const acknowledgeMonitoringEvent = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { id: string }) => input).handler(async ({ data, context }) => {
  const { error } = await getDatabase().from('monitoring_events').update({ acknowledged_at: new Date().toISOString() }).eq('id', data.id).eq('user_id', context.userId);
  if (error) throw new Error(error.message);
  return { ok: true };
});

export const runMonitoringCheck = createServerFn({ method: 'POST' }).middleware([requireAuth]).inputValidator((input: { id: string }) => input).handler(async ({ data, context }): Promise<MonitoringCheck> => {
  const { data: target, error } = await getDatabase().from('monitoring_targets').select('id,name,url,interval_hours,active').eq('id', data.id).eq('user_id', context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) throw new Error('هدف المراقبة غير موجود.');
  const result = await executeMonitoringCheck({ id: String(target.id), userId: context.userId, name: String(target.name), url: String(target.url), intervalHours: Number(target.interval_hours) }, 'manual');
  if (!result.ok) throw new Error(`فشل فحص ${String(target.name)}: ${result.error ?? 'خطأ غير معروف.'}`);
  return {
    changed: result.changed,
    alertCreated: result.alertCreated,
    suppressedDuplicate: result.suppressedDuplicate,
    score: result.score,
    event: result.event ? mapEvent({
      id: result.event.id,
      target_id: result.event.targetId,
      event_type: result.event.eventType,
      severity: result.event.severity,
      change_score: result.event.changeScore,
      title: result.event.title,
      summary: result.event.summary,
      evidence: result.event.evidence,
      detected_at: result.event.detectedAt,
      acknowledged_at: result.event.acknowledgedAt,
    }) : null,
    checkedAt: result.checkedAt,
  };
});
