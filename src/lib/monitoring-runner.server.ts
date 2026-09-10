import { createHash } from 'node:crypto';
import { getDatabase } from './database.server';
import { captureMonitoringSnapshot, detectMonitoringChange, type MonitoringSnapshotInput } from './monitoring-engine.server';

export type MonitoringRunTarget = {
  id: string;
  userId: string;
  name: string;
  url: string;
  intervalHours: number;
};

export type StoredMonitoringEvent = {
  id: string;
  targetId: string;
  eventType: string;
  severity: string;
  changeScore: number;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
  acknowledgedAt: string | null;
};

export type MonitoringRunResult = {
  id: string;
  ok: boolean;
  changed: boolean;
  alertCreated: boolean;
  suppressedDuplicate: boolean;
  eventType: string;
  severity: string;
  score: number;
  checkedAt: string;
  event: StoredMonitoringEvent | null;
  error?: string;
};

const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function mapSnapshot(row: any): MonitoringSnapshotInput | null {
  return row ? {
    contentHash: String(row.content_hash),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    h1: stringArray(row.h1),
    h2: stringArray(row.h2),
    textExcerpt: String(row.text_excerpt ?? ''),
    checkedAt: String(row.checked_at),
  } : null;
}

function mapEvent(row: any): StoredMonitoringEvent {
  return {
    id: String(row.id),
    targetId: String(row.target_id),
    eventType: String(row.event_type),
    severity: String(row.severity),
    changeScore: Number(row.change_score ?? 0),
    title: String(row.title),
    summary: String(row.summary),
    evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence as Record<string, unknown> : {},
    detectedAt: String(row.detected_at),
    acknowledgedAt: row.acknowledged_at ?? null,
  };
}

function dailyChangeKey(targetId: string, fingerprint: string, checkedAt: string) {
  return `${targetId}:${fingerprint}:${checkedAt.slice(0, 10)}`;
}

function errorKey(targetId: string, url: string, message: string, checkedAt: string) {
  const hash = createHash('sha256').update(`${url}\n${message}`, 'utf8').digest('hex').slice(0, 20);
  return `${targetId}:err_${hash}:${checkedAt.slice(0, 13)}`;
}

async function findDuplicate(userId: string, targetId: string, changeKey: string) {
  const { data, error } = await getDatabase().from('monitoring_events').select('id').eq('user_id', userId).eq('target_id', targetId).eq('change_key', changeKey).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function updateSchedule(target: MonitoringRunTarget, checkedAt: string) {
  const nextCheckAt = new Date(Date.parse(checkedAt) + target.intervalHours * 3_600_000).toISOString();
  const { error } = await getDatabase().from('monitoring_targets').update({ last_checked_at: checkedAt, next_check_at: nextCheckAt }).eq('id', target.id).eq('user_id', target.userId);
  if (error) throw new Error(error.message);
}

export async function executeMonitoringCheck(target: MonitoringRunTarget, trigger: 'manual' | 'scheduled'): Promise<MonitoringRunResult> {
  const db = getDatabase();
  try {
    const current = await captureMonitoringSnapshot(target.url);
    const { data: previous, error: previousError } = await db.from('monitoring_snapshots').select('id,content_hash,title,description,h1,h2,text_excerpt,checked_at').eq('target_id', target.id).eq('user_id', target.userId).order('checked_at', { ascending: false }).limit(1).maybeSingle();
    if (previousError) throw new Error(previousError.message);

    const change = detectMonitoringChange(mapSnapshot(previous), current);
    const { data: currentRow, error: snapshotError } = await db.from('monitoring_snapshots').insert({
      user_id: target.userId,
      target_id: target.id,
      content_hash: current.contentHash,
      title: current.title,
      description: current.description,
      h1: current.h1,
      h2: current.h2,
      text_excerpt: current.textExcerpt,
      checked_at: current.checkedAt,
    }).select('id').single();
    if (snapshotError) throw new Error(snapshotError.message);

    let event: StoredMonitoringEvent | null = null;
    let suppressedDuplicate = false;
    if (change.changed) {
      const changeKey = dailyChangeKey(target.id, change.fingerprint, current.checkedAt);
      suppressedDuplicate = await findDuplicate(target.userId, target.id, changeKey);
      if (!suppressedDuplicate) {
        const { data: row, error: eventError } = await db.from('monitoring_events').insert({
          user_id: target.userId,
          target_id: target.id,
          event_type: change.eventType,
          severity: change.severity,
          change_key: changeKey,
          change_score: change.score,
          previous_snapshot_id: previous?.id ?? null,
          current_snapshot_id: currentRow?.id ?? null,
          title: `${change.title}: ${target.name}`,
          summary: change.summary,
          evidence: { ...change.evidence, url: target.url, trigger },
          detected_at: current.checkedAt,
        }).select('id,target_id,event_type,severity,change_score,title,summary,evidence,detected_at,acknowledged_at').single();
        if (eventError) throw new Error(eventError.message);
        event = mapEvent(row);
      }
    }

    await updateSchedule(target, current.checkedAt);
    return {
      id: target.id,
      ok: true,
      changed: change.changed,
      alertCreated: Boolean(event),
      suppressedDuplicate,
      eventType: change.eventType,
      severity: change.severity,
      score: change.score,
      checkedAt: current.checkedAt,
      event,
    };
  } catch (error) {
    const checkedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'فشل فحص الموقع.';
    const changeKey = errorKey(target.id, target.url, message, checkedAt);
    let suppressedDuplicate = false;
    try {
      suppressedDuplicate = await findDuplicate(target.userId, target.id, changeKey);
      if (!suppressedDuplicate) {
        await db.from('monitoring_events').insert({
          user_id: target.userId,
          target_id: target.id,
          event_type: 'error',
          severity: 'high',
          change_key: changeKey,
          change_score: 100,
          title: `فشل فحص ${target.name}`,
          summary: message.slice(0, 500),
          evidence: { url: target.url, trigger },
          detected_at: checkedAt,
        });
      }
      await updateSchedule(target, checkedAt);
    } catch {
      // Preserve the original monitoring failure; persistence diagnostics should not mask it.
    }
    return {
      id: target.id,
      ok: false,
      changed: false,
      alertCreated: !suppressedDuplicate,
      suppressedDuplicate,
      eventType: 'error',
      severity: 'high',
      score: 100,
      checkedAt,
      event: null,
      error: message.slice(0, 500),
    };
  }
}
