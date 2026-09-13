import { hostname, type SiteSnapshot } from './analyze.server';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function normalizeLabel(value: string) { return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function siteAliases(host: string, site: SiteSnapshot) {
  const root = host.split('.')[0]?.replace(/[-_]+/g, ' ') ?? '';
  const title = site.title.split(/[|–—:]/)[0]?.trim() ?? '';
  return [...new Set([host, root, title].map(normalizeLabel).filter((item) => item.length >= 3))];
}
function safeSourceUrls(value: unknown, allowedHosts: Set<string>, aiSources: Set<string>) {
  return stringList(value).filter((url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      return ['http:', 'https:'].includes(parsed.protocol) && (allowedHosts.has(host) || aiSources.has(parsed.toString()));
    } catch { return false; }
  });
}
function firstObject(value: unknown) { return objectList(value)[0] ?? {}; }
function cardFrom(row: Record<string, unknown>, fallbackTitle: string, fallbackDescription: string, fallbackLevel: string) {
  return {
    title: text(row['title']) || text(row['name']) || text(row['action']) || fallbackTitle,
    description: text(row['description']) || text(row['detail']) || text(row['why']) || text(row['recommendation']) || fallbackDescription,
    severity: text(row['severity']) || text(row['strength']) || text(row['priority']) || text(row['impact']) || fallbackLevel,
  };
}

/** Evidence gate for AI output. */
export function enforceEvidence(analysis: unknown, main: SiteSnapshot, competitors: SiteSnapshot[], aiSourceUrls: string[] = []) {
  const result = record(analysis);
  const mainHost = hostname(main.url);
  const evidenceByHost = new Map(competitors.map((site) => [hostname(site.url), site]));
  const allowed = new Set(evidenceByHost.keys());
  allowed.add(mainHost);
  const aiSources = new Set(aiSourceUrls.filter((url) => /^https?:\/\//i.test(url)).map((url) => { try { return new URL(url).toString(); } catch { return ''; } }).filter((url): url is string => Boolean(url)));

  const rows = Array.isArray(result['competitors']) ? result['competitors'] : [];
  result['competitors'] = rows.flatMap((row) => {
    const item = record(row);
    const url = text(item['url']);
    const candidate = hostname(url);
    const source = candidate ? evidenceByHost.get(candidate) : undefined;
    if (!candidate || candidate === mainHost || !allowed.has(candidate) || !source) return [];
    const grounded = source.evidence.some((entry) => entry.startsWith('Gemini Google Search grounded competitor candidate:'));
    return [{
      ...item,
      url: source.url,
      evidenceSourceType: source.sourceType,
      evidence: [...source.evidence],
      sourceUrls: safeSourceUrls(item['sourceUrls'], allowed, aiSources),
      evidenceNote: source.sourceType === 'direct-site'
        ? 'هذه المعلومة مرتبطة بقراءة مباشرة للموقع.'
        : grounded
          ? 'هذه المعلومة مرتبطة ببحث Google موثّق مع أدلة عامة؛ لم يتم تجاوز حماية الموقع.'
          : 'هذه المعلومة مرتبطة بدليل مفهرس عام؛ لم يتم تجاوز حماية الموقع.',
    }];
  });

  const directEvidenceCount = competitors.filter((site) => site.sourceType === 'direct-site').reduce((count, site) => count + site.evidence.length, 0);
  const indexedEvidenceCount = competitors.filter((site) => site.sourceType === 'search-index').reduce((count, site) => count + site.evidence.length, 0);
  const evidenceCount = main.evidence.length + directEvidenceCount + indexedEvidenceCount;
  const evidenceStrength = evidenceCount >= 8 && indexedEvidenceCount <= Math.max(2, directEvidenceCount) ? 'high' : evidenceCount >= 4 ? 'medium' : 'low';

  const signalRows = objectList(result['signals']);
  const checkedSignals = signalRows.map((row) => {
    const sourceUrls = safeSourceUrls(row['sourceUrls'], allowed, aiSources);
    const namedCompetitor = normalizeLabel(text(row['competitor']));
    const linkedCompetitor = Boolean(namedCompetitor) && [...evidenceByHost.entries()].some(([host, site]) => {
      if (!site.evidence.length) return false;
      return siteAliases(host, site).some((alias) => namedCompetitor === alias || (alias.length >= 4 && namedCompetitor.includes(alias)) || (namedCompetitor.length >= 4 && alias.includes(namedCompetitor)));
    });
    const evidenceStatus = sourceUrls.length > 0 || linkedCompetitor ? 'linked' : 'unlinked';
    return { ...row, sourceUrls, evidenceStatus };
  });
  const rejectedSignals = checkedSignals.filter((row) => row.evidenceStatus === 'unlinked');
  result['signals'] = checkedSignals.filter((row) => row.evidenceStatus === 'linked');

  const unknowns = Array.isArray(result['unknowns']) ? result['unknowns'].filter((value): value is string => typeof value === 'string') : [];
  result['unknowns'] = [...new Set([
    ...unknowns,
    ...(competitors.some((site) => site.sourceType === 'search-index') ? ['بعض المنافسين مبنيون على أدلة عامة من البحث لأن الوصول المباشر غير متاح.'] : []),
    ...(evidenceCount < 4 ? ['قوة الدليل محدودة؛ يجب عدم تحويل هذه النتيجة إلى حقيقة مؤكدة.'] : []),
    ...(rejectedSignals.length ? [`تم حجب ${rejectedSignals.length} إشارة لم تحمل رابط مصدر صالحًا أو ارتباطًا واضحًا بمنافس ذي أدلة.`] : []),
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
    evidenceGate: 'passed', evidenceCount, directEvidenceCount, indexedEvidenceCount, evidenceStrength,
    rejectedUnsupportedSignals: rejectedSignals.length,
    confidenceBasis: 'evidence-volume-and-source-type', provenanceAttached: true, claimLinkageChecked: true, aiTextAcceptedAsEvidence: false,
  };

  const filteredCompetitors = objectList(result['competitors']);
  const filteredSignals = objectList(result['signals']);
  result['snapshot'] = { ...record(result['snapshot']), competitorCount: filteredCompetitors.length, meaningfulSignals: filteredSignals.length, evidenceStrength };

  const existingPulse = record(result['decisionPulse']);
  const threatLevel = text(result['threat_level']) || 'medium';
  const opportunityLevel = text(result['opportunity_level']) || 'medium';
  const threat = firstObject(result['threats']);
  const opportunity = firstObject(result['opportunities']);
  const action = firstObject(result['action_plan'] ?? result['actions']);
  result['decisionPulse'] = {
    ...existingPulse,
    threat: Object.keys(record(existingPulse['threat'])).length ? record(existingPulse['threat']) : cardFrom(threat, 'لا يوجد تهديد حاسم بعد', 'راجع إشارات المنافسين قبل اتخاذ قرار دفاعي.', threatLevel),
    opportunity: Object.keys(record(existingPulse['opportunity'])).length ? record(existingPulse['opportunity']) : cardFrom(opportunity, 'لا توجد فرصة حاسمة بعد', 'استمر في مراقبة الفروقات القابلة للاستغلال.', opportunityLevel),
    action: Object.keys(record(existingPulse['action'])).length ? record(existingPulse['action']) : cardFrom(action, text(result['next_action']) || 'راجع أعلى أولوية', text(result['next_action']) || 'ابدأ بالإجراء الأعلى أولوية والأوضح دليلًا.', text(action['priority']) || 'medium'),
  };
  return result;
}
