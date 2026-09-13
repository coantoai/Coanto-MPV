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

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}
function objectValue(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
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
  const zone = /^(do-now|now|execute-now|نفذ-الآن|نفّذ-الآن)$/.test(key) ? 'do-now'
    : /^(test|pilot|experiment|اختبر)$/.test(key) ? 'test'
    : /^(monitor|watch|راقب)$/.test(key) ? 'monitor'
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
  const object = objectValue(value);
  if (object) return object;
  const title = stringValue(value);
  if (title) return { title };
  return actions[0];
}

/** Validates the model contract without inventing business facts. */
export function validateAiOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('AI output is not a JSON object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw['competitors'])) throw new Error('AI output is missing the competitors array.');
  const competitors = raw['competitors'].map(normalizeCompetitor).filter((item): item is Record<string, unknown> => Boolean(item));
  if (!competitors.length) throw new Error('AI output contains no valid competitor rows.');

  const signals = objectArray(raw['signals']).map(normalizeSignal);
  const threats = objectArray(raw['threats']);
  const opportunities = objectArray(raw['opportunities']);
  const actions = objectArray(raw['actions'] ?? raw['action_plan']).map(normalizeAction);
  const actionPlan = objectArray(raw['action_plan'] ?? raw['actions']).map(normalizeAction);
  const priorityMatrix = objectArray(raw['priorityMatrix'] ?? raw['priority_matrix']).map(normalizeMatrixItem);
  const priorityMatrixSnake = objectArray(raw['priority_matrix'] ?? raw['priorityMatrix']).map(normalizeMatrixItem);
  const existingPulse = objectValue(raw['decisionPulse']);
  const decisionPulse = existingPulse ?? {
    threat: pulseItem(threats[0], raw['threat_level']),
    opportunity: pulseItem(opportunities[0], raw['opportunity_level']),
    action: nextActionItem(raw['next_action'], actions),
  };
  const existingSnapshot = objectValue(raw['snapshot']);
  const snapshot = existingSnapshot ?? { competitorCount: competitors.length, meaningfulSignals: signals.length };

  const normalized = {
    ...raw,
    competitors,
    signals,
    priority_matrix: priorityMatrixSnake,
    priorityMatrix,
    threats,
    opportunities,
    scenarios: objectArray(raw['scenarios']),
    action_plan: actionPlan,
    actions,
    trust: objectArray(raw['trust']),
    unknowns: Array.isArray(raw['unknowns']) ? raw['unknowns'].filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim()).slice(0, 40) : [],
    beforeAfter: objectArray(raw['beforeAfter']),
    decisionPulse,
    snapshot,
  };
  const parsed = analysisSchema.safeParse(normalized);
  if (!parsed.success) throw new Error(`AI output failed schema validation: ${parsed.error.issues[0]?.path.join('.') || 'root'}`);
  return parsed.data as Record<string, unknown>;
}
