import { validateAiOutput } from '../src/lib/ai-output.server';

const valid = validateAiOutput({
  competitors: [{ name: 'Example Competitor', url: 'https://example.com', why: 'Targets the same buyers.', evidence: ['Observed product page'], sourceUrls: ['https://example.com/'] }],
  signals: [{ title: 'Commercial signal', description: 'Observed offer change', impact: 'medium', sourceUrls: ['https://example.com/'] }],
  priority_matrix: [{ title: 'Improve offer', zone: 'execute now', impact: 70, ease: 80 }],
  threats: [{ title: 'Competitor offer pressure', description: 'A verified competitor improved its offer.' }],
  opportunities: [{ title: 'Positioning gap', description: 'A gap is visible in the supplied evidence.' }],
  scenarios: [],
  action_plan: [{ title: 'Test response', timing: 'today', priority: 'high' }],
  trust: [],
  unknowns: ['Private revenue is not publicly verified.'],
  next_action: 'Test the clearest response today.',
  threat_level: 'medium',
  opportunity_level: 'high',
});

if (!Array.isArray(valid.competitors) || valid.competitors.length !== 1) throw new Error('Valid AI output was not accepted.');
if ((valid.competitors as Array<Record<string, unknown>>)[0]?.note !== 'Targets the same buyers.') throw new Error('Competitor why was not normalized for the UI.');
if (!Array.isArray(valid.priorityMatrix) || valid.priorityMatrix.length !== 1) throw new Error('Snake-case priority_matrix was not normalized.');
if ((valid.priorityMatrix as Array<Record<string, unknown>>)[0]?.zone !== 'do-now') throw new Error('Priority matrix zone was not normalized.');
if (!Array.isArray(valid.actions) || valid.actions.length !== 1) throw new Error('Snake-case action_plan was not normalized.');
if ((valid.actions as Array<Record<string, unknown>>)[0]?.when !== 'today') throw new Error('Action timing was not normalized.');
if ((valid.signals as Array<Record<string, unknown>>)[0]?.detail !== 'Observed offer change') throw new Error('Signal description was not normalized for the UI.');
const pulse = valid.decisionPulse as Record<string, Record<string, unknown>>;
if (pulse?.threat?.title !== 'Competitor offer pressure' || pulse?.opportunity?.title !== 'Positioning gap' || pulse?.action?.title !== 'Test the clearest response today.') throw new Error('Decision pulse was not derived from validated AI output.');
const snapshot = valid.snapshot as Record<string, unknown>;
if (snapshot?.competitorCount !== 1 || snapshot?.meaningfulSignals !== 1) throw new Error('Analysis snapshot counts were not derived correctly.');

let rejected = false;
try {
  validateAiOutput({ competitors: [], signals: [], scenarios: [], trust: [], unknowns: [] });
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Empty competitor output was incorrectly accepted.');

rejected = false;
try {
  validateAiOutput({ signals: [], scenarios: [], trust: [], unknowns: [] });
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Output without competitors was incorrectly accepted.');

console.log('AI contract smoke: PASS');
