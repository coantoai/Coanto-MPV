import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type SaveAnalysisInput = {
  userId: string;
  storeUrl: string;
  result: Record<string, unknown>;
};

/**
 * Server-only analysis persistence boundary.
 * Transitional implementation is Supabase-backed; callers must not depend on the vendor.
 * This adapter will move to InsForge during the persistence migration.
 */
export async function saveAnalysis(input: SaveAnalysisInput): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('analyses')
    .insert({ user_id: input.userId, store_url: input.storeUrl, result_json: input.result as never })
    .select('id')
    .single();
  if (error) throw new Error(`Analysis persistence failed: ${error.message}`);
  return { id: data.id };
}
