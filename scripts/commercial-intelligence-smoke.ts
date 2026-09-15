import { buildCommercialIntelligence, commercialIntelligenceForPrompt } from '../src/lib/commercial-intelligence.server';
import type { SiteSnapshot } from '../src/lib/analyze.server';

const target: SiteSnapshot = {
  url: 'https://target.example/',
  title: 'Target Market',
  description: 'Fresh grocery delivery and loyalty rewards.',
  h1: ['Shop groceries'],
  h2: ['New products', 'Free delivery'],
  text: 'Fresh groceries. USD 12.99. Member rewards. In stock. New products and free delivery today.',
  sourceType: 'direct-site',
  evidence: ['Direct site observation: https://target.example/'],
};

const competitor: SiteSnapshot = {
  url: 'https://competitor.example/',
  title: 'Competitor Store',
  description: 'Sale and delivery across the market.',
  h1: ['20% off selected products'],
  h2: ['New arrivals', 'Click and collect'],
  text: 'Sale 20% off selected products. USD 9.99. Out of stock on selected items. Click and collect available.',
  sourceType: 'direct-site',
  evidence: ['Direct site observation: https://competitor.example/'],
};

const snapshot = buildCommercialIntelligence(target, [competitor]);

if (snapshot.coverage.entitiesObserved !== 2) throw new Error('Expected two observed entities.');
if (snapshot.coverage.observations < 6) throw new Error('Commercial extractor produced too few observations.');
for (const kind of ['price', 'promotion', 'availability', 'assortment', 'delivery'] as const) {
  if (snapshot.categories[kind] < 1) throw new Error(`Expected ${kind} evidence.`);
}
if (!snapshot.observations.every((item) => item.sourceUrl.startsWith('https://'))) throw new Error('Observation lost source URL.');
const prompt = commercialIntelligenceForPrompt(snapshot);
if (!prompt.includes('COMMERCIAL OBSERVATIONS EXTRACTED FROM CURRENT PUBLIC SOURCES')) throw new Error('Prompt evidence block missing.');
if (!prompt.includes('Do not infer sales, margin, market share, traffic, or inventory levels')) throw new Error('Evidence ceiling missing.');

console.log('Commercial intelligence smoke: PASS');
