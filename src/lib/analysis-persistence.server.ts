import { createAdminClient } from '@insforge/sdk';
import { getServerConfig } from './config.server';

export type SaveAnalysisInput = {
  userId: string;
  storeUrl: string;
  result: Record<string, unknown>;
};

function database() {
  const { insforge } = getServerConfig();
  return createAdminClient({ baseUrl: insforge.url, apiKey: insforge.apiKey }).database;
}

/** Server-only, tenant-scoped analysis persistence. */
export async function saveAnalysis(input: SaveAnalysisInput): Promise<{ id: string }> {
  if (!input.userId.trim()) throw new Error('Analysis persistence requires an authenticated user.');
  const { data, error } = await database()
    .from('analyses')
    .insert({ user_id: input.userId, store_url: input.storeUrl, result_json: input.result })
    .select('id')
    .single();
  if (error) throw new Error(`Analysis persistence failed: ${error.message}`);
  if (!data?.id) throw new Error('Analysis persistence failed: missing record id.');
  return { id: String(data.id) };
}
