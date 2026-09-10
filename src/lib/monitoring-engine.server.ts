import { createHash } from 'node:crypto';
import { fetchSite, validateTargetUrl } from './analyze.server';

export type MonitoringSnapshotInput = {
  contentHash: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  textExcerpt: string;
  checkedAt: string;
};

export type MonitoringChange = {
  changed: boolean;
  eventType: 'content-change' | 'title-change' | 'structure-change' | 'no-change';
  severity: 'low' | 'medium' | 'high';
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
};

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string) {
  const left = new Set(normalize(a).toLowerCase().split(' ').filter(Boolean));
  const right = new Set(normalize(b).toLowerCase().split(' ').filter(Boolean));
  if (!left.size && !right.size) return 1;
  const union = new Set([...left, ...right]);
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return union.size ? intersection / union.size : 1;
}

export async function captureMonitoringSnapshot(url: string): Promise<MonitoringSnapshotInput> {
  const validation = validateTargetUrl(url);
  if (!validation.ok || !validation.url) throw new Error(validation.reason || 'الرابط غير صالح.');
  const site = await fetchSite(validation.url);
  const canonical = [
    normalize(site.title),
    normalize(site.description),
    ...site.h1.map(normalize),
    ...site.h2.map(normalize),
    normalize(site.text),
  ].join('\n');
  return {
    contentHash: createHash('sha256').update(canonical).digest('hex'),
    title: site.title,
    description: site.description,
    h1: site.h1,
    h2: site.h2,
    textExcerpt: site.text.slice(0, 4000),
    checkedAt: new Date().toISOString(),
  };
}

export function detectMonitoringChange(previous: MonitoringSnapshotInput | null, current: MonitoringSnapshotInput): MonitoringChange {
  if (!previous) return { changed: false, eventType: 'no-change', severity: 'low', title: 'تم إنشاء خط الأساس', summary: 'تم حفظ أول نسخة مرجعية للمنافس.', evidence: { currentHash: current.contentHash } };
  if (previous.contentHash === current.contentHash) return { changed: false, eventType: 'no-change', severity: 'low', title: 'لا تغيير', summary: 'لم يتغير المحتوى منذ آخر فحص.', evidence: { previousHash: previous.contentHash, currentHash: current.contentHash } };

  const titleChanged = normalize(previous.title) !== normalize(current.title);
  const structureChanged = JSON.stringify(previous.h1) !== JSON.stringify(current.h1) || JSON.stringify(previous.h2) !== JSON.stringify(current.h2);
  const textSimilarity = similarity(previous.textExcerpt, current.textExcerpt);
  const severity: MonitoringChange['severity'] = titleChanged || textSimilarity < 0.55 ? 'high' : structureChanged || textSimilarity < 0.8 ? 'medium' : 'low';
  const eventType: MonitoringChange['eventType'] = titleChanged ? 'title-change' : structureChanged ? 'structure-change' : 'content-change';
  const changedParts = [titleChanged ? 'العنوان' : '', structureChanged ? 'هيكل الصفحة' : '', textSimilarity < 0.98 ? 'المحتوى' : ''].filter(Boolean);
  return {
    changed: true,
    eventType,
    severity,
    title: titleChanged ? 'تغيّر عنوان المنافس' : structureChanged ? 'تغيّر هيكل صفحة المنافس' : 'تغيّر محتوى المنافس',
    summary: changedParts.length ? `تم رصد تغيير في ${changedParts.join(' و')}.` : 'تم رصد تغيير موثّق في الصفحة.',
    evidence: {
      previousHash: previous.contentHash,
      currentHash: current.contentHash,
      previousCheckedAt: previous.checkedAt,
      currentCheckedAt: current.checkedAt,
      titleBefore: previous.title,
      titleAfter: current.title,
      textSimilarity: Number(textSimilarity.toFixed(4)),
    },
  };
}
