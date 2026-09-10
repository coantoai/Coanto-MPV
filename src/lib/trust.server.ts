import { hostname, type SiteSnapshot } from './analyze.server';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function safeSourceUrls(value: unknown, allowedHosts: Set<string>, aiSources: Set<string>) {
  return stringList(value).filter((url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      return ['http:', 'https:'].includes(parsed.protocol) && (allowedHosts.has(host) || aiSources.has(parsed.toString()));
    } catch {
      return false;
    }
  });
}

/**
 * Evidence gate for AI output.
 *
 * Factual competitor signals survive only when they can be linked to an allowed
 * source URL or to a competitor that has collected source evidence. Free-form AI
 * text is never accepted as evidence by itself.
 */
export function enforceEvidence(analysis: unknown, main: SiteSnapshot, competitors: SiteSnapshot[], aiSourceUrls: string[] = []) {
  const result = record(analysis);
  const mainHost = hostname(main.url);
  const evidenceByHost = new Map(competitors.map((site) => [hostname(site.url), site]));
  const allowed = new Set(evidenceByHost.keys());
  allowed.add(mainHost);
  const aiSources = new Set(aiSourceUrls.filter((url) => /^https?:\/\//i.test(url)).map((url) => {
    try { return new URL(url).toString(); } catch { return ''; }
  }).filter((url): url is string => Boolean(url)));

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
      sourceUrls: safeSourceUrls(item['sourceUrls'], allowed, aiSources),
      evidenceNote: source.sourceType === 'direct-site'
        ? 'هذه المعلومة مرتبطة بقراءة مباشرة للموقع.'
        : 'هذه المعلومة مرتبطة بدليل مفهرس عام؛ لم يتم تجاوز حماية الموقع.',
    }];
  });

  const directEvidenceCount = competitors.filter((site) => site.sourceType === 'direct-site').reduce((count, site) => count + site.evidence.length, 0);
  const indexedEvidenceCount = competitors.filter((site) => site.sourceType === 'search-index').reduce((count, site) => count + site.evidence.length, 0);
  const evidenceCount = main.evidence.length + directEvidenceCount + indexedEvidenceCount;
  const evidenceStrength = evidenceCount >= 8 && indexedEvidenceCount <= Math.max(2, directEvidenceCount) ? 'high' : evidenceCount >= 4 ? 'medium' : 'low';

  const signalRows = Array.isArray(result['signals']) ? result['signals'] : [];
  const checkedSignals = signalRows.map((row) => {
    const item = record(row);
    const sourceUrls = safeSourceUrls(item['sourceUrls'], allowed, aiSources);
    const competitor = typeof item['competitor'] === 'string' ? item['competitor'].trim().toLowerCase() : '';
    const linkedCompetitor = Boolean(competitor) && [...evidenceByHost.entries()].some(([host, site]) => {
      if (!site.evidence.length) return false;
      return competitor.includes(host) || competitor.includes(site.title.toLowerCase());
    });
    const evidenceStatus = sourceUrls.length > 0 || linkedCompetitor ? 'linked' : 'unlinked';
    return { ...item, sourceUrls, evidenceStatus };
  });
  const rejectedSignals = checkedSignals.filter((row) => row.evidenceStatus === 'unlinked');
  result['signals'] = checkedSignals.filter((row) => row.evidenceStatus === 'linked');

  const unknowns = Array.isArray(result['unknowns']) ? result['unknowns'].filter((value): value is string => typeof value === 'string') : [];
  result['unknowns'] = [...new Set([
    ...unknowns,
    ...(competitors.some((site) => site.sourceType === 'search-index') ? ['بعض المنافسين مبنيون على أدلة مفهرسة لأن الوصول المباشر غير متاح.'] : []),
    ...(evidenceCount < 4 ? ['قوة الدليل محدودة؛ يجب عدم تحويل هذه النتيجة إلى حقيقة مؤكدة.'] : []),
    ...(rejectedSignals.length ? [`تم حجب ${rejectedSignals.length} إشارة لم تحمل رابط مصدر صالحًا أو ارتباطًا بمنافس ذي أدلة.`] : []),
  ])];

  const trust = Array.isArray(result['trust']) ? result['trust'] : [];
  result['trust'] = [
    ...trust,
    { type: 'evidence-gate', status: 'passed', detail: 'تم حذف أي منافس لا يمكن ربطه بمجموعة الأدلة المكتشفة.' },
    { type: 'source-transparency', status: 'passed', detail: 'تم تنظيف روابط المصادر وربطها بالمصادر المسموح بها.' },
    { type: 'claim-linkage', status: rejectedSignals.length ? 'caution' : 'passed', detail: rejectedSignals.length ? `تم حجب ${rejectedSignals.length} إشارة غير مدعومة.` : 'كل الإشارات المعروضة مرتبطة بمصدر أو منافس ذي دليل.' },
    { type: 'confidence-calibration', status: evidenceStrength === 'low' ? 'caution' : 'passed', detail: `قوة الثقة مشتقة من حجم الأدلة ونوعها: ${evidenceStrength}.` },
  ];

  result['metadata'] = {
    ...record(result['metadata']),
    evidenceGate: 'passed',
    evidenceCount,
    directEvidenceCount,
    indexedEvidenceCount,
    evidenceStrength,
    rejectedUnsupportedSignals: rejectedSignals.length,
    confidenceBasis: 'evidence-volume-and-source-type',
    provenanceAttached: true,
    claimLinkageChecked: true,
    aiTextAcceptedAsEvidence: false,
  };
  return result;
}
