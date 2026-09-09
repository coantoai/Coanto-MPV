import { collectEvidence } from '../src/lib/evidence-collector.server';

const result = await collectEvidence({
  urls: ['https://example.com', 'https://example.com#duplicate-fragment', 'ftp://invalid.example.com'],
  sourceGroup: 'public-web',
  maxSources: 3,
});

if (result.records.length !== 1) throw new Error(`Expected one deduplicated observation, got ${result.records.length}`);
const [record] = result.records;
if (record.kind !== 'direct') throw new Error(`Expected direct evidence, got ${record.kind}`);
if (record.status !== 'UNVERIFIED') throw new Error(`Collector must not auto-verify evidence: ${record.status}`);
if (!record.contentHash || !/^ev_[a-f0-9]{24}$/.test(record.id)) throw new Error('Evidence identity contract failed.');
if (!result.rejected.some((item) => item.url.startsWith('ftp://'))) throw new Error('Invalid URL rejection contract failed.');

console.log('EVIDENCE_COLLECTOR_SMOKE_OK');
