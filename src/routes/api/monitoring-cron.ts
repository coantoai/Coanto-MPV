import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchSite, validateTargetUrl } from "@/lib/analyze.server";

const MAX_TARGETS_PER_RUN = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function authorized(request: Request) {
  const expected = process.env["CRON_SECRET"]?.trim();
  if (!expected) return false;
  const provided = request.headers.get("x-cron-secret")?.trim() || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function checkTarget(target: {
  id: string;
  user_id: string;
  name: string;
  url: string;
  interval_hours: number;
}) {
  const checkedAt = new Date();
  const nextCheckAt = new Date(checkedAt.getTime() + Number(target.interval_hours) * 3600000).toISOString();

  try {
    const validation = validateTargetUrl(target.url);
    if (!validation.ok || !validation.url) throw new Error(validation.reason || "الرابط غير صالح.");

    const snapshot = await fetchSite(validation.url);
    const contentHash = createHash("sha256")
      .update(`${snapshot.title}\n${snapshot.description}\n${snapshot.h1.join("\n")}\n${snapshot.h2.join("\n")}\n${snapshot.text}`)
      .digest("hex");

    const { data: previous, error: previousError } = await supabaseAdmin
      .from("monitoring_snapshots")
      .select("id,content_hash,title,checked_at")
      .eq("target_id", target.id)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw new Error(previousError.message);

    const changed = Boolean(previous && previous.content_hash !== contentHash);
    const { error: snapshotError } = await supabaseAdmin.from("monitoring_snapshots").insert({
      user_id: target.user_id,
      target_id: target.id,
      content_hash: contentHash,
      title: snapshot.title,
      text_excerpt: snapshot.text.slice(0, 4000),
      checked_at: checkedAt.toISOString(),
    });
    if (snapshotError) throw new Error(snapshotError.message);

    if (changed) {
      const { error: eventError } = await supabaseAdmin.from("monitoring_events").insert({
        user_id: target.user_id,
        target_id: target.id,
        event_type: "change",
        severity: "medium",
        title: `تغيّر في ${target.name}`,
        summary: "تم اكتشاف تغيّر في المحتوى منذ آخر فحص آلي.",
        evidence: {
          url: validation.url,
          previousHash: previous?.content_hash,
          currentHash: contentHash,
          previousCheckedAt: previous?.checked_at,
          title: snapshot.title,
          trigger: "scheduled",
        },
        detected_at: checkedAt.toISOString(),
      });
      if (eventError) throw new Error(eventError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("monitoring_targets")
      .update({ last_checked_at: checkedAt.toISOString(), next_check_at: nextCheckAt })
      .eq("id", target.id)
      .eq("user_id", target.user_id);
    if (updateError) throw new Error(updateError.message);

    return { id: target.id, ok: true, changed, checkedAt: checkedAt.toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل الفحص الآلي.";
    await supabaseAdmin.from("monitoring_events").insert({
      user_id: target.user_id,
      target_id: target.id,
      event_type: "error",
      severity: "high",
      title: `فشل فحص ${target.name}`,
      summary: message.slice(0, 500),
      evidence: { url: target.url, trigger: "scheduled" },
      detected_at: checkedAt.toISOString(),
    });
    await supabaseAdmin
      .from("monitoring_targets")
      .update({ last_checked_at: checkedAt.toISOString(), next_check_at: nextCheckAt })
      .eq("id", target.id)
      .eq("user_id", target.user_id);
    return { id: target.id, ok: false, changed: false, checkedAt: checkedAt.toISOString(), error: message.slice(0, 500) };
  }
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/api/monitoring-cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const now = new Date().toISOString();
        const { data: targets, error } = await supabaseAdmin
          .from("monitoring_targets")
          .select("id,user_id,name,url,interval_hours")
          .eq("active", true)
          .or(`next_check_at.is.null,next_check_at.lte.${now}`)
          .order("next_check_at", { ascending: true, nullsFirst: true })
          .limit(MAX_TARGETS_PER_RUN);

        if (error) return json({ error: error.message }, 500);
        const results = [];
        for (const target of targets ?? []) results.push(await checkTarget(target));

        return json({
          ok: true,
          checkedAt: new Date().toISOString(),
          selected: results.length,
          changed: results.filter((item) => item.changed).length,
          failed: results.filter((item) => !item.ok).length,
          results,
        });
      },
    },
  },
});
