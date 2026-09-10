import type { SiteSnapshot } from './analyze.server';
import { createEvidence, dedupeEvidence, type EvidenceRecord } from './evidence-engine.server';
import { applyEvidenceVerification } from './evidence-verification.server';

function snapshotContent(snapshot: SiteSnapshot) {
  return [
    `TITLE: ${snapshot.title}`,
    `DESCRIPTION: ${snapshot.description}`,
    snapshot.h1.length ? `H1: ${snapshot.h1.join(' | ')}` : '',
    snapshot.h2.length ? `H2: ${snapshot.h2.join(' | ')}` : '',
    `TEXT: ${snapshot.text}`,
  ].filter(Boolean).join('\n');
}

function recordFromSnapshot(snapshot: SiteSnapshot, role: 'baseline' | 'competitor', observedAt: string): EvidenceRecord & { role: 'baseline' | 'competitor' } {
  const record = createEvidence({
    kind: snapshot.sourceType === 'direct-site' ? 'direct' : 'search',
    sourceUrl: snapshot.url,
    sourceGroup: new URL(snapshot.url).hostname.replace(/^www\./, '').toLowerCase(),
    observedAt,
    retrievedAt: observedAt,
    content: snapshotContent(snapshot),
    metadata: {
      collector: 'coanto-analysis-pipeline',
      sourceType: snapshot.sourceType,
      title: snapshot.title.slice(0, 500),
    },
  });
  return { ...applyEvidenceVerification(record, new Date(observedAt)), role };
}

export function buildAnalysisEvidenceLedger(main: SiteSnapshot, competitors: SiteSnapshot[], observedAt = new Date().toISOString()) {
  const withRoles = [recordFromSnapshot(main, 'baseline', observedAt), ...competitors.map((site) => recordFromSnapshot(site, 'competitor', observedAt))];
  const records = dedupeEvidence(withRoles);
  const roleById = new Map(withRoles.map((item) => [item.id, item.role] as const));
  return records.map((record) => ({ record, role: roleById.get(record.id) ?? 'competitor' }));
}
