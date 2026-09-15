import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1)).max(30);
const competitor = z.object({
  name: z.string().trim().min(1).max(160), url: z.string().trim().min(1).max(2048),
  why: z.string().trim().max(1200).optional(), note: z.string().trim().max(1200).optional(),
  evidence: z.union([z.string().trim().max(2000), stringList]).optional(), sourceUrls: stringList.optional(),
  relevance: z.number().finite().optional(), impact: z.number().finite().optional(), threat: z.string().trim().max(32).optional(),
}).passthrough();
const objectList = z.array(z.record(z.unknown())).max(40);
const analysisSchema = z.object({
  competitors: z.array(competitor).max(20), signals: objectList,
  priority_matrix: objectList.optional(), priorityMatrix: objectList.optional(), threats: objectList.optional(), opportunities: objectList.optional(),
  scenarios: objectList, action_plan: objectList.optional(), actions: objectList.optional(), trust: objectList,
  unknowns: z.array(z.string().trim().min(1).max(1000)).max(40), summary: z.unknown().optional(), next_action: z.unknown().optional(),
  decisionPulse: z.unknown().optional(), snapshot: z.unknown().optional(), beforeAfter: objectList.optional(), impact: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(), threat_level: z.unknown().optional(), opportunity_level: z.unknown().optional(),
}).passthrough();

const internalProductResearchPatterns = [
  /\bcoanto\b/i,
  /\bproduct[- ]market fit\b/i,
  /\bpmf\b/i,
  /\bwillingness[- ]to[- ]pay\b/i,
  /\bmerchant(?:s)?\s+(?:are\s+)?willing\s+to\s+pay\b/i,
  /\bpay\s+for\s+(?:a\s+|the\s+)?(?:competitor|competitive)\s+(?:analysis|intelligence)\s+(?:tool|platform|service)\b/i,
  /\btechnical\s+requirements?\s+(?:for|of)\s+(?:a\s+|the\s+)?(?:competitor|competitive).*(?:tool|platform|scraper|system)\b/i,
  /\b(?:scraping|data extraction)\s+(?:feasibility|architecture|pipeline)\b/i,
  /\bpilot\s+(?:recruitment|design|validation)\b/i,
  /مدى\s+تقب[ّ]?ل.*الدفع/i,
  /استعداد.*للدفع/i,
  /أصحاب\s+المتاجر.*الدفع/i,
  /المتطلبات\s+التقنية.*(?:أداة|منصة).*المنافس/i,
  /هيكلية\s+المواقع.*استخراج\s+البيانات/i,
  /بنية\s+المواقع.*استخراج\s+البيانات/i,
  /القيود\s+(?:القانونية\s+و)?التقنية.*استخراج\s+البيانات/i,
  /ملاءمة\s+المنتج\s+للسوق/i,
];

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}
function objectValue(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function customerFacingText(value: unknown, key = ''): string {
  if (/url|source/i.test(key)) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => customerFacingText(item, key)).join(' ');
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([childKey, child]) => customerFacingText(child, childKey)).join(' ');
  return '';
}
export function containsInternalProductResearch(value: unknown) {
  const text = customerFacingText(value).replace(/\s+/g, ' ').trim();
  return Boolean(text && internalProductResearchPatterns.some((pattern) => pattern.test(text)));
}
function commercialRecords(value: unknown) {
  return objectArray(value).filter((item) => !containsInternalProductResearch(item));
}
function commercialUnknowns(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()) && !containsInternalProductResearch(item)).map((item) => item.trim()).slice(0, 40)
    : [];
}
function normalizeCompetitor(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim()) return { name: value.trim(), url: value.trim() };
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const name = stringValue(item['name']);
  const url = stringValue(item['url']) || stringValue(item['domain']);
  if (!name || !url) return null;
  const why = stringValue(item['why']);
  const note = stringValue(item['note']) || why;
  return { ...item, name, url, ...(why ? { why } : {}), ...(note ? { note } : {}) };
}
function normalizeSignal(item: Record<string, unknown>) {
  const detail = stringValue(item['detail']) || stringValue(item['description']);
  const urls = Array.isArray(item['sourceUrls']) ? item['sourceUrls'].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())) : [];
  const evidence = stringValue(item['evidence']) || urls[0] || stringValue(item['confidence']);
  return { ...item, ...(detail ? { detail } : {}), ...(evidence ? { evidence } : {}) };
}
function normalizeMatrixItem(item: Record<string, unknown>) {
  const raw = stringValue(item['zone']) || stringValue(item['bucket']) || stringValue(item['quadrant']);
  const key = raw.toLowerCase().replace(/[_\s]+/g, '-');
  const zone = /^(do-now|now|execute-now|execute|act|نفذ|نفّذ|نفذ-الآن|نفّذ-الآن)$/.test(key) ? 'do-now'
    : /^(test|pilot|experiment|اختبر)$/.test(key) ? 'test'
    : /^(monitor|monitor-watch|watch|observe|راقب)$/.test(key) ? 'monitor'
    : /^(ignore|تجاهل)$/.test(key) ? 'ignore'
    : raw;
  return { ...item, ...(zone ? { zone } : {}) };
}
function normalizeAction(item: Record<string, unknown>) {
  const timing = stringValue(item['timing']) || stringValue(item['when']) || stringValue(item['phase']);
  const normalizedTiming = timing.toLowerCase();
  const when = normalizedTiming.includes('today') || normalizedTiming.includes('اليوم') ? 'today'
    : normalizedTiming.includes('week') || normalizedTiming.includes('أسبوع') || normalizedTiming.includes('اسبوع') ? 'week'
    : normalizedTiming.includes('month') || normalizedTiming.includes('later') || normalizedTiming.includes('لاحق') ? 'later'
    : timing;
  return { ...item, ...(timing ? { timing } : {}), ...(when ? { when } : {}) };
}
function pulseItem(item: Record<string, unknown> | undefined, level: unknown) {
  if (!item) return undefined;
  const severity = stringValue(item['severity']) || stringValue(item['strength']) || stringValue(item['priority']) || stringValue(level);
  return { ...item, ...(severity ? { severity } : {}) };
}
function nextActionItem(value: unknown, actions: Record<string, unknown>[]) {
  if (containsInternalProductResearch(value)) return actions[0];
  const object = objectValue(value);
  if (object) return object;
  const title = stringValue(value);
  if (title) return { title };
  return actions[0];
}

/** Validates the model contract without inventing business facts. Internal COANTO/product research is removed before customer-facing projection. */
export function validateAiOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('AI output is not a JSON object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw['competitors'])) throw new Error('AI output is missing the competitors array.');
  const competitors = raw['competitors'].map(normalizeCompetitor).filter((item): item is Record<string, unknown> => Boolean(item));
  if (!competitors.length) throw new Error('AI output contains no valid competitor rows.');

  const signals = commercialRecords(raw['signals']).map(normalizeSignal);
  const threats = commercialRecords(raw['threats']);
  const opportunities = commercialRecords(raw['opportunities']);
  const actions = commercialRecords(raw['actions'] ?? raw['action_plan']).map(normalizeAction);
  const actionPlan = commercialRecords(raw['action_plan'] ?? raw['actions']).map(normalizeAction);
  const priorityMatrix = commercialRecords(raw['priorityMatrix'] ?? raw['priority_matrix']).map(normalizeMatrixItem);
  const priorityMatrixSnake = commercialRecords(raw['priority_matrix'] ?? raw['priorityMatrix']).map(normalizeMatrixItem);
  const scenarios = commercialRecords(raw['scenarios']);
  const beforeAfter = commercialRecords(raw['beforeAfter']);
  const unknowns = commercialUnknowns(raw['unknowns']);
  const existingPulse = objectValue(raw['decisionPulse']);
  const decisionPulse = existingPulse && !containsInternalProductResearch(existingPulse) ? existingPulse : {
    threat: pulseItem(threats[0], raw['threat_level']),
    opportunity: pulseItem(opportunities[0], raw['opportunity_level']),
    action: nextActionItem(raw['next_action'], actions),
  };
  const existingSnapshot = objectValue(raw['snapshot']);
  const snapshot = existingSnapshot && !containsInternalProductResearch(existingSnapshot)
    ? { ...existingSnapshot, competitorCount: competitors.length, meaningfulSignals: signals.length }
    : { competitorCount: competitors.length, meaningfulSignals: signals.length };
  const summary = containsInternalProductResearch(raw['summary']) ? undefined : raw['summary'];
  const nextAction = containsInternalProductResearch(raw['next_action']) ? undefined : raw['next_action'];

  const normalized = {
    ...raw,
    competitors,
    signals,
    priority_matrix: priorityMatrixSnake,
    priorityMatrix,
    threats,
    opportunities,
    scenarios,
    action_plan: actionPlan,
    actions,
    trust: objectArray(raw['trust']),
    unknowns,
    summary,
    next_action: nextAction,
    beforeAfter,
    decisionPulse,
    snapshot,
  };
  const parsed = analysisSchema.safeParse(normalized);
  if (!parsed.success) throw new Error(`AI output failed schema validation: ${parsed.error.issues[0]?.path.join('.') || 'root'}`);
  return parsed.data as Record<string, unknown>;
}
