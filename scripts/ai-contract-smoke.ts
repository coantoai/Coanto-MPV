import { validateAiOutput } from '../src/lib/ai-output.server';

const valid = validateAiOutput({
  competitors: [{ name: 'Example Competitor', url: 'https://example.com', evidence: ['Observed product page'], sourceUrls: ['https://example.com/'] }],
  signals: [{ title: 'Commercial signal', detail: 'Observed', impact: 'medium' }],
  priority_matrix: [{ title: 'Improve offer', impact: 70, ease: 80 }],
  scenarios: [],
  action_plan: [{ title: 'Test response', priority: 'high' }],
  trust: [],
  unknowns: ['Private revenue is not publicly verified.'],
});

if (!Array.isArray(valid.competitors) || valid.competitors.length !== 1) throw new Error('Valid AI output was not accepted.');
if (!Array.isArray(valid.priorityMatrix) || valid.priorityMatrix.length !== 1) throw new Error('Snake-case priority_matrix was not normalized.');
if (!Array.isArray(valid.actions) || valid.actions.length !== 1) throw new Error('Snake-case action_plan was not normalized.');

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
