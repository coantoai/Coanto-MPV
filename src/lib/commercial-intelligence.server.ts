import type { SiteSnapshot } from './analyze.server';

export type CommercialObservationKind =
  | 'price'
  | 'promotion'
  | 'availability'
  | 'assortment'
  | 'delivery'
  | 'loyalty'
  | 'positioning'
  | 'product'
  | 'other';

export type CommercialObservation = {
  kind: CommercialObservationKind;
  entity: string;
  title: string;
  detail: string;
  sourceUrl: string;
  sourceType: SiteSnapshot['sourceType'];
  evidence: string[];
};

export type CommercialEntitySnapshot = {
  name: string;
  url: string;
  sourceType: SiteSnapshot['sourceType'];
  observations: CommercialObservation[];
};

export type CommercialIntelligenceSnapshot = {
  target: CommercialEntitySnapshot;
  competitors: CommercialEntitySnapshot[];
  observations: CommercialObservation[];
  categories: Record<CommercialObservationKind, number>;
  coverage: {
    entitiesObserved: number;
    observations: number;
    directSources: number;
    indexedSources: number;
  };
};

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function entityName(site: SiteSnapshot) {
  const title = normalize(site.title || '');
  if (title) return title.split(/[|–—-]/)[0]?.trim() || title;
  try { return new URL(site.url).hostname.replace(/^www\./, ''); } catch { return site.url; }
}

function fullText(site: SiteSnapshot) {
  return normalize([
    site.title,
    site.description,
    ...site.h1,
    ...site.h2,
    site.text,
  ].filter(Boolean).join(' '));
}

function unique(values: string[], max = 10) {
  return [...new Set(values.map(normalize).filter(Boolean))].slice(0, max);
}

function matchAll(text: string, pattern: RegExp, max = 10) {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0]) values.push(match[0]);
    if (values.length >= max) break;
  }
  return unique(values, max);
}

function sentenceAround(text: string, token: string, radius = 120) {
  const lower = text.toLowerCase();
  const index = lower.indexOf(token.toLowerCase());
  if (index < 0) return '';
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + token.length + radius);
  return normalize(text.slice(start, end));
}

function evidenceFor(site: SiteSnapshot, detail: string) {
  return unique([
    detail,
    ...site.evidence,
  ].filter(Boolean), 4);
}

function observation(
  site: SiteSnapshot,
  entity: string,
  kind: CommercialObservationKind,
  title: string,
  detail: string,
): CommercialObservation {
  return {
    kind,
    entity,
    title,
    detail,
    sourceUrl: site.url,
    sourceType: site.sourceType,
    evidence: evidenceFor(site, detail),
  };
}

const CURRENCY_PATTERN = /(?:[$€£]|USD|US\$|EUR|GBP|AED|SAR|QAR|OMR|KWD|BHD|LBP|ر\.?س|د\.?إ|ل\.?ل)\s*\d[\d.,]*|\d[\d.,]*\s*(?:USD|EUR|GBP|AED|SAR|QAR|OMR|KWD|BHD|LBP)/gi;
const PROMO_PATTERN = /\b(?:sale|discount|promotion|promo|offer|offers|deal|deals|save|coupon|voucher|clearance|free shipping|buy one get one|bogo)\b|(?:خصم|تخفيض|عرض|عروض|وفر|توفير|قسيمة|شحن مجاني|اشتر\s*واحد)/gi;
const AVAILABILITY_PATTERN = /\b(?:in stock|out of stock|sold out|available|unavailable|back in stock|pre-?order)\b|(?:متوفر|غير متوفر|نفد|نافد|متاح|طلب مسبق)/gi;
const DELIVERY_PATTERN = /\b(?:same day delivery|next day delivery|delivery|shipping|click and collect|pickup|pick up|express delivery)\b|(?:توصيل|شحن|استلام|توصيل سريع|استلام من الفرع)/gi;
const LOYALTY_PATTERN = /\b(?:loyalty|rewards?|points|membership|member price|club price)\b|(?:ولاء|مكافآت|نقاط|عضوية|سعر الأعضاء)/gi;
const ASSORTMENT_PATTERN = /\b(?:new arrivals?|new products?|collection|collections|category|categories|range|assortment|private label|exclusive|brand new)\b|(?:منتجات جديدة|وصل حديثاً|وصل حديثا|تشكيلة|مجموعة|فئة|فئات|علامة خاصة|حصري)/gi;
const POSITIONING_PATTERN = /\b(?:premium|value|affordable|luxury|organic|sustainable|local|fresh|healthy|low price|best price)\b|(?:فاخر|اقتصادي|عضوي|مستدام|محلي|طازج|صحي|أفضل سعر|اقل سعر|أقل سعر)/gi;

export function extractCommercialObservations(site: SiteSnapshot): CommercialObservation[] {
  const text = fullText(site);
  const entity = entityName(site);
  const rows: CommercialObservation[] = [];

  const prices = matchAll(text, CURRENCY_PATTERN, 12);
  if (prices.length) {
    rows.push(observation(site, entity, 'price', 'أسعار عامة مرصودة', `قيم سعرية ظاهرة في المصدر: ${prices.join(' · ')}`));
  }

  const promotions = matchAll(text, PROMO_PATTERN, 8);
  if (promotions.length) {
    const detail = promotions.map((token) => sentenceAround(text, token, 90) || token).slice(0, 4).join(' | ');
    rows.push(observation(site, entity, 'promotion', 'عروض أو ترويج ظاهر', detail));
  }

  const availability = matchAll(text, AVAILABILITY_PATTERN, 8);
  if (availability.length) {
    const detail = availability.map((token) => sentenceAround(text, token, 90) || token).slice(0, 4).join(' | ');
    rows.push(observation(site, entity, 'availability', 'إشارات توفر أو نفاد', detail));
  }

  const delivery = matchAll(text, DELIVERY_PATTERN, 8);
  if (delivery.length) {
    const detail = delivery.map((token) => sentenceAround(text, token, 90) || token).slice(0, 4).join(' | ');
    rows.push(observation(site, entity, 'delivery', 'شروط أو خدمة توصيل مرصودة', detail));
  }

  const loyalty = matchAll(text, LOYALTY_PATTERN, 8);
  if (loyalty.length) {
    const detail = loyalty.map((token) => sentenceAround(text, token, 90) || token).slice(0, 4).join(' | ');
    rows.push(observation(site, entity, 'loyalty', 'برنامج ولاء أو مزايا أعضاء', detail));
  }

  const assortment = matchAll(text, ASSORTMENT_PATTERN, 10);
  if (assortment.length) {
    const detail = assortment.map((token) => sentenceAround(text, token, 100) || token).slice(0, 5).join(' | ');
    rows.push(observation(site, entity, 'assortment', 'تشكيلة أو فئات مرصودة', detail));
  }

  const positioning = matchAll(text, POSITIONING_PATTERN, 8);
  if (positioning.length) {
    const detail = positioning.map((token) => sentenceAround(text, token, 90) || token).slice(0, 4).join(' | ');
    rows.push(observation(site, entity, 'positioning', 'رسائل تموضع تجاري', detail));
  }

  const headings = unique([...site.h1, ...site.h2], 12);
  if (headings.length) {
    rows.push(observation(site, entity, 'product', 'عناوين منتجات أو أقسام بارزة', headings.join(' · ')));
  }

  return rows.slice(0, 12);
}

function entitySnapshot(site: SiteSnapshot): CommercialEntitySnapshot {
  return {
    name: entityName(site),
    url: site.url,
    sourceType: site.sourceType,
    observations: extractCommercialObservations(site),
  };
}

export function buildCommercialIntelligence(main: SiteSnapshot, competitors: SiteSnapshot[]): CommercialIntelligenceSnapshot {
  const target = entitySnapshot(main);
  const competitorSnapshots = competitors.map(entitySnapshot);
  const observations = [target, ...competitorSnapshots].flatMap((item) => item.observations);
  const categories: Record<CommercialObservationKind, number> = {
    price: 0,
    promotion: 0,
    availability: 0,
    assortment: 0,
    delivery: 0,
    loyalty: 0,
    positioning: 0,
    product: 0,
    other: 0,
  };
  for (const item of observations) categories[item.kind] += 1;
  const entities = [main, ...competitors];
  return {
    target,
    competitors: competitorSnapshots,
    observations,
    categories,
    coverage: {
      entitiesObserved: entities.length,
      observations: observations.length,
      directSources: entities.filter((item) => item.sourceType === 'direct-site').length,
      indexedSources: entities.filter((item) => item.sourceType === 'search-index').length,
    },
  };
}

export function commercialIntelligenceForPrompt(snapshot: CommercialIntelligenceSnapshot) {
  const rows = snapshot.observations.slice(0, 40).map((item, index) => [
    `${index + 1}. ENTITY: ${item.entity}`,
    `KIND: ${item.kind}`,
    `OBSERVATION: ${item.title}`,
    `DETAIL: ${item.detail}`,
    `SOURCE: ${item.sourceUrl}`,
    `SOURCE TYPE: ${item.sourceType}`,
  ].join('\n'));

  return [
    'COMMERCIAL OBSERVATIONS EXTRACTED FROM CURRENT PUBLIC SOURCES:',
    ...rows,
    '',
    'Use these observations as raw evidence, not as proof of business impact. Do not infer sales, margin, market share, traffic, or inventory levels unless separately sourced.',
    'When a useful commercial claim is unsupported, say it is unknown rather than filling the gap.',
  ].join('\n');
}
