import { hostname, type SiteSnapshot } from './analyze.server';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function enforceEvidence(analysis: unknown, main: SiteSnapshot, competitors: SiteSnapshot[]) {
  const result = record(analysis);
  const mainHost = hostname(main.url);
  const evidenceByHost = new Map(competitors.map((site) => [hostname(site.url), site]));
  const allowed = new Set(evidenceByHost.keys());
  const rows = Array.isArray(result['competitors']) ? result['competitors'] : [];
  result['competitors'] = rows.flatMap((row) => {
    const item = record(row);
    const url = typeof item['url'] === 'string' ? item['url'] : '';
    const candidate = hostname(url);
    const source = candidate ? evidenceByHost.get(candidate) : undefined;
    if (!candidate || candidate === mainHost || !allowed.has(candidate) || !source) return [];

    return [{
      ...item,
      url: source.url,
      evidenceSourceType: source.sourceType,
      evidence: [...source.evidence],
      evidenceNote: source.sourceType === 'direct-site'
        ? 'هذه المعلومة مرتبطة بقراءة مباشرة للموقع.'
        : 'هذه المعلومة مرتبطة بدليل مفهرس عام؛ لم يتم تجاوز حماية الموقع.',
    }];
  });

  const directEvidenceCount = competitors.filter((site) => site.sourceType === 'direct-site').reduce((count, site) => count + site.evidence.length, 0);
  const indexedEvidenceCount = competitors.filter((site) => site.sourceType === 'search-index').reduce((count, site) => count + site.evidence.length, 0);
  const evidenceCount = main.evidence.length + directEvidenceCount + indexedEvidenceCount;
  const evidenceStrength = evidenceCount >= 8 && indexedEvidenceCount <= Math.max(2, directEvidenceCount) ? 'high' : evidenceCount >= 4 ? 'medium' : 'low';

  const unknowns = Array.isArray(result['unknowns']) ? result['unknowns'].filter((value): value is string => typeof value === 'string') : [];
  result['unknowns'] = [...new Set([
    ...unknowns,
    ...(competitors.some((site) => site.sourceType === 'search-index') ? ['بعض المنافسين مبنيون على أدلة مفهرسة لأن الوصول المباشر غير متاح.'] : []),
    ...(evidenceCount < 4 ? ['قوة الدليل محدودة؛ يجب عدم تحويل هذه النتيجة إلى حقيقة مؤكدة.'] : []),
  ])];

  const trust = Array.isArray(result['trust']) ? result['trust'] : [];
  result['trust'] = [
    ...trust,
    { type: 'evidence-gate', status: 'passed', detail: 'تم حذف أي منافس لا يمكن ربطه بمجموعة الأدلة المكتشفة.' },
    { type: 'source-transparency', status: 'passed', detail: 'تم ربط كل منافس مقبول بمصدره الفعلي ونوع الدليل.' },
    { type: 'confidence-calibration', status: evidenceStrength === 'low' ? 'caution' : 'passed', detail: `قوة الثقة مشتقة من حجم الأدلة ونوعها: ${evidenceStrength}.` },
  ];

  result['metadata'] = {
    ...record(result['metadata']),
    evidenceGate: 'passed',
    evidenceCount,
    directEvidenceCount,
    indexedEvidenceCount,
    evidenceStrength,
    confidenceBasis: 'evidence-volume-and-source-type',
    provenanceAttached: true,
  };
  return result;
}
