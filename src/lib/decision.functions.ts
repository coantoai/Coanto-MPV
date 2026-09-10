import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";

type Row = { id: string; store_url: string; created_at: string; result_json: unknown };

export type Decision = {
  id: string;
  storeUrl: string;
  createdAt: string;
  title: string;
  action: string;
  rationale: string;
  priority: "critical" | "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  evidenceCount: number;
  evidenceBasis: string[];
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is Record<string, unknown> =>
          Boolean(x) && typeof x === "object" && !Array.isArray(x),
      )
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function priorityOf(value: unknown): Decision["priority"] {
  const p = text(value).toLowerCase();
  return p === "critical" || p === "high" || p === "low" ? p : "medium";
}

function confidenceOf(result: Record<string, unknown>): Decision["confidence"] {
  const metadata = obj(result["metadata"]);
  const snapshot = obj(result["snapshot"]);
  const strength = text(
    metadata["evidenceStrength"] || snapshot["evidenceStrength"],
  ).toLowerCase();

  if (strength === "high" || strength === "strong") return "high";
  if (strength === "low" || strength === "weak") return "low";

  const evidence = num(metadata["evidenceCount"] || metadata["sourceCount"]);
  return evidence >= 5 ? "high" : evidence >= 2 ? "medium" : "low";
}

export function buildDecision(row: Row): Decision {
  const result = obj(row.result_json);
  const pulse = obj(result["decisionPulse"]);
  const pulseAction = obj(pulse["action"]);
  const actions = arr(result["actions"] || result["action_plan"]);
  const first = actions[0] || {};
  const matrix = arr(result["priorityMatrix"] || result["priority_matrix"]);
  const firstMatrix = matrix[0] || {};

  const action =
    text(
      first["action"] ||
        first["title"] ||
        first["description"] ||
        pulseAction["title"] ||
        pulseAction["description"] ||
        result["next_action"],
    ) || "مراجعة الإشارات ذات التأثير الأعلى وتحديد خطوة تنفيذية.";

  const title =
    text(
      pulseAction["title"] ||
        first["title"] ||
        firstMatrix["title"] ||
        firstMatrix["action"],
    ) || "قرار تنافسي جديد";

  const rationale =
    text(
      first["rationale"] ||
        first["reason"] ||
        first["evidence"] ||
        first["detail"] ||
        pulseAction["description"] ||
        result["summary"],
    ) || "القرار مبني على آخر تحليل محفوظ والأدلة المتاحة وقت التنفيذ.";

  const priority = priorityOf(
    first["priority"] ||
      first["severity"] ||
      first["impact"] ||
      firstMatrix["priority"] ||
      obj(pulse["threat"])["severity"],
  );

  const metadata = obj(result["metadata"]);
  const evidenceCount = Math.max(
    0,
    num(metadata["evidenceCount"] || metadata["sourceCount"]),
  );

  const basis = [
    ...arr(result["trust"])
      .map((x) => text(x["detail"] || x["title"]))
      .filter(Boolean),
    ...arr(result["signals"])
      .slice(0, 3)
      .map((x) => text(x["evidence"] || x["detail"] || x["title"]))
      .filter(Boolean),
  ].slice(0, 5);

  return {
    id: row.id,
    storeUrl: row.store_url,
    createdAt: row.created_at,
    title,
    action,
    rationale,
    priority,
    confidence: confidenceOf(result),
    evidenceCount,
    evidenceBasis: basis,
  };
}

export const getLatestDecision = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Decision | null> => {
    const { data, error } = await context.supabase
      .from("analyses")
      .select("id, store_url, created_at, result_json")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? buildDecision(data as Row) : null;
  });
