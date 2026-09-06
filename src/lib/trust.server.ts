import { hostname, type SiteSnapshot } from './analyze.server';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function enforceEvidence(analysis: unknown, main: SiteSnapshot, competitors: SiteSnapshot[]) {
  const result = record(analysis);
  const mainHost = hostname(main.url);
  const allowed = new Set(competitors.map((site) => hostname(site.url)));
  const rows = Array.isArray(result['competitors']) ? result['competitors'] : [];
  result['competitors'] = rows.filter((row) => {
    const item = record(row);
    const url = typeof item['url'] === 'string' ? item['url'] : '';
    const candidate = hostname(url);
    return candidate && candidate !== mainHost && allowed.has(candidate);
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
    { type: 'source-transparency', status: 'passed', detail: 'تم الحفاظ على الفرق بين الزيارة المباشرة والدليل المفهرس.' },
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
  };
  return result;
}
