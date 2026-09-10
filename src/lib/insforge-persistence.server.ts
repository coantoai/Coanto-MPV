import { createAdminClient } from '@insforge/sdk';
import type { ClaimRecord } from './claim-engine.server';
import type { EvidenceRecord } from './evidence-engine.server';
import type { EvidenceGraph } from './evidence-graph.server';
import { getServerConfig } from './config.server';

export type CoantoEvidenceStore = {
  insertEvidence(records: EvidenceRecord[]): Promise<unknown>;
  insertClaims(records: ClaimRecord[]): Promise<unknown>;
  insertGraph(snapshot: EvidenceGraph & { analysisId: string }): Promise<unknown>;
  persistAnalysisEvidence(input: {
    userId: string;
    analysisId: string;
    entries: Array<{ record: EvidenceRecord; role: 'baseline' | 'competitor' | 'citation' }>;
  }): Promise<void>;
};

function client() {
  const { insforge } = getServerConfig();
  return createAdminClient({ baseUrl: insforge.url, apiKey: insforge.apiKey });
}

function evidenceRow(record: EvidenceRecord) {
  return {
    id: record.id,
    kind: record.kind,
    source_url: record.sourceUrl,
    source_domain: record.sourceDomain,
    source_group: record.sourceGroup,
    observed_at: record.observedAt,
    retrieved_at: record.retrievedAt,
    content: record.content,
    content_hash: record.contentHash,
    status: record.status,
    supports_claim: record.supportsClaim ?? null,
    contradicts_claim: record.contradictsClaim ?? null,
    metadata: record.metadata ?? {},
  };
}

function claimRow(record: ClaimRecord) {
  return {
    id: record.id,
    text: record.text,
    normalized: record.normalized,
    type: record.type,
    status: record.status,
    supporting_evidence_ids: record.supportingEvidenceIds,
    contradicting_evidence_ids: record.contradictingEvidenceIds,
    created_at: record.createdAt,
    version: record.version,
  };
}

export function createInsForgeEvidenceStore(): CoantoEvidenceStore {
  const db = client().database;
  return {
    async insertEvidence(records) {
      if (!records.length) return [];
      const { data, error } = await db.from('coanto_evidence').upsert(records.map(evidenceRow), { onConflict: 'id' }).select();
      if (error) throw new Error(`InsForge evidence insert failed: ${error.message}`);
      return data;
    },
    async insertClaims(records) {
      if (!records.length) return [];
      const { data, error } = await db.from('coanto_claims').upsert(records.map(claimRow), { onConflict: 'id' }).select();
      if (error) throw new Error(`InsForge claim insert failed: ${error.message}`);
      return data;
    },
    async insertGraph(snapshot) {
      const { data, error } = await db.from('coanto_evidence_graph_snapshots').insert([{ analysis_id: snapshot.analysisId, graph_json: snapshot }]).select();
      if (error) throw new Error(`InsForge graph insert failed: ${error.message}`);
      return data;
    },
    async persistAnalysisEvidence({ userId, analysisId, entries }) {
      if (!userId.trim() || !analysisId.trim()) throw new Error('Evidence ledger requires tenant and analysis identifiers.');
      if (!entries.length) return;
      const records = entries.map((entry) => entry.record);
      const { error: evidenceError } = await db.from('coanto_evidence').upsert(records.map(evidenceRow), { onConflict: 'id' });
      if (evidenceError) throw new Error(`InsForge evidence ledger insert failed: ${evidenceError.message}`);
      const links = entries.map(({ record, role }) => ({ user_id: userId, analysis_id: analysisId, evidence_id: record.id, role }));
      const { error: linkError } = await db.from('analysis_evidence_links').upsert(links, { onConflict: 'user_id,analysis_id,evidence_id' });
      if (linkError) throw new Error(`InsForge evidence ledger link failed: ${linkError.message}`);
    },
  };
}
