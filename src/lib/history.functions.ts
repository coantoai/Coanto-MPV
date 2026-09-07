import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HistoryItem = {
  id: string;
  storeUrl: string;
  createdAt: string;
};

export type AnalysisPayload = {
  id: string;
  storeUrl: string;
  createdAt: string;
  json: string;
};

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HistoryItem[]> => {
    const { data, error } = await context.supabase
      .from("analyses")
      .select("id, store_url, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: row.id,
      storeUrl: row.store_url,
      createdAt: row.created_at,
    }));
  });

export const getAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<AnalysisPayload> => {
    const { data: row, error } = await context.supabase
      .from("analyses")
      .select("id, store_url, created_at, result_json")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("التحليل غير موجود");

    return {
      id: row.id,
      storeUrl: row.store_url,
      createdAt: row.created_at,
      json: JSON.stringify(row.result_json),
    };
  });
