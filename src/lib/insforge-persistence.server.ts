import { createAdminClient } from '@insforge/sdk';
import type { ClaimRecord } from './claim-engine.server';
import type { EvidenceRecord } from './evidence-engine.server';
import type { EvidenceGraph } from './evidence-graph.server';

export type CoantoEvidenceStore = {
  insertEvidence(records: EvidenceRecord[]): Promise<unknown>;
  insertClaims(records: ClaimRecord[]): Promise<unknown>;
  insertGraph(snapshot: EvidenceGraph & { analysisId: string }): Promise<unknown>;
};

function getConfig() {
  const baseUrl = process.env['INSFORGE_URL'] || process.env['INSFORGE_BASE_URL'];
  const apiKey = process.env['INSFORGE_API_KEY'];
  if (!baseUrl || !apiKey) {
    throw new Error('InsForge persistence requires INSFORGE_URL and INSFORGE_API_KEY.');
  }
  return { baseUrl, apiKey };
}

function client() {
  const config = getConfig();
  return createAdminClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
}

export function createInsForgeEvidenceStore(): CoantoEvidenceStore {
  const db = client().database;
  return {
    async insertEvidence(records) {
      if (!records.length) return [];
      const { data, error } = await db.from('coanto_evidence').insert(records).select();
      if (error) throw new Error(`InsForge evidence insert failed: ${error.message}`);
      return data;
    },
    async insertClaims(records) {
      if (!records.length) return [];
      const { data, error } = await db.from('coanto_claims').insert(records).select();
      if (error) throw new Error(`InsForge claim insert failed: ${error.message}`);
      return data;
    },
    async insertGraph(snapshot) {
      const { data, error } = await db.from('coanto_evidence_graph_snapshots').insert([{ analysis_id: snapshot.analysisId, graph_json: snapshot }]).select();
      if (error) throw new Error(`InsForge graph insert failed: ${error.message}`);
      return data;
    },
  };
}
