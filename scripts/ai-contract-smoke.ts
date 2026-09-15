import { validateAiOutput } from '../src/lib/ai-output.server';
import { enforceEvidence } from '../src/lib/trust.server';
import { buildPrompt, type SiteSnapshot } from '../src/lib/analyze.server';
import { CUSTOMER_COMPANY_ANALYSIS_RULES } from '../src/lib/business-context.server';
import { deriveLiveDecision } from '../src/lib/decision-experience/live-model';

const valid = validateAiOutput({
  competitors: [{ name: 'Example Competitor', url: 'https://example.com', why: 'Targets the same buyers.', evidence: ['Observed product page'], sourceUrls: ['https://example.com/'] }],
  signals: [{ title: 'Commercial signal', description: 'Observed offer change', competitor: 'Example Competitor', impact: 'medium', sourceUrls: ['https://example.com/'] }],
  priority_matrix: [{
    title: 'Improve offer',
    zone: 'execute now',
    why: 'The verified competitor changed the offer.',
    sourceUrls: ['https://example.com/'],
    evidenceFor: ['Verified competitor offer changed.'],
    counterEvidence: ['Private conversion impact is unknown.'],
    trigger: 'Reopen if the competitor withdraws the offer.',
    nextAction: 'Run a bounded reversible offer test.',
    impact: 70,
    ease: 80,
  }],
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

for (const required of ['CUSTOMER COMPANY COMMERCIAL ANALYSIS ONLY', 'Never discuss COANTO itself', 'pricing, promotions, assortment', 'If the public evidence does not support a useful commercial conclusion']) {
  if (!CUSTOMER_COMPANY_ANALYSIS_RULES.includes(required)) throw new Error(`Commercial analysis rules missing ${required}.`);
}

const metaFiltered = validateAiOutput({
  competitors: [{ name: 'Retail Rival', url: 'https://retail.example', why: 'Serves the same market.' }],
  signals: [
    { title: 'Observed promotion', description: 'Retail Rival is showing a public promotion.', competitor: 'Retail Rival' },
    { title: 'Internal product research', description: 'تحليل هيكلية المواقع الإلكترونية للمنافسين لتحديد نقاط البيانات القابلة للاستخراج.', competitor: 'Retail Rival' },
  ],
  priority_matrix: [
    { title: 'Watch promotion', zone: 'monitor', why: 'A public competitor promotion is visible.', sourceUrls: [], evidenceFor: [], counterEvidence: [], trigger: 'Promotion changes', nextAction: 'Watch the offer.' },
    { title: 'حدد المتطلبات التقنية لأداة تحليل المنافسين', zone: 'test', why: 'Build the tool.', sourceUrls: [], evidenceFor: [], counterEvidence: [], trigger: 'Tool ready', nextAction: 'Build scraper.' },
  ],
  threats: [{ title: 'Promotion pressure', description: 'Competitor promotion may affect positioning.' }],
  opportunities: [{ title: 'هل سيدفع التجار؟', description: 'مدى تقبل أصحاب المتاجر الإلكترونية للدفع مقابل خدمات تحليل المنافسين.' }],
  scenarios: [],
  action_plan: [
    { title: 'Review competitor offer', timing: 'today', why: 'Commercial move.' },
    { title: 'اختبار استعداد أصحاب المتاجر للدفع', timing: 'week', why: 'PMF research.' },
  ],
  trust: [],
  unknowns: ['Competitor promotion duration is unknown.', 'القيود القانونية والتقنية المتعلقة باستخراج البيانات من مواقع المنافسين.'],
  summary: 'Commercial summary.',
  next_action: 'Review competitor offer.',
});
if ((metaFiltered.signals as Array<Record<string, unknown>>).length !== 1) throw new Error('Internal product research leaked into customer signals.');
if ((metaFiltered.priorityMatrix as Array<Record<string, unknown>>).length !== 1) throw new Error('Internal product research leaked into customer decisions.');
if ((metaFiltered.opportunities as Array<Record<string, unknown>>).length !== 0) throw new Error('Willingness-to-pay research leaked into customer opportunities.');
if ((metaFiltered.actions as Array<Record<string, unknown>>).length !== 1) throw new Error('Internal validation task leaked into customer actions.');
if ((metaFiltered.unknowns as string[]).length !== 1) throw new Error('Internal scraping constraint leaked into customer unknowns.');

const baseline: SiteSnapshot = {
  url: 'https://target.example/', title: 'Target', description: 'Target store', h1: ['Target'], h2: [], text: 'Target products', sourceType: 'direct-site', evidence: ['Direct site observation: https://target.example/'],
};
const verifiedCompetitor: SiteSnapshot = {
  url: 'https://example.com/', title: 'Example Competitor', description: 'Shop competing products', h1: ['Example Competitor'], h2: [], text: 'products shop checkout', sourceType: 'direct-site', evidence: ['Direct site observation: https://example.com/'],
};

const decisionPrompt = buildPrompt(baseline, [verifiedCompetitor]);
for (const required of ['sourceUrls', 'evidenceFor', 'counterEvidence', 'trigger', 'nextAction', 'insufficient evidence']) {
  if (!decisionPrompt.includes(required)) throw new Error(`Decision prompt missing ${required}.`);
}
if (!decisionPrompt.includes('Do not attach unrelated URLs')) throw new Error('Decision prompt does not prohibit decorative source linkage.');
if (!decisionPrompt.includes('Do not prescribe an exact price')) throw new Error('Decision prompt does not preserve the external-evidence advice ceiling.');

const gatedInput = validateAiOutput({
  competitors: [
    { name: 'Example Competitor', url: 'https://example.com/', why: 'Verified overlap.' },
    { name: 'Invented Competitor', url: 'https://invented.example/', why: 'Should not survive.' },
  ],
  signals: [
    { title: 'Supported signal', description: 'Observed change', competitor: 'Example Competitor' },
    { title: 'Unsupported signal', description: 'No linked source', competitor: 'Imaginary Brand' },
  ],
  scenarios: [],
  action_plan: [],
  priority_matrix: [{
    title: 'Bounded response test',
    zone: 'test',
    why: 'A verified competitor changed its offer.',
    sourceUrls: ['https://example.com/', 'https://example.com/fabricated-path', 'https://invented.example/fake'],
    evidenceFor: ['Competitor offer is publicly visible.'],
    counterEvidence: ['No internal conversion or margin response is known.'],
    trigger: 'Reopen if the competitor removes the offer or internal constraints change.',
    nextAction: 'Run a reversible test within existing guardrails.',
  }],
  threats: [], opportunities: [], trust: [], unknowns: [],
  summary: 'Summary', next_action: 'Monitor', threat_level: 'low', opportunity_level: 'medium',
});
const gated = enforceEvidence(gatedInput, baseline, [verifiedCompetitor], []);
const gatedCompetitors = gated.competitors as Array<Record<string, unknown>>;
if (gatedCompetitors.length !== 1 || gatedCompetitors[0]?.url !== 'https://example.com/') throw new Error('Evidence gate did not remove an unverified competitor.');
const gatedSignals = gated.signals as Array<Record<string, unknown>>;
if (gatedSignals.length !== 1 || gatedSignals[0]?.title !== 'Supported signal') throw new Error('Evidence gate did not remove an unlinked signal.');
const gatedMatrix = gated.priorityMatrix as Array<Record<string, unknown>>;
if (!Array.isArray(gatedMatrix) || gatedMatrix.length !== 1) throw new Error('Evidence gate dropped the decision row unexpectedly.');
if (JSON.stringify(gatedMatrix[0]?.sourceUrls) !== JSON.stringify(['https://example.com/'])) throw new Error('Decision source gate did not remove an unverified or fabricated same-host decision URL.');
if (gatedMatrix[0]?.decisionEvidenceStatus !== 'linked') throw new Error('Verified decision row was not marked linked.');
const liveDecision = deriveLiveDecision(gated);
if (liveDecision.posture !== 'TEST' || liveDecision.complete !== true) throw new Error('Verified decision row did not promote into a complete live Decision Event.');
if (JSON.stringify(liveDecision.sourceUrls) !== JSON.stringify(['https://example.com/'])) throw new Error('Live Decision Event did not inherit only gated decision sources.');
const gatedMetadata = gated.metadata as Record<string, unknown>;
if (gatedMetadata?.claimLinkageChecked !== true || gatedMetadata?.sourceCount !== 2 || gatedMetadata?.evidenceStrength !== 'medium') throw new Error('Evidence confidence metadata is not calibrated by source coverage.');
if (gatedMetadata?.decisionSourceLinkageChecked !== true || gatedMetadata?.unlinkedDecisionRows !== 0) throw new Error('Decision-source linkage metadata is missing or incorrect.');
if (gatedMetadata?.decisionSourcePolicy !== 'exact-observed-url-or-provider-grounded-source') throw new Error('Strict decision-source policy marker is missing.');
const gatedSnapshot = gated.snapshot as Record<string, unknown>;
if (gatedSnapshot?.competitorCount !== 1 || gatedSnapshot?.meaningfulSignals !== 1) throw new Error('Post-gate snapshot counts were not recalculated.');

const unlinked = enforceEvidence(validateAiOutput({
  competitors: [{ name: 'Example Competitor', url: 'https://example.com/', why: 'Verified overlap.' }],
  signals: [], scenarios: [], action_plan: [], threats: [], opportunities: [], trust: [], unknowns: [],
  priority_matrix: [{ title: 'Unsafe recommendation', zone: 'do-now', why: 'Looks plausible.', sourceUrls: ['https://example.com/fake'] }],
  summary: 'Summary', next_action: 'Act', threat_level: 'medium', opportunity_level: 'medium',
}), baseline, [verifiedCompetitor], []);
const blockedDecision = deriveLiveDecision(unlinked);
if (blockedDecision.posture !== 'INSUFFICIENT') throw new Error('Fabricated same-host decision URL incorrectly promoted a live decision.');
if ((unlinked.metadata as Record<string, unknown>)?.unlinkedDecisionRows !== 1) throw new Error('Unlinked decision row was not counted.');

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
