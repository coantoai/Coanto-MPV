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
if (same.changed || same.score !== 0) throw new Error('Identical snapshots must not create an event.');

const title = detectMonitoringChange(base, { ...base, contentHash: 'b', title: 'Competitor Store Official', checkedAt: '2026-09-10T01:00:00.000Z' });
if (!title.changed || title.eventType !== 'title-change' || title.score < 60) throw new Error('Title change classification failed.');

const structure = detectMonitoringChange(base, { ...base, contentHash: 'c', h1: ['Running shoes', 'Trail shoes'], checkedAt: '2026-09-10T02:00:00.000Z' });
if (!structure.changed || structure.eventType !== 'structure-change' || structure.score < 60) throw new Error('Structure change classification failed.');

const noisy = detectMonitoringChange(base, { ...base, contentHash: 'd', textExcerpt: 'Running shoes for everyday training and comfort. ', checkedAt: '2026-09-10T03:00:00.000Z' });
if (noisy.changed || noisy.evidence.noiseSuppressed !== true || noisy.score !== 0) throw new Error('Noise suppression failed.');

const price = detectMonitoringChange(base, { ...base, contentHash: 'e', textExcerpt: 'Running shoes now $129 with premium cushioning.', checkedAt: '2026-09-10T04:00:00.000Z' });
if (!price.changed || price.eventType !== 'price-change' || price.severity !== 'high' || price.score < 90) throw new Error('Price change classification failed.');

const offer = detectMonitoringChange(base, { ...base, contentHash: 'f', textExcerpt: 'Running shoes for everyday training. 20% off limited offer.', checkedAt: '2026-09-10T05:00:00.000Z' });
if (!offer.changed || offer.eventType !== 'offer-change' || offer.score < 85) throw new Error('Offer change classification failed.');

const messaging = detectMonitoringChange(base, { ...base, contentHash: 'g', description: 'Sustainable performance footwear for athletes', checkedAt: '2026-09-10T06:00:00.000Z' });
if (!messaging.changed || messaging.eventType !== 'messaging-change' || messaging.score < 70) throw new Error('Messaging change classification failed.');

const priceAgain = detectMonitoringChange(base, { ...base, contentHash: 'e', textExcerpt: 'Running shoes now $129 with premium cushioning.', checkedAt: '2026-09-11T04:00:00.000Z' });
if (price.fingerprint !== priceAgain.fingerprint) throw new Error('Change fingerprint must be deterministic across observation time.');
if (!/^chg_[a-f0-9]{24}$/.test(price.fingerprint)) throw new Error('Change fingerprint format is invalid.');

const first = detectMonitoringChange(null, base);
if (first.changed || first.score !== 0) throw new Error('Baseline must not create a change event.');

console.log('MONITORING_ENGINE_SMOKE_OK', JSON.stringify({ priceScore: price.score, offerScore: offer.score, fingerprint: price.fingerprint }));
