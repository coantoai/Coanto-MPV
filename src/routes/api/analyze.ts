import { createFileRoute } from "@tanstack/react-router";
import { discoverCompetitors, buildPrompt, getMainSnapshot, normalizeUrl, parseJsonBlock, validateTargetUrl, type AnalyzeInput } from "@/lib/analyze.server";
import { runResearchAnalysis } from "@/lib/ai-engine.server";
import { enforceEvidence } from "@/lib/trust.server";

const MAX_REQUEST_BYTES = 64_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const contentLength = Number(request.headers.get("content-length") ?? "0");
          if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
            return json({ error: "حجم الطلب كبير جدًا." }, 413);
          }

          const rawBody = await request.text();
          if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
            return json({ error: "حجم الطلب كبير جدًا." }, 413);
          }

          let body: Partial<AnalyzeInput>;
          try {
            body = JSON.parse(rawBody) as Partial<AnalyzeInput>;
          } catch {
            return json({ error: "بيانات الطلب غير صالحة." }, 400);
          }

          const { getUserIdFromRequest } = await import("@/lib/auth.server");
          const userId = await getUserIdFromRequest(request);
          if (!userId) return json({ error: "يجب تسجيل الدخول لتشغيل التحليل." }, 401);

          const storeUrl = typeof body.storeUrl === "string" ? body.storeUrl.trim() : "";
          const competitors = Array.isArray(body.competitors)
            ? body.competitors.filter((item): item is string => typeof item === "string").slice(0, 10)
            : [];
          if (!storeUrl) return json({ error: "storeUrl مطلوب" }, 400);

          const urlValidation = validateTargetUrl(storeUrl);
          if (!urlValidation.ok) return json({ error: urlValidation.reason }, 400);

          let main;
          try {
            main = await getMainSnapshot(urlValidation.url!);
          } catch {
            return json({ error: "تعذّر جمع أدلة عامة عن الموقع." }, 422);
          }

          const discovered = await discoverCompetitors(main, competitors);
          if (!discovered.length) return json({ error: "لم نجد منافسين يمكن ربطهم بأدلة عامة كافية. لم يتم اختراع نتائج." }, 422);

          let ai;
          try {
            ai = await runResearchAnalysis(buildPrompt(main, discovered));
          } catch (error) {
            console.error("AI analysis failed", error);
            return json({ error: "تعذّر تشغيل محرك التحليل حاليًا." }, 502);
          }

          const analysis = enforceEvidence(parseJsonBlock(ai.text), main, discovered);
          const sources = [main, ...discovered];
          const directCount = sources.filter((source) => source.sourceType === 'direct-site').length;
          const indexedCount = sources.filter((source) => source.sourceType === 'search-index').length;
          const metadata = (analysis['metadata'] && typeof analysis['metadata'] === 'object'
            ? { ...(analysis['metadata'] as Record<string, unknown>) }
            : {}) as Record<string, unknown>;

          Object.assign(metadata, {
            storeUrl: normalizeUrl(urlValidation.url!),
            analyzedAt: new Date().toISOString(),
            aiProvider: ai.provider,
            aiModel: ai.model,
            aiWebSources: ai.sources.length,
            sourceCount: sources.length,
            directEvidenceSources: directCount,
            indexedEvidenceSources: indexedCount,
            freshness: "الآن",
            caveat: indexedCount
              ? "بعض الأدلة جاءت من فهارس بحث عامة لأن بعض المواقع تمنع الوصول الآلي. لم يتم تجاوز أي حماية؛ الأدلة المفهرسة مميزة عن الزيارة المباشرة."
              : "المصادر المتاحة تمت قراءتها مباشرة.",
          });
          analysis['metadata'] = metadata;

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: saved, error } = await supabaseAdmin
              .from("analyses")
              .insert({ user_id: userId, store_url: normalizeUrl(urlValidation.url!), result_json: analysis as never })
              .select("id")
              .single();
            if (error) metadata['saveError'] = "تعذّر حفظ التحليل في السجل.";
            else metadata['id'] = saved.id;
          } catch {
            metadata['saveError'] = "تعذّر حفظ التحليل في السجل.";
          }

          return json(analysis);
        } catch (error) {
          console.error("Analysis request failed", error);
          return json({ error: "حدث خطأ أثناء التحليل. حاول مرة أخرى." }, 500);
        }
      },
    },
  },
});
