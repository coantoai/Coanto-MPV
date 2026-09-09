import { createHash } from 'node:crypto';

export type EvidenceKind = 'direct' | 'search' | 'calculation' | 'historical' | 'inference';
export type EvidenceStatus = 'VERIFIED' | 'UNVERIFIED' | 'REJECTED';

export type EvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  sourceUrl: string;
  sourceDomain: string;
  sourceGroup: string;
  observedAt: string;
  retrievedAt: string;
  content: string;
  contentHash: string;
  status: EvidenceStatus;
  supportsClaim?: string;
  contradictsClaim?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type EvidenceInput = Omit<EvidenceRecord, 'id' | 'sourceDomain' | 'observedAt' | 'retrievedAt' | 'contentHash' | 'status'> & {
  observedAt?: string;
  retrievedAt?: string;
  status?: EvidenceStatus;
};

const MAX_CONTENT_LENGTH = 50_000;

function clean(value: string, max = MAX_CONTENT_LENGTH) {
  return value.replaceAll('\u0000', '').trim().slice(0, max);
}

function isPrivateIpv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) ||
    parts.every((part) => part === 0);
}

function isPrivateIpv6(host: string) {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!value.includes(':')) return false;
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
    /^fe[89ab]/.test(value) || value.startsWith('ff') || /^::ffff:(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value);
}

function canonicalUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Evidence sourceUrl must be a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Evidence sourceUrl must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('Evidence sourceUrl must not contain credentials.');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') ||
      host === '0.0.0.0' || host === '::1' || isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error('Evidence sourceUrl must point to a public internet host.');
  }
  url.hostname = host;
  url.hash = '';
  return url.toString();
}

function domainFromUrl(sourceUrl: string) {
  try { return new URL(sourceUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function assertTimestamp(value: string, field: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO timestamp.`);
  return new Date(timestamp).toISOString();
}

function canonicalContent(content: string) {
  return clean(content).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
}

function hashContent(content: string) {
  return createHash('sha256').update(canonicalContent(content), 'utf8').digest('hex');
}

function hashIdentity(input: { kind: EvidenceKind; sourceUrl: string; observedAt: string; contentHash: string }) {
  const canonical = [input.kind, input.sourceUrl, input.observedAt, input.contentHash].join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function validateEvidenceInput(input: EvidenceInput) {
  if (!input.sourceUrl?.trim()) throw new Error('Evidence sourceUrl is required.');
  const sourceUrl = canonicalUrl(input.sourceUrl.trim());
  if (!input.kind) throw new Error('Evidence kind is required.');
  if (!input.content?.trim()) throw new Error('Evidence content is required.');
  if (input.content.length > MAX_CONTENT_LENGTH) throw new Error(`Evidence content exceeds ${MAX_CONTENT_LENGTH} characters.`);
  const observedAt = assertTimestamp(input.observedAt ?? input.retrievedAt ?? new Date().toISOString(), 'observedAt');
  const retrievedAt = assertTimestamp(input.retrievedAt ?? new Date().toISOString(), 'retrievedAt');
  if (Date.parse(retrievedAt) < Date.parse(observedAt)) throw new Error('retrievedAt cannot be earlier than observedAt.');
  return { url: sourceUrl, observedAt, retrievedAt };
}

/** Creates immutable evidence with a stable content hash and observation identity. */
export function createEvidence(input: EvidenceInput): EvidenceRecord {
  const valid = validateEvidenceInput(input);
  const sourceUrl = valid.url;
  const content = canonicalContent(input.content);
  const contentHash = hashContent(content);
  const sourceDomain = domainFromUrl(sourceUrl);
  if (!sourceDomain) throw new Error('Evidence source URL has no usable domain.');

  const id = `ev_${hashIdentity({ kind: input.kind, sourceUrl, observedAt: valid.observedAt, contentHash }).slice(0, 24)}`;
  return {
    id,
    kind: input.kind,
    sourceUrl,
    sourceDomain,
    sourceGroup: clean(input.sourceGroup || sourceDomain, 200).toLowerCase(),
    observedAt: valid.observedAt,
    retrievedAt: valid.retrievedAt,
    content,
    contentHash,
    status: input.status ?? 'UNVERIFIED',
    ...(input.supportsClaim ? { supportsClaim: clean(input.supportsClaim, 500) } : {}),
    ...(input.contradictsClaim ? { contradictsClaim: clean(input.contradictsClaim, 500) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

/** Deduplicates identical evidence observations by stable observation identity. */
export function dedupeEvidence(records: EvidenceRecord[]) {
  const seen = new Map<string, EvidenceRecord>();
  for (const record of records) {
    if (!seen.has(record.id)) seen.set(record.id, record);
  }
  return [...seen.values()];
}

export function evidenceToTrustItem(record: EvidenceRecord) {
  return {
    id: record.id,
    sourceUrl: record.sourceUrl,
    sourceDomain: record.sourceDomain,
    sourceGroup: record.sourceGroup,
    kind: record.kind,
    observedAt: record.observedAt,
    supportsClaim: Boolean(record.supportsClaim) && !record.contradictsClaim,
    contradictsClaim: Boolean(record.contradictsClaim),
    directness: record.kind === 'direct' ? 1 : record.kind === 'calculation' ? 0.95 : record.kind === 'search' ? 0.65 : 0.5,
    reliability: record.status === 'VERIFIED' ? 0.9 : record.status === 'REJECTED' ? 0 : 0.6,
  };
}
