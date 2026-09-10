export type IntelligenceEvent = {
  id: string;
  eventType: string;
  severity: string;
  changeScore: number;
  title: string;
  summary: string;
  evidence: unknown;
  detectedAt: string;
  targetId: string;
};

export type IntelligenceBusinessContext = {
  businessName?: string;
  primaryMarket?: string;
  competitiveGoals?: string[];
};

export type IntelligencePattern = {
  eventType: string;
  distinctTargets: number;
  eventCount: number;
  averageScore: number;
  eventIds: string[];
};

export type IntelligenceInsightDraft = {
  title: string;
  summary: string;
  category: 'pricing' | 'promotion' | 'product' | 'positioning' | 'competition' | 'operations';
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  evidence: Array<Record<string, unknown>>;
  recommendation: string;
};

export type IntelligenceResult = {
  meaningfulEvents: IntelligenceEvent[];
  errors: IntelligenceEvent[];
  highPriority: IntelligenceEvent[];
  patterns: IntelligencePattern[];
  averageChangeScore: number;
  metrics: Array<{ key: string; value: number; unit: string }>;
  insights: IntelligenceInsightDraft[];
};

const changeTypes = new Set(['change', 'price-change', 'offer-change', 'product-change', 'messaging-change', 'title-change', 'structure-change', 'content-change']);

function confidence(count: number, averageScore: number, distinctTargets = 1) {
  if (!count) return 0;
  const corroborationBonus = Math.min(Math.max(distinctTargets - 1, 0), 3) * 0.04;
  return Math.min(0.97, 0.55 + Math.min(count, 6) * 0.05 + Math.min(averageScore, 100) / 1000 + corroborationBonus);
}

function eventEvidence(events: IntelligenceEvent[], limit = 5) {
  return events.slice(0, limit).map((event) => ({
    eventId: event.id,
    targetId: event.targetId,
    eventType: event.eventType,
    changeScore: event.changeScore,
    detectedAt: event.detectedAt,
    title: event.title,
    evidence: event.evidence,
  }));
}

function impactFrom(events: IntelligenceEvent[]): IntelligenceInsightDraft['impact'] {
  const peak = Math.max(0, ...events.map((event) => event.changeScore));
  return peak >= 85 ? 'high' : peak >= 60 ? 'medium' : 'low';
}

function buildPatterns(events: IntelligenceEvent[]): IntelligencePattern[] {
  const groups = new Map<string, IntelligenceEvent[]>();
  for (const event of events) {
    const type = event.eventType === 'change' ? 'content-change' : event.eventType;
    groups.set(type, [...(groups.get(type) ?? []), event]);
  }
  return [...groups.entries()].flatMap(([eventType, group]) => {
    const targets = new Set(group.map((event) => event.targetId));
    if (targets.size < 2) return [];
    const averageScore = Math.round(group.reduce((sum, event) => sum + event.changeScore, 0) / group.length);
    return [{ eventType, distinctTargets: targets.size, eventCount: group.length, averageScore, eventIds: group.map((event) => event.id).slice(0, 20) }];
  }).sort((a, b) => b.averageScore - a.averageScore || b.distinctTargets - a.distinctTargets);
}

function contextSuffix(context?: IntelligenceBusinessContext) {
  const market = context?.primaryMarket?.trim();
  const goals = context?.competitiveGoals?.filter(Boolean).slice(0, 3) ?? [];
  if (!market && !goals.length) return '';
  return ` سياق القرار: ${market ? `السوق الأساسي ${market}` : ''}${market && goals.length ? '، ' : ''}${goals.length ? `والأهداف ${goals.join('، ')}` : ''}. هذا السياق للتخصيص وليس دليلاً سوقياً.`;
}

export function buildCompetitiveIntelligence(input: {
  events: IntelligenceEvent[];
  analysesCount: number;
  memoryItemsCount: number;
  decisionsCount: number;
  businessContext?: IntelligenceBusinessContext;
}): IntelligenceResult {
  const meaningfulEvents = input.events.filter((event) => changeTypes.has(event.eventType));
  const errors = input.events.filter((event) => event.eventType === 'error');
  const highPriority = meaningfulEvents.filter((event) => event.changeScore >= 85 || event.severity === 'high');
  const averageChangeScore = meaningfulEvents.length ? Math.round(meaningfulEvents.reduce((sum, event) => sum + event.changeScore, 0) / meaningfulEvents.length) : 0;
  const byType = (type: string) => meaningfulEvents.filter((event) => event.eventType === type);
  const price = byType('price-change');
  const offers = byType('offer-change');
  const products = byType('product-change');
  const messaging = byType('messaging-change');
  const patterns = buildPatterns(meaningfulEvents);
  const suffix = contextSuffix(input.businessContext);

  const metrics = [
    { key: 'analyses_30d', value: input.analysesCount, unit: 'count' },
    { key: 'monitoring_events_30d', value: input.events.length, unit: 'count' },
    { key: 'competitive_changes_30d', value: meaningfulEvents.length, unit: 'count' },
    { key: 'high_priority_changes_30d', value: highPriority.length, unit: 'count' },
    { key: 'cross_competitor_patterns_30d', value: patterns.length, unit: 'count' },
    { key: 'price_changes_30d', value: price.length, unit: 'count' },
    { key: 'offer_changes_30d', value: offers.length, unit: 'count' },
    { key: 'product_changes_30d', value: products.length, unit: 'count' },
    { key: 'messaging_changes_30d', value: messaging.length, unit: 'count' },
    { key: 'monitoring_errors_30d', value: errors.length, unit: 'count' },
    { key: 'average_change_score_30d', value: averageChangeScore, unit: 'score/100' },
    { key: 'memory_items_30d', value: input.memoryItemsCount, unit: 'count' },
    { key: 'decisions_30d', value: input.decisionsCount, unit: 'count' },
  ];

  const insights: IntelligenceInsightDraft[] = [];
  if (price.length) {
    const targets = new Set(price.map((event) => event.targetId)).size;
    insights.push({
      title: targets >= 2 ? 'نمط سعري عبر عدة منافسين' : 'تحرّك سعري لدى منافس',
      summary: `تم رصد ${price.length} تغيّر سعري موثّق عبر ${targets} منافس/منافسين خلال آخر 30 يومًا.`,
      category: 'pricing',
      impact: impactFrom(price),
      confidence: confidence(price.length, averageChangeScore, targets),
      evidence: eventEvidence(price),
      recommendation: `قارن اتجاه السعر مع عرضك وهوامشك قبل تغيير التسعير؛ لا تلاحق السعر منفردًا دون سياق المنتج والقيمة.${suffix}`,
    });
  }
  if (offers.length) {
    const targets = new Set(offers.map((event) => event.targetId)).size;
    insights.push({
      title: targets >= 2 ? 'موجة عروض عبر عدة منافسين' : 'نشاط ترويجي تنافسي',
      summary: `تم رصد ${offers.length} تغيير في الخصومات أو العروض عبر ${targets} منافس/منافسين.`,
      category: 'promotion',
      impact: impactFrom(offers),
      confidence: confidence(offers.length, averageChangeScore, targets),
      evidence: eventEvidence(offers),
      recommendation: `افحص مدة العرض وشروطه وتكراره قبل الرد؛ ميّز بين حملة مؤقتة وتغيير مستمر في استراتيجية العرض.${suffix}`,
    });
  }
  if (products.length) {
    const targets = new Set(products.map((event) => event.targetId)).size;
    insights.push({
      title: targets >= 2 ? 'نمط تغيّر في التشكيلة عبر السوق' : 'تغيّر في تشكيلة منافس',
      summary: `تم رصد ${products.length} إشارة مرتبطة بمنتجات أو مجموعات عبر ${targets} منافس/منافسين.`,
      category: 'product',
      impact: impactFrom(products),
      confidence: confidence(products.length, averageChangeScore, targets),
      evidence: eventEvidence(products),
      recommendation: `راجع الفجوة بين التشكيلة الجديدة واحتياجات عميلك، ثم اختبر فرصة المنتج قبل توسيع المخزون.${suffix}`,
    });
  }
  if (messaging.length) {
    const targets = new Set(messaging.map((event) => event.targetId)).size;
    insights.push({
      title: targets >= 2 ? 'تحوّل رسائل عبر عدة منافسين' : 'تحوّل في تموضع أو رسالة منافس',
      summary: `تم رصد ${messaging.length} تغيير في الرسائل التسويقية أو وصف القيمة عبر ${targets} منافس/منافسين.`,
      category: 'positioning',
      impact: impactFrom(messaging),
      confidence: confidence(messaging.length, averageChangeScore, targets),
      evidence: eventEvidence(messaging),
      recommendation: `قارن الرسالة الجديدة مع تموضعك الحالي وحدد إن كانت تستهدف نفس العميل أو حاجة جديدة قبل تعديل خطابك.${suffix}`,
    });
  }
  if (!insights.length && meaningfulEvents.length) insights.push({
    title: patterns.length ? 'نمط تنافسي متكرر يحتاج مراجعة' : 'السوق التنافسي يتحرك',
    summary: `تم رصد ${meaningfulEvents.length} تغيّر موثّق، بمتوسط أهمية ${averageChangeScore}/100${patterns.length ? `، منها ${patterns.length} نمط عبر أكثر من منافس` : ''}.`,
    category: 'competition',
    impact: impactFrom(meaningfulEvents),
    confidence: confidence(meaningfulEvents.length, averageChangeScore, new Set(meaningfulEvents.map((event) => event.targetId)).size),
    evidence: eventEvidence(meaningfulEvents),
    recommendation: `ابدأ بالأحداث الأعلى أهمية، ثم اربط كل تغيير بأثر محتمل على السعر والمنتج والرسالة قبل اتخاذ القرار.${suffix}`,
  });
  if (!meaningfulEvents.length && input.analysesCount) insights.push({
    title: 'قاعدة التحليل جاهزة لكن لا توجد تغيّرات مؤكدة',
    summary: `يوجد ${input.analysesCount} تحليل محفوظ خلال آخر 30 يومًا بدون تغيّر تنافسي موثّق في الفترة نفسها.`,
    category: 'operations',
    impact: 'low',
    confidence: 0.75,
    evidence: [{ analysesCount: input.analysesCount, monitoringEvents: input.events.length }],
    recommendation: `وسّع المراقبة على المنافسين الأساسيين واستمر بجمع snapshots لبناء خط زمني أقوى.${suffix}`,
  });

  return { meaningfulEvents, errors, highPriority, patterns, averageChangeScore, metrics, insights };
}
