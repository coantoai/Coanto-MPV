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
  averageChangeScore: number;
  metrics: Array<{ key: string; value: number; unit: string }>;
  insights: IntelligenceInsightDraft[];
};

const changeTypes = new Set(['price-change', 'offer-change', 'product-change', 'messaging-change', 'title-change', 'structure-change', 'content-change']);

function confidence(count: number, averageScore: number) {
  if (!count) return 0;
  return Math.min(0.97, 0.55 + Math.min(count, 6) * 0.05 + Math.min(averageScore, 100) / 1000);
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

export function buildCompetitiveIntelligence(input: {
  events: IntelligenceEvent[];
  analysesCount: number;
  memoryItemsCount: number;
  decisionsCount: number;
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

  const metrics = [
    { key: 'analyses_30d', value: input.analysesCount, unit: 'count' },
    { key: 'monitoring_events_30d', value: input.events.length, unit: 'count' },
    { key: 'competitive_changes_30d', value: meaningfulEvents.length, unit: 'count' },
    { key: 'high_priority_changes_30d', value: highPriority.length, unit: 'count' },
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
  if (price.length) insights.push({
    title: 'تحرّك سعري لدى المنافسين',
    summary: `تم رصد ${price.length} تغيّر سعري موثّق خلال آخر 30 يومًا.`,
    category: 'pricing',
    impact: impactFrom(price),
    confidence: confidence(price.length, averageChangeScore),
    evidence: eventEvidence(price),
    recommendation: 'قارن اتجاه السعر مع عرضك وهوامشك قبل تغيير التسعير؛ لا تلاحق السعر منفردًا دون سياق المنتج والقيمة.',
  });
  if (offers.length) insights.push({
    title: 'نشاط ترويجي تنافسي',
    summary: `تم رصد ${offers.length} تغيير في الخصومات أو العروض لدى المنافسين.`,
    category: 'promotion',
    impact: impactFrom(offers),
    confidence: confidence(offers.length, averageChangeScore),
    evidence: eventEvidence(offers),
    recommendation: 'افحص مدة العرض وشروطه وتكراره قبل الرد؛ ميّز بين حملة مؤقتة وتغيير مستمر في استراتيجية العرض.',
  });
  if (products.length) insights.push({
    title: 'تغيّر في تشكيلة المنافسين',
    summary: `تم رصد ${products.length} إشارة مرتبطة بمنتجات أو مجموعات جديدة أو متغيرة.`,
    category: 'product',
    impact: impactFrom(products),
    confidence: confidence(products.length, averageChangeScore),
    evidence: eventEvidence(products),
    recommendation: 'راجع الفجوة بين التشكيلة الجديدة واحتياجات عميلك، ثم اختبر فرصة المنتج قبل توسيع المخزون.',
  });
  if (messaging.length) insights.push({
    title: 'تحوّل في تموضع أو رسالة المنافس',
    summary: `تم رصد ${messaging.length} تغيير في الرسائل التسويقية أو وصف القيمة.`,
    category: 'positioning',
    impact: impactFrom(messaging),
    confidence: confidence(messaging.length, averageChangeScore),
    evidence: eventEvidence(messaging),
    recommendation: 'قارن الرسالة الجديدة مع تموضعك الحالي وحدد إن كانت تستهدف نفس العميل أو حاجة جديدة قبل تعديل خطابك.',
  });
  if (!insights.length && meaningfulEvents.length) insights.push({
    title: 'السوق التنافسي يتحرك',
    summary: `تم رصد ${meaningfulEvents.length} تغيّر موثّق، بمتوسط أهمية ${averageChangeScore}/100.`,
    category: 'competition',
    impact: impactFrom(meaningfulEvents),
    confidence: confidence(meaningfulEvents.length, averageChangeScore),
    evidence: eventEvidence(meaningfulEvents),
    recommendation: 'ابدأ بالأحداث الأعلى أهمية، ثم اربط كل تغيير بأثر محتمل على السعر والمنتج والرسالة قبل اتخاذ القرار.',
  });
  if (!meaningfulEvents.length && input.analysesCount) insights.push({
    title: 'قاعدة التحليل جاهزة لكن لا توجد تغيّرات مؤكدة',
    summary: `يوجد ${input.analysesCount} تحليل محفوظ خلال آخر 30 يومًا بدون تغيّر تنافسي موثّق في الفترة نفسها.`,
    category: 'operations',
    impact: 'low',
    confidence: 0.75,
    evidence: [{ analysesCount: input.analysesCount, monitoringEvents: input.events.length }],
    recommendation: 'وسّع المراقبة على المنافسين الأساسيين واستمر بجمع snapshots لبناء خط زمني أقوى.',
  });

  return { meaningfulEvents, errors, highPriority, averageChangeScore, metrics, insights };
}
