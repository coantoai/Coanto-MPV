import { detectMonitoringChange, type MonitoringSnapshotInput } from '../src/lib/monitoring-engine.server.ts';

const base: MonitoringSnapshotInput = {
  contentHash: 'a',
  title: 'Competitor Store',
  description: 'Shoes',
  h1: ['Running shoes'],
  h2: ['New arrivals'],
  textExcerpt: 'Running shoes for everyday training and comfort.',
  checkedAt: '2026-09-10T00:00:00.000Z',
};

const same = detectMonitoringChange(base, { ...base });
if (same.changed) throw new Error('Identical snapshots must not create an event.');

const title = detectMonitoringChange(base, { ...base, contentHash: 'b', title: '50% OFF Today', checkedAt: '2026-09-10T01:00:00.000Z' });
if (!title.changed || title.eventType !== 'title-change' || title.severity !== 'high') throw new Error('Title change classification failed.');

const structure = detectMonitoringChange(base, { ...base, contentHash: 'c', h1: ['Running shoes', 'Trail shoes'], checkedAt: '2026-09-10T02:00:00.000Z' });
if (!structure.changed || structure.eventType !== 'structure-change') throw new Error('Structure change classification failed.');

const noisy = detectMonitoringChange(base, { ...base, contentHash: 'd', textExcerpt: 'Running shoes for everyday training and comfort. ', checkedAt: '2026-09-10T03:00:00.000Z' });
if (noisy.changed || noisy.evidence.noiseSuppressed !== true) throw new Error('Noise suppression failed.');

const price = detectMonitoringChange(base, { ...base, contentHash: 'e', textExcerpt: 'Running shoes now $129 with premium cushioning.', checkedAt: '2026-09-10T04:00:00.000Z' });
if (!price.changed || price.eventType !== 'price-change' || price.severity !== 'high') throw new Error('Price change classification failed.');

const offer = detectMonitoringChange(base, { ...base, contentHash: 'f', textExcerpt: 'Running shoes for everyday training. 20% off limited offer.', checkedAt: '2026-09-10T05:00:00.000Z' });
if (!offer.changed || offer.eventType !== 'offer-change') throw new Error('Offer change classification failed.');

const messaging = detectMonitoringChange(base, { ...base, contentHash: 'g', description: 'Sustainable performance footwear for athletes', checkedAt: '2026-09-10T06:00:00.000Z' });
if (!messaging.changed || messaging.eventType !== 'messaging-change') throw new Error('Messaging change classification failed.');

const first = detectMonitoringChange(null, base);
if (first.changed) throw new Error('Baseline must not create a change event.');

console.log('MONITORING_ENGINE_SMOKE_OK');
