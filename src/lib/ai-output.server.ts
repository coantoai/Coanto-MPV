import { z } from 'zod';

const stringList = z.array(z.string().trim().min(1)).max(30);

const competitor = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(2048),
  why: z.string().trim().max(1200).optional(),
  note: z.string().trim().max(1200).optional(),
  evidence: z.union([z.string().trim().max(2000), stringList]).optional(),
  sourceUrls: stringList.optional(),
  relevance: z.number().finite().optional(),
  impact: z.number().finite().optional(),
  threat: z.string().trim().max(32).optional(),
}).passthrough();

const objectList = z.array(z.record(z.unknown())).max(40);

const analysisSchema = z.object({
  competitors: z.array(competitor).max(20),
  signals: objectList,
  priority_matrix: objectList.optional(),
  priorityMatrix: objectList.optional(),
  threats: objectList.optional(),
  opportunities: objectList.optional(),
  scenarios: objectList,
  action_plan: objectList.optional(),
  actions: objectList.optional(),
  trust: objectList,
  unknowns: z.array(z.string().trim().min(1).max(1000)).max(40),
  summary: z.unknown().optional(),
  next_action: z.unknown().optional(),
  decisionPulse: z.unknown().optional(),
  snapshot: z.unknown().optional(),
  beforeAfter: objectList.optional(),
  impact: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional(),
  threat_level: z.unknown().optional(),
  opportunity_level: z.unknown().optional(),
}).passthrough();

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function normalizeCompetitor(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim()) return { name: value.trim(), url: value.trim() };
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const url = typeof item.url === 'string' ? item.url.trim() : typeof item.domain === 'string' ? item.domain.trim() : '';
  if (!name || !url) return null;
  return { ...item, name, url };
}

/**
 * Validates the model contract without inventing business facts. Missing optional
 * sections become empty UI-safe collections; invalid competitor rows are rejected.
 */
export function validateAiOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('AI output is not a JSON object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.competitors)) throw new Error('AI output is missing the competitors array.');

  const competitors = raw.competitors.map(normalizeCompetitor).filter((item): item is Record<string, unknown> => Boolean(item));
  if (!competitors.length) throw new Error('AI output contains no valid competitor rows.');

  const normalized = {
    ...raw,
    competitors,
    signals: objectArray(raw.signals),
    priority_matrix: objectArray(raw.priority_matrix ?? raw.priorityMatrix),
    priorityMatrix: objectArray(raw.priorityMatrix ?? raw.priority_matrix),
    threats: objectArray(raw.threats),
    opportunities: objectArray(raw.opportunities),
    scenarios: objectArray(raw.scenarios),
    action_plan: objectArray(raw.action_plan ?? raw.actions),
    actions: objectArray(raw.actions ?? raw.action_plan),
    trust: objectArray(raw.trust),
    unknowns: Array.isArray(raw.unknowns) ? raw.unknowns.filter((x): x is string => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 40) : [],
    beforeAfter: objectArray(raw.beforeAfter),
  };

  const parsed = analysisSchema.safeParse(normalized);
  if (!parsed.success) throw new Error(`AI output failed schema validation: ${parsed.error.issues[0]?.path.join('.') || 'root'}`);
  return parsed.data as Record<string, unknown>;
}
