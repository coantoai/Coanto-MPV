import { z } from "zod";
import {
  toolPolicies,
  type AgentTool,
  type AgentPrincipal,
} from "./agent-api.server";
import { searchAgentProvider, safeAgentUrl } from "./agent-search.server";
import {
  collectEvidence,
  type EvidenceCollectionResult,
} from "./evidence-collector.server";
import {
  acquireAgentSnapshot,
  requireAgentHost,
} from "./agent-acquisition.server";
import { applyEvidenceVerification } from "./evidence-verification.server";
import { assessTrust } from "./trust-engine.server";
import {
  buildCompetitiveIntelligence,
  type IntelligenceEvent,
} from "./intelligence-engine.server";
import { buildDecisions } from "./decision-engine.server";
import { getBusinessContext } from "./business-context.server";
import { getDatabase } from "./database.server";
import { readAgentArtifact } from "./agent-store.server";
import type { EvidenceRecord } from "./evidence-engine.server";

export type AgentServiceDependencies = {
  context(userId: string): Promise<unknown>;
  research: typeof searchAgentProvider;
  readArtifact: typeof readAgentArtifact;
  collect(
    urls: string[],
    principal: AgentPrincipal,
  ): Promise<EvidenceCollectionResult>;
  monitoring(userId: string): Promise<IntelligenceEvent[]>;
  listDecisions(userId: string, limit: number): Promise<unknown[]>;
};
const researchShape = z.object({
  provider: z.enum(["serper", "exa"]),
  status: z.string(),
  results: z
    .array(
      z.object({
        url: z.string(),
        provider: z.enum(["serper", "exa"]),
        title: z.string(),
        snippet: z.string(),
        sourceType: z.literal("search-index"),
      }),
    )
    .max(5),
});
function sourceTrust(records: EvidenceRecord[]) {
  return assessTrust(
    records
      .filter((r) => r.status !== "REJECTED")
      .map((r) => ({
        id: r.id,
        sourceUrl: r.sourceUrl,
        sourceGroup: r.sourceGroup,
        kind: r.kind,
        observedAt: r.observedAt,
        // Source provenance only. This does not validate arbitrary market claims.
        supportsClaim: r.status === "VERIFIED",
        contradictsClaim: Boolean(r.contradictsClaim),
        directness: r.kind === "direct" ? 1 : 0.65,
        reliability: r.status === "VERIFIED" ? 0.9 : 0.6,
      })),
  );
}
export function createAgentServices(deps: AgentServiceDependencies) {
  return async (
    tool: AgentTool,
    input: Record<string, unknown>,
    principal: AgentPrincipal,
  ): Promise<unknown> => {
    const userId = principal.userId;
    if (tool === "get_business_context") return deps.context(userId);
    if (tool === "research")
      return deps.research(
        input["provider"] as "serper" | "exa",
        String(input["query"]),
        Number(input["maxResults"] ?? 5),
      );
    if (tool === "get_artifact") {
      const artifact = await deps.readArtifact(
        userId,
        String(input["requestId"]),
      );
      if (
        artifact.tool === "get_artifact" ||
        !Object.hasOwn(toolPolicies, artifact.tool) ||
        !principal.scopes.includes(
          toolPolicies[artifact.tool as AgentTool].scope,
        )
      )
        throw Error("Artifact scope denied");
      return artifact;
    }
    if (tool === "list_decisions")
      return deps.listDecisions(userId, Number(input["limit"] ?? 10));
    if (tool === "collect_evidence") {
      const artifact = await deps.readArtifact(
        userId,
        String(input["researchId"]),
      );
      if (artifact.tool !== "research") throw Error("Not research");
      const research = researchShape.parse(artifact.result_json);
      if (research.status !== "ok") throw Error("Research unsuccessful");
      const selected = [...new Set(input["indexes"] as number[])].map(
        (index) => research.results[index],
      );
      if (selected.some((hit) => !hit || hit.provider !== research.provider))
        throw Error("Invalid result selection");
      const urls = selected.map(
        (hit) => requireAgentHost(hit!.url, principal.allowedHosts).href,
      );
      const collected = await deps.collect(urls, principal);
      const records = collected.records.map((record) => {
        requireAgentHost(record.sourceUrl, principal.allowedHosts);
        const verified = applyEvidenceVerification(record);
        return {
          ...verified,
          content: verified.content.slice(0, 8000),
          metadata: {
            ...verified.metadata,
            researchProvider: research.provider,
            researchRequestId: String(input["researchId"]),
          },
        };
      });
      // No content mutation after hashing: acquire/collector caps the actual stored content.
      for (const record of records)
        if (
          record.content !==
          collected.records.find((r) => r.id === record.id)?.content
        )
          throw Error("Evidence exceeds artifact limit");
      return {
        researchId: input["researchId"],
        provider: research.provider,
        records,
        rejected: collected.rejected.map((r) => ({
          url: r.url,
          reason: "SOURCE_UNAVAILABLE",
        })),
        sourceTrust: sourceTrust(records),
        claimVerification: "NOT_PERFORMED",
      };
    }
    if (tool === "run_pipeline") {
      const artifact = await deps.readArtifact(
        userId,
        String(input["evidenceId"]),
      );
      if (artifact.tool !== "collect_evidence")
        throw Error("Not collected evidence");
      const stored = artifact.result_json as { records: EvidenceRecord[] };
      if (!Array.isArray(stored.records) || stored.records.length > 3)
        throw Error("Invalid evidence artifact");
      const records = stored.records.map((r) => applyEvidenceVerification(r));
      const trust = sourceTrust(records);
      const urls = new Set(
        records
          .filter((r) => r.status === "VERIFIED")
          .map((r) => new URL(safeAgentUrl(r.sourceUrl)).hostname),
      );
      const persistedEvents = await deps.monitoring(userId);
      const related = persistedEvents.filter((event) => {
        const evidence = event.evidence as { url?: unknown } | null;
        try {
          return (
            typeof evidence?.url === "string" &&
            urls.has(new URL(safeAgentUrl(evidence.url)).hostname)
          );
        } catch {
          return false;
        }
      });
      const intelligence = buildCompetitiveIntelligence({
        events: trust.canRecommend ? related : [],
        analysesCount: 0,
        memoryItemsCount: 0,
        decisionsCount: 0,
      });
      const result = buildDecisions(
        intelligence.insights.map((insight, index) => ({
          ...insight,
          id: `agent:${String(input["evidenceId"])}:${index}`,
          sourceAnalysisId: null,
        })),
      );
      return {
        evidenceId: input["evidenceId"],
        sourceTrust: trust,
        insights: intelligence.insights,
        metrics: intelligence.metrics,
        decisions: result.decisions,
        rejected: result.rejected,
        status: trust.canRecommend ? "evaluated" : "insufficient-source-trust",
        persistedMonitoringEvents: related.length,
        policy:
          "Only existing tenant monitoring changes produce intelligence. Research text never creates changes. Decisions are proposed drafts; existing decision state is not modified.",
      };
    }
    throw Error("Unsupported tool");
  };
}
export const agentServices = createAgentServices({
  context: getBusinessContext,
  research: searchAgentProvider,
  readArtifact: readAgentArtifact,
  collect: async (urls, principal) =>
    collectEvidence(
      { urls, maxSources: 3 },
      {
        acquire: async (url) => {
          const snapshot = await acquireAgentSnapshot(
            url,
            principal.allowedHosts,
          );
          // Cap before the existing collector computes evidence identity/content hashes.
          return {
            ...snapshot,
            text: snapshot.text.slice(0, 4000),
            h1: snapshot.h1.slice(0, 3).map((s) => s.slice(0, 300)),
            h2: [],
            description: snapshot.description.slice(0, 500),
            title: snapshot.title.slice(0, 500),
          };
        },
        search: async () => null,
      },
    ),
  monitoring: async (userId) => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await getDatabase()
      .from("monitoring_events")
      .select(
        "id,event_type,severity,change_score,title,summary,evidence,detected_at,target_id",
      )
      .eq("user_id", userId)
      .gte("detected_at", since)
      .order("detected_at", { ascending: false })
      .limit(100);
    if (error) throw Error("Monitoring unavailable");
    return (data ?? []).map((r: any) => ({
      id: String(r.id),
      eventType: String(r.event_type),
      severity: String(r.severity),
      changeScore: Number(r.change_score ?? 0),
      title: String(r.title),
      summary: String(r.summary),
      evidence: r.evidence,
      detectedAt: String(r.detected_at),
      targetId: String(r.target_id),
    }));
  },
  listDecisions: async (userId, limit) => {
    const { data, error } = await getDatabase()
      .from("decisions")
      .select(
        "id,title,action,rationale,priority,confidence,evidence_count,evidence,status",
      )
      .eq("user_id", userId)
      .order("score", { ascending: false })
      .limit(limit);
    if (error) throw Error("Decisions unavailable");
    return data ?? [];
  },
});
