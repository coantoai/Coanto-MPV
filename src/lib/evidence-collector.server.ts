import { createEvidence, dedupeEvidence, type EvidenceInput, type EvidenceRecord } from './evidence-engine.server';
import { fetchSite, searchEvidenceForUrl, validateTargetUrl, type SiteSnapshot } from './analyze.server';

export type EvidenceCollectionRequest = {
  urls: string[];
  sourceGroup?: string;
  observedAt?: string;
  maxSources?: number;
};

export type EvidenceCollectionResult = {
  records: EvidenceRecord[];
  rejected: Array<{ url: string; reason: string }>;
};

function snapshotContent(snapshot: SiteSnapshot) {
  return [
    `TITLE: ${snapshot.title}`,
    `DESCRIPTION: ${snapshot.description}`,
    snapshot.h1.length ? `H1: ${snapshot.h1.join(' | ')}` : '',
    snapshot.h2.length ? `H2: ${snapshot.h2.join(' | ')}` : '',
    `TEXT: ${snapshot.text}`,
  ].filter(Boolean).join('\n');
}

function inputFromSnapshot(snapshot: SiteSnapshot, request: EvidenceCollectionRequest, retrievedAt: string): EvidenceInput {
  return {
    kind: snapshot.sourceType === 'direct-site' ? 'direct' : 'search',
    sourceUrl: snapshot.url,
    sourceGroup: request.sourceGroup,
    observedAt: request.observedAt ?? retrievedAt,
    retrievedAt,
    content: snapshotContent(snapshot),
    metadata: {
      collector: 'coanto-evidence-collector-v1',
      sourceType: snapshot.sourceType,
      title: snapshot.title.slice(0, 500),
    },
  };
}

/**
 * Collects source observations only. It never promotes an observation to VERIFIED
 * and never treats an AI-generated statement as evidence by itself.
 */
export async function collectEvidence(request: EvidenceCollectionRequest): Promise<EvidenceCollectionResult> {
  const maxSources = Math.max(1, Math.min(request.maxSources ?? 12, 24));
  const records: EvidenceRecord[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  const urls = [...new Set(request.urls.map((url) => url.trim()).filter(Boolean))].slice(0, maxSources);

  for (const rawUrl of urls) {
    const validation = validateTargetUrl(rawUrl);
    if (!validation.ok) {
      rejected.push({ url: rawUrl, reason: validation.reason ?? 'Invalid public URL.' });
      continue;
    }

    const retrievedAt = new Date().toISOString();
    try {
      const snapshot = await fetchSite(validation.url!);
      records.push(createEvidence(inputFromSnapshot(snapshot, request, retrievedAt)));
      continue;
    } catch (directError) {
      try {
        const fallback = await searchEvidenceForUrl(validation.url!);
        if (fallback) {
          records.push(createEvidence(inputFromSnapshot(fallback, request, retrievedAt)));
          continue;
        }
      } catch {}
      rejected.push({
        url: rawUrl,
        reason: directError instanceof Error ? directError.message.slice(0, 300) : 'Source collection failed.',
      });
    }
  }

  return { records: dedupeEvidence(records), rejected };
}

/** Turns already-collected AI source URLs into fresh first-party evidence observations. */
export async function collectCitedSources(sourceUrls: string[], options: Omit<EvidenceCollectionRequest, 'urls'> = {}) {
  return collectEvidence({ ...options, urls: sourceUrls });
}
