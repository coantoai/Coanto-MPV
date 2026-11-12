import { getDatabase } from "./database.server";
import type { Admission, AgentDependencies } from "./agent-api.server";
import { z } from "zod";
const admission = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("started") }),
  z.object({ kind: z.literal("cached"), result: z.unknown() }),
  z.object({ kind: z.literal("limited") }),
  z.object({ kind: z.literal("running") }),
  z.object({ kind: z.literal("conflict") }),
]);
export const reserveAgentOperation: AgentDependencies["reserve"] = async (
  input,
) => {
  const { data, error } = await getDatabase().rpc("coanto_agent_admit", {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_tool: input.tool,
    p_input_hash: input.inputHash,
    p_units: input.units,
  });
  if (error) throw Error("Agent admission unavailable");
  return admission.parse(data) as Admission;
};
export const finishAgentOperation: AgentDependencies["finish"] = async (
  userId,
  requestId,
  result,
  errorCode,
) => {
  const { data, error } = await getDatabase().rpc("coanto_agent_finish", {
    p_user_id: userId,
    p_request_id: requestId,
    p_result: result,
    p_error: errorCode,
  });
  if (error || data !== true) throw Error("Agent persistence unconfirmed");
};
export async function readAgentArtifact(userId: string, requestId: string) {
  const { data, error } = await getDatabase()
    .from("agent_tool_runs")
    .select("tool,result_json,created_at")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("status", "succeeded")
    .maybeSingle();
  if (error || !data) throw Error("Artifact unavailable");
  return data as { tool: string; result_json: unknown; created_at: string };
}
