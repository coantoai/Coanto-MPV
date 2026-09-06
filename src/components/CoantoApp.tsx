import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpLeft, CheckCircle2, CircleDot, Clock3, Crosshair, Eye, Search, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Analysis = {
  metadata: Record<string, any>;
  decisionPulse: any;
  snapshot: any;
  signals: any[];
  competitors: any[];
  beforeAfter: any[];
  impact: any;
  scenarios: any[];
  priorityMatrix: any[];
  actions: any[];
  trust: any[];
  unknowns: string[];
};

const tone: Record<string, string> = {
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

export default function CoantoApp() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const nav = useNavigate();

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        await nav({ to: "/auth" });
        return;
      }
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ storeUrl: url, competitors: [] }),
      });
      const out = JSON.parse(await response.text());
      if (!response.ok) throw new Error(out.error || "فشل التحليل");
      setAnalysis(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080d15]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]"><Crosshair size={18} /></div><div><div className="text-sm font-black tracking-[4px] text-[#25cdb8]">COANTO</div><div className="text-[10px] text-slate-500">EVIDENCE → INTELLIGENCE → DECISION</div></div></div>
          <button onClick={() => nav({ to: "/auth" })} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">الحساب</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <section className="relative overflow-hidden rounded-[28px] border border-[#1d3344] bg-[radial-gradient(circle_at_80%_0%,rgba(37,205,184,.13),transparent_35%),#0b121b] p-7 md:p-10">
          <div className="absolute left-0 top-0 h-px w-2/3 bg-gradient-to-l from-[#25cdb8]/0 via-[#25cdb8]/60 to-[#25cdb8]/0" />
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-black tracking-[2px] text-[#25cdb8]"><Sparkles size={14} /> COMPETITIVE DECISION INTELLIGENCE</div>
            <h1 className="text-3xl font-black leading-tight md:text-5xl">أدخل موقعك.<br /><span className="text-slate-400">نكتشف من ينافسك، ثم نخبرك ماذا يعني ذلك.</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">الموقع الذي تدخله هو baseline فقط. COANTO يكتشف المنافسين من الأدلة العامة، يتحقق منهم، ثم يحوّل التغيّرات إلى قرارات قابلة للتنفيذ.</p>
            <form onSubmit={run} className="mt-7 flex flex-col gap-3 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#070c13] px-4 py-1 focus-within:border-[#25cdb8]/60"><Search size={18} className="shrink-0 text-slate-500" /><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com" className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-slate-600" /></div>
              <button disabled={loading} className="rounded-2xl bg-[#25cdb8] px-7 py-3 font-black text-[#04110e] transition hover:brightness-110 disabled:opacity-50">{loading ? "جاري الاكتشاف والتحقق..." : "اكتشف وحلّل"}</button>
            </form>
            {error && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200"><AlertTriangle size={18} className="mt-0.5 shrink-0" />{error}</div>}
          </div>
        </section>

        {analysis && <Results analysis={analysis} />}
      </main>
    </div>
  );
}

function Results({ analysis: a }: { analysis: Analysis }) {
  const evidenceStrength = a.metadata.evidenceStrength || a.snapshot?.evidenceStrength || "medium";
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="المنافسون" value={a.snapshot?.competitorCount ?? a.competitors.length} icon={<Target size={17} />} />
        <Stat label="الإشارات" value={a.snapshot?.meaningfulSignals ?? a.signals.length} icon={<TrendingUp size={17} />} />
        <Stat label="الأدلة" value={a.metadata.evidenceCount ?? a.metadata.sourceCount ?? 0} icon={<Eye size={17} />} />
        <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16} />قوة الدليل</div><div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${tone[evidenceStrength] || tone.medium}`}>{labelStrength(evidenceStrength)}</div></div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Pulse title="تهديد" icon={<AlertTriangle size={18} />} data={a.decisionPulse?.threat} toneClass="border-red-400/20 bg-red-400/[0.04]" />
        <Pulse title="فرصة" icon={<TrendingUp size={18} />} data={a.decisionPulse?.opportunity} toneClass="border-emerald-400/20 bg-emerald-400/[0.04]" />
        <Pulse title="الخطوة التالية" icon={<ArrowUpLeft size={18} />} data={a.decisionPulse?.action} toneClass="border-[#25cdb8]/20 bg-[#25cdb8]/[0.04]" />
      </section>

      <Section title="المنافسون المكتشفون" subtitle="ليس كل اسم ظهر في البحث منافسًا. هذه القائمة تمر عبر بوابة الأدلة.">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{a.competitors.map((c, i) => <Competitor key={i} item={c} />)}</div>
      </Section>

      <Section title="خريطة الأولوية" subtitle="Impact × Ease — أين تستحق طاقتك أن تذهب أولًا?"><PriorityMatrix items={a.priorityMatrix} /></Section>
      <Section title="إشارات تستحق الانتباه" subtitle="نركّز على ما يمكن أن يغيّر قرارًا، لا على كل ما تغيّر."><div className="space-y-3">{a.signals.slice(0, 8).map((s, i) => <Signal key={i} item={s} />)}</div></Section>
      {a.beforeAfter?.length > 0 && <Section title="قبل / بعد" subtitle="التغيّر المرئي الذي يجب أن تفهم سببه."><div className="grid gap-3 md:grid-cols-2">{a.beforeAfter.map((x, i) => <BeforeAfter key={i} item={x} />)}</div></Section>}
      {a.scenarios?.length > 0 && <Section title="ماذا لو؟" subtitle="السيناريو لا يقرر بدلًا منك؛ يوضح خياراتك وتبعاتها."><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{a.scenarios.map((x, i) => <Scenario key={i} item={x} />)}</div></Section>}
      <Section title="خطة العمل" subtitle="من التحليل إلى التنفيذ — بدون قائمة طويلة من الأفكار."><ActionPlan items={a.actions} /></Section>

      <Section title="سلسلة الثقة" subtitle="كل استنتاج يجب أن يبقى قابلًا للتتبع إلى دليل.">
        <div className="grid gap-3 md:grid-cols-4"><TrustStep icon={<Search size={17} />} title="اكتشاف" text="بحث عام متعدد المصادر" /><TrustStep icon={<Eye size={17} />} title="تحقق" text="زيارة مباشرة أو دليل مفهرس" /><TrustStep icon={<ShieldCheck size={17} />} title="بوابة الدليل" text="حذف الادعاءات غير القابلة للربط" /><TrustStep icon={<Sparkles size={17} />} title="استنتاج" text="AI يميّز الحقيقة عن التقدير" /></div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">{(a.trust || []).map((t, i) => <span key={i} className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-slate-400">{t.detail}</span>)}</div>
      </Section>

      {a.unknowns?.length > 0 && <section className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-6"><div className="flex items-center gap-2 text-sm font-black text-amber-200"><AlertTriangle size={17} />ما لا نعرفه</div><div className="mt-4 grid gap-2 md:grid-cols-2">{a.unknowns.map((x, i) => <div key={i} className="rounded-xl border border-amber-400/10 bg-black/10 p-3 text-xs leading-6 text-amber-100/70">{x}</div>)}</div></section>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4 text-[11px] text-slate-600"><span>{a.metadata.caveat}</span><span>{a.metadata.aiProvider} · {a.metadata.aiModel} · {a.metadata.analyzedAt ? new Date(a.metadata.analyzedAt).toLocaleString("ar-LB") : ""}</span></div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: any; icon: ReactNode }) { return <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-4"><div className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>; }
function Pulse({ title, icon, data, toneClass }: { title: string; icon: ReactNode; data: any; toneClass: string }) { const level = data?.severity || data?.strength || data?.priority || "medium"; return <div className={`rounded-3xl border p-5 ${toneClass}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-black text-slate-400">{icon}{title}</div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${tone[level] || tone.medium}`}>{String(level).toUpperCase()}</span></div><div className="mt-5 text-lg font-black">{data?.title || "غير محدد"}</div><p className="mt-2 text-sm leading-7 text-slate-400">{data?.description || "لا توجد أدلة كافية."}</p></div>; }
function Competitor({ item }: { item: any }) { const relevance = Math.max(0, Math.min(100, Number(item.relevance) || 0)); const impact = Math.max(0, Math.min(100, Number(item.impact) || 0)); return <div className="rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{item.name || "منافس"}</div><div className="mt-1 text-[11px] text-slate-600">{item.url || ""}</div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${tone[item.threat] || tone.medium}`}>{item.threat || "medium"}</span></div><p className="mt-3 text-xs leading-6 text-slate-400">{item.note || "تم ربطه بالأدلة المكتشفة."}</p><Bar label="الصلة" value={relevance} /><Bar label="التأثير" value={impact} /></div>; }
function Bar({ label, value }: { label: string; value: number }) { return <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-slate-600"><span>{label}</span><span>{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#25cdb8]" style={{ width: `${value}%` }} /></div></div>; }
function Signal({ item }: { item: any }) { return <div className="flex gap-4 rounded-2xl border border-white/[0.07] bg-[#090f17] p-4"><div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]"><CircleDot size={16} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm">{item.title || "إشارة"}</b><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${tone[item.impact] || tone.medium}`}>{item.impact || "medium"}</span></div><div className="mt-1 text-xs leading-6 text-slate-400">{item.detail || ""}</div><div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-600"><span>{item.competitor || "السوق"}</span><span>الدليل: {item.evidence || "غير محدد"}</span></div></div></div>; }
function BeforeAfter({ item }: { item: any }) { return <div className="rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex gap-3"><div className="flex-1"><div className="text-[10px] font-black text-slate-600">قبل</div><div className="mt-2 text-sm text-slate-400">{item.before || item.from || "—"}</div></div><ArrowUpLeft className="mt-5 text-[#25cdb8]" size={18} /><div className="flex-1"><div className="text-[10px] font-black text-[#25cdb8]">بعد</div><div className="mt-2 text-sm font-bold">{item.after || item.to || "—"}</div></div></div></div>; }
function Scenario({ item }: { item: any }) { return <div className="rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex items-center gap-2 text-xs font-black"><Target size={15} className="text-[#25cdb8]" />{item.title || item.name || "سيناريو"}</div><p className="mt-3 text-xs leading-6 text-slate-400">{item.description || item.detail || item.response || ""}</p><div className="mt-3 text-[10px] text-slate-600">القرار المقترح: {item.action || item.recommendation || "مراقبة"}</div></div>; }
function PriorityMatrix({ items }: { items: any[] }) { const list = items || []; const cells = ["do-now", "test", "monitor", "ignore"]; const names: Record<string, string> = { "do-now": "نفّذ الآن", test: "اختبر", monitor: "راقب", ignore: "تجاهل" }; return <div className="grid gap-2 md:grid-cols-2">{cells.map((cell) => { const matches = list.filter((x) => String(x.zone || x.bucket || x.quadrant || "").toLowerCase().replace(/\s+/g, "-") === cell); return <div key={cell} className="min-h-28 rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex items-center justify-between"><b className="text-xs">{names[cell]}</b><span className="text-[10px] text-slate-600">{matches.length}</span></div><div className="mt-3 space-y-2">{matches.slice(0, 3).map((x, i) => <div key={i} className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">{x.title || x.action || x.name || "إجراء"}</div>)}</div></div>; })}</div>; }
function ActionPlan({ items }: { items: any[] }) { const groups = [{ key: "today", title: "اليوم" }, { key: "week", title: "هذا الأسبوع" }, { key: "later", title: "لاحقًا" }]; const all = items || []; return <div className="grid gap-3 md:grid-cols-3">{groups.map((g, index) => { const matches = all.filter((x) => String(x.when || x.timing || x.phase || "").toLowerCase().includes(g.key)); const fallback = matches.length ? matches : all.slice(index, index + 1); return <div key={g.key} className="rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex items-center gap-2 text-xs font-black"><Clock3 size={15} className="text-[#25cdb8]" />{g.title}</div><div className="mt-3 space-y-2">{fallback.map((x, i) => <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-xs font-bold">{x.title || x.action || "إجراء"}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">{x.description || x.why || x.measure || ""}</div></div>)}</div></div>; })}</div>; }
function TrustStep({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-white/10 bg-[#090f17] p-4"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]">{icon}</div><div className="mt-3 text-xs font-black">{title}</div><div className="mt-1 text-[10px] leading-5 text-slate-600">{text}</div></div>; }
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) { return <section className="rounded-[28px] border border-[#1b2a39] bg-[#0b121b] p-5 md:p-6"><div className="mb-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between"><div><h2 className="text-xl font-black">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-600">{subtitle}</p>}</div><CheckCircle2 size={18} className="text-[#25cdb8]" /></div>{children}</section>; }
function labelStrength(value: string) { return value === "high" ? "قوي" : value === "low" ? "محدود" : "متوسط"; }
