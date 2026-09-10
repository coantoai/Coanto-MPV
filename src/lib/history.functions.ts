import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { getDatabase } from "@/lib/database.server";

export type HistoryItem = { id: string; storeUrl: string; createdAt: string };
export type AnalysisPayload = { id: string; storeUrl: string; createdAt: string; json: string };

export const listAnalyses = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<HistoryItem[]> => {
    const { data, error } = await getDatabase()
      .from("analyses")
      .select("id, store_url, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({ id: String(row.id), storeUrl: String(row.store_url), createdAt: String(row.created_at) }));
  });

export const getAnalysis = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<AnalysisPayload> => {
    const { data: row, error } = await getDatabase()
      .from("analyses")
      .select("id, store_url, created_at, result_json")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("التحليل غير موجود");
    return { id: String(row.id), storeUrl: String(row.store_url), createdAt: String(row.created_at), json: JSON.stringify(row.result_json) };
  });
