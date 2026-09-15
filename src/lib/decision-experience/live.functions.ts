import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import { getDatabase } from "@/lib/database.server";

export type LinkedEvidence = {
  id: string;
  kind: string;
  url: string | null;
  group: string;
  observedAt: string | null;
  retrievedAt: string | null;
  content: string;
  status: string;
};
/** Read-only, analysis-owned projection. Never exposes the shared ledger by arbitrary evidence ID. */
export const getLinkedEvidence = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<LinkedEvidence[]> => {
    const db = getDatabase();
    const owned = await db
      .from("analyses")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (owned.error || !owned.data) throw new Error("Analysis unavailable.");
    const links = await db
      .from("analysis_evidence_links")
      .select("evidence_id")
      .eq("user_id", context.userId)
      .eq("analysis_id", data.id)
      .limit(150);
    if (links.error) throw new Error("Evidence links unavailable.");
    const ids = [
      ...new Set((links.data ?? []).map((row) => String(row.evidence_id))),
    ];
    if (!ids.length) return [];
    const evidence = await db
      .from("coanto_evidence")
      .select(
        "id,kind,source_url,source_group,observed_at,retrieved_at,content,status",
      )
      .in("id", ids)
      .limit(150);
    if (evidence.error) throw new Error("Evidence ledger unavailable.");
    return (evidence.data ?? []).map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      url: typeof row.source_url === "string" ? row.source_url : null,
      group: String(row.source_group ?? ""),
      observedAt: typeof row.observed_at === "string" ? row.observed_at : null,
      retrievedAt:
        typeof row.retrieved_at === "string" ? row.retrieved_at : null,
      content: String(row.content ?? "").slice(0, 6000),
      status: String(row.status ?? "unknown"),
    }));
  });
