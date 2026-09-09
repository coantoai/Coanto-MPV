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

function canonicalCollectionUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

function inputFromSnapshot(snapshot: SiteSnapshot, request: EvidenceCollectionRequest, retrievedAt: string): EvidenceInput {
  return {
    kind: snapshot.sourceType === 'direct-site' ? 'direct' : 'search',
    sourceUrl: snapshot.url,
    sourceGroup: request.sourceGroup?.trim() || new URL(snapshot.url).hostname.replace(/^www\./, '').toLowerCase(),
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

function hasExplicitScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

/**
 * Collects source observations only. It never promotes an observation to VERIFIED
 * and never treats an AI-generated statement as evidence by itself.
 */
export async function collectEvidence(request: EvidenceCollectionRequest): Promise<EvidenceCollectionResult> {
  const maxSources = Math.max(1, Math.min(request.maxSources ?? 12, 24));
  const records: EvidenceRecord[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  const normalizedUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const raw of request.urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (hasExplicitScheme(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      rejected.push({ url: trimmed, reason: 'فقط روابط HTTP وHTTPS مسموحة.' });
      continue;
    }
    const validation = validateTargetUrl(trimmed);
    if (!validation.ok || !validation.url) {
      rejected.push({ url: trimmed, reason: validation.reason ?? 'Invalid public URL.' });
      continue;
    }
    const canonical = canonicalCollectionUrl(validation.url);
    if (!seenUrls.has(canonical)) {
      seenUrls.add(canonical);
      normalizedUrls.push(canonical);
    }
    if (normalizedUrls.length >= maxSources) break;
  }

  for (const sourceUrl of normalizedUrls) {
    const retrievedAt = new Date().toISOString();
    try {
      const snapshot = await fetchSite(sourceUrl);
      records.push(createEvidence(inputFromSnapshot(snapshot, request, retrievedAt)));
      continue;
    } catch (directError) {
      try {
        const fallback = await searchEvidenceForUrl(sourceUrl);
        if (fallback) {
          records.push(createEvidence(inputFromSnapshot(fallback, request, retrievedAt)));
          continue;
        }
      } catch {
        // Preserve the original direct-fetch error as the actionable failure reason.
      }
      rejected.push({
        url: sourceUrl,
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
