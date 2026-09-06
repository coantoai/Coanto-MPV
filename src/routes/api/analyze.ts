import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { discoverCompetitors, buildPrompt, getMainSnapshot, normalizeUrl, parseJsonBlock, type AnalyzeInput } from "@/lib/analyze.server";
import { createLovableAiGatewayProvider, getLovableAiGatewayRunId } from "@/lib/ai-gateway.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getUserIdFromRequest } = await import("@/lib/auth.server");
          const userId = await getUserIdFromRequest(request);
          if (!userId) return json({ error: "يجب تسجيل الدخول لتشغيل التحليل." }, 401);

          const body = (await request.json()) as Partial<AnalyzeInput>;
          const storeUrl = typeof body.storeUrl === "string" ? body.storeUrl.trim() : "";
          const competitors = Array.isArray(body.competitors)
            ? body.competitors.filter((item): item is string => typeof item === "string").slice(0, 10)
            : [];
          if (!storeUrl) return json({ error: "storeUrl مطلوب" }, 400);

          const key = process.env["LOVABLE_API_KEY"];
          if (!key) return json({ error: "خدمة الذكاء الاصطناعي غير مهيأة." }, 500);

          let main;
          try {
            main = await getMainSnapshot(storeUrl);
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "تعذّر جمع أدلة عامة عن الموقع." }, 422);
          }

          const discovered = await discoverCompetitors(main, competitors);
          if (!discovered.length) return json({ error: "لم نجد منافسين يمكن ربطهم بأدلة عامة كافية. لم يتم اختراع نتائج." }, 422);

          const gateway = createLovableAiGatewayProvider(key, getLovableAiGatewayRunId(request));
          const result = streamText({
            model: gateway("google/gemini-3.7-flash"),
            prompt: buildPrompt(main, discovered),
            temperature: 0.15,
          });
          const analysis = parseJsonBlock(await result.text);
          const sources = [main, ...discovered];
          const directCount = sources.filter((source) => source.sourceType === 'direct-site').length;
          const indexedCount = sources.filter((source) => source.sourceType === 'search-index').length;

          analysis.metadata = {
            storeUrl: normalizeUrl(storeUrl),
            analyzedAt: new Date().toISOString(),
            sourceCount: sources.length,
            directEvidenceSources: directCount,
            indexedEvidenceSources: indexedCount,
            freshness: "الآن",
            caveat: indexedCount
              ? "بعض الأدلة جاءت من فهارس بحث عامة لأن بعض المواقع تمنع الوصول الآلي. لم يتم تجاوز أي حماية؛ الأدلة المفهرسة مميزة عن الزيارة المباشرة."
              : "المصادر المتاحة تمت قراءتها مباشرة.",
          };

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: saved, error } = await supabaseAdmin
              .from("analyses")
              .insert({ user_id: userId, store_url: normalizeUrl(storeUrl), result_json: analysis })
              .select("id")
              .single();
            if (error) analysis.metadata.saveError = "تعذّر حفظ التحليل في السجل.";
            else analysis.metadata.id = saved.id;
          } catch {
            analysis.metadata.saveError = "تعذّر حفظ التحليل في السجل.";
          }

          return json(analysis);
        } catch (error) {
          console.error(error);
          return json({ error: error instanceof Error ? error.message : "حدث خطأ أثناء التحليل" }, 500);
        }
      },
    },
  },
});
