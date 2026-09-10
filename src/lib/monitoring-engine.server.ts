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

export type MonitoringEventType =
  | 'price-change'
  | 'offer-change'
  | 'product-change'
  | 'messaging-change'
  | 'title-change'
  | 'structure-change'
  | 'content-change'
  | 'no-change';

export type MonitoringChange = {
  changed: boolean;
  eventType: MonitoringEventType;
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

function extractPrices(text: string) {
  const matches = text.match(/(?:[$€£]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|EUR|GBP|AED|SAR))/gi) ?? [];
  return [...new Set(matches.map(normalize))].slice(0, 40);
}

function extractOffers(text: string) {
  const patterns = [
    /\b\d{1,2}%\s*(?:off|discount)\b/gi,
    /\b(?:sale|discount|promo|promotion|limited offer|free shipping|buy one get one|bogo)\b/gi,
  ];
  return [...new Set(patterns.flatMap((pattern)=>text.match(pattern)??[]).map((item)=>normalize(item).toLowerCase()))].slice(0, 40);
}

function symmetricDifference(a: string[], b: string[]) {
  const left=new Set(a),right=new Set(b);
  return [...a.filter((item)=>!right.has(item)),...b.filter((item)=>!left.has(item))];
}

function classifyBusinessChange(previous: MonitoringSnapshotInput, current: MonitoringSnapshotInput) {
  const beforeText=`${previous.title} ${previous.description} ${previous.h1.join(' ')} ${previous.h2.join(' ')} ${previous.textExcerpt}`;
  const afterText=`${current.title} ${current.description} ${current.h1.join(' ')} ${current.h2.join(' ')} ${current.textExcerpt}`;
  const beforePrices=extractPrices(beforeText),afterPrices=extractPrices(afterText);
  const priceDelta=symmetricDifference(beforePrices,afterPrices);
  if(priceDelta.length){
    return {eventType:'price-change' as const,severity:'high' as const,title:'تغيّر في الأسعار',summary:'تم رصد إضافة أو إزالة قيمة سعرية على صفحة المنافس.',details:{pricesBefore:beforePrices,pricesAfter:afterPrices,priceDelta}};
  }
  const beforeOffers=extractOffers(beforeText),afterOffers=extractOffers(afterText);
  const offerDelta=symmetricDifference(beforeOffers,afterOffers);
  if(offerDelta.length){
    return {eventType:'offer-change' as const,severity:'high' as const,title:'تغيّر في العرض الترويجي',summary:'تم رصد تغيير في خصم أو عرض ترويجي للمنافس.',details:{offersBefore:beforeOffers,offersAfter:afterOffers,offerDelta}};
  }
  const hDelta=symmetricDifference([...previous.h1,...previous.h2],[...current.h1,...current.h2]);
  const productTerms=/\b(product|products|collection|collections|new arrivals|launch|shop)\b/i;
  if(hDelta.some((item)=>productTerms.test(item))){
    return {eventType:'product-change' as const,severity:'medium' as const,title:'تغيّر في المنتجات أو التشكيلة',summary:'تم رصد تغيير هيكلي مرتبط بمنتجات أو مجموعات المنافس.',details:{headingDelta:hDelta.slice(0,20)}};
  }
  if(normalize(previous.description)!==normalize(current.description)){
    return {eventType:'messaging-change' as const,severity:'medium' as const,title:'تغيّر في الرسالة التسويقية',summary:'تم رصد تغيير في وصف أو تموضع رسالة المنافس.',details:{descriptionBefore:previous.description,descriptionAfter:current.description}};
  }
  return null;
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
  const business=classifyBusinessChange(previous,current);

  if (!business && !titleChanged && !structureChanged && textSimilarity >= 0.97) {
    return {
      changed: false,
      eventType: 'no-change',
      severity: 'low',
      title: 'تغيير ضوضائي تم تجاهله',
      summary: 'تغيّر الـhash لكن المحتوى الدلالي بقي شبه مطابق؛ لم يتم إنشاء تنبيه.',
      evidence: { previousHash: previous.contentHash, currentHash: current.contentHash, textSimilarity: Number(textSimilarity.toFixed(4)), noiseSuppressed: true },
    };
  }

  const severity: MonitoringChange['severity'] = business?.severity ?? (titleChanged || textSimilarity < 0.55 ? 'high' : structureChanged || textSimilarity < 0.8 ? 'medium' : 'low');
  const eventType: MonitoringEventType = business?.eventType ?? (titleChanged ? 'title-change' : structureChanged ? 'structure-change' : 'content-change');
  const title=business?.title ?? (titleChanged ? 'تغيّر عنوان المنافس' : structureChanged ? 'تغيّر هيكل صفحة المنافس' : 'تغيّر محتوى المنافس');
  const changedParts = [titleChanged ? 'العنوان' : '', structureChanged ? 'هيكل الصفحة' : '', textSimilarity < 0.98 ? 'المحتوى' : ''].filter(Boolean);
  return {
    changed: true,
    eventType,
    severity,
    title,
    summary: business?.summary ?? (changedParts.length ? `تم رصد تغيير في ${changedParts.join(' و')}.` : 'تم رصد تغيير موثّق في الصفحة.'),
    evidence: {
      previousHash: previous.contentHash,
      currentHash: current.contentHash,
      previousCheckedAt: previous.checkedAt,
      currentCheckedAt: current.checkedAt,
      titleBefore: previous.title,
      titleAfter: current.title,
      textSimilarity: Number(textSimilarity.toFixed(4)),
      ...(business?.details??{}),
    },
  };
}
