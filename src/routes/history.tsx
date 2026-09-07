import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpLeft, Clock3, Eye, History, Loader2, ShieldCheck, Target } from "lucide-react";
import { listAnalyses, getAnalysis, type HistoryItem } from "@/lib/history.functions";

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "COANTO — سجل القرارات" },
      { name: "description", content: "ذاكرة قرارات وتحليلات COANTO." },
    ],
  }),
});

type AnalysisView = HistoryItem & {
  competitorCount: number;
  signalCount: number;
  evidenceCount: number;
  nextAction: string;
  summary: string;
  threatLevel: string;
  opportunityLevel: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toView(item: HistoryItem, json?: string): AnalysisView {
  let result: Record<string, unknown> = {};
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed as Record<string, unknown>;
    } catch { /* Keep the history row usable even if old JSON is malformed. */ }
  }
  return {
    ...item,
    competitorCount: count(result.competitor_count),
    signalCount: count(result.signal_count),
    evidenceCount: count(result.evidence_count),
    nextAction: text(result.next_action),
    summary: text(result.summary),
    threatLevel: text(result.threat_level),
    opportunityLevel: text(result.opportunity_level),
  };
}

function formatCreatedAt(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar");
}

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<AnalysisView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAnalyses({})
      .then((result) => { if (active) setItems(result as HistoryItem[]); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل القرارات."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function openAnalysis(item: HistoryItem) {
    setError(null);
    try {
      const result = await getAnalysis({ data: { id: item.id } });
      setSelected(toView(item, result.json));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح التحليل.");
    }
  }

  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
    <header className="border-b border-white/[0.07] bg-[#080d15]"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><a href="/" className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]"><Target size={18}/></div><b className="tracking-[4px] text-[#25cdb8]">COANTO</b></a><a href="/demo" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300">الديمو</a></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-8"><div><div className="flex items-center gap-2 text-[#25cdb8]"><History size={18}/><span className="text-xs font-black tracking-[2px]">DECISION MEMORY</span></div><h1 className="mt-3 text-3xl font-black">سجل القرارات والتحليلات</h1><p className="mt-2 text-sm text-slate-500">التحليلات المحفوظة لحسابك، مع الأدلة والنبضات التي قادت إلى القرار.</p></div>
      {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}
      {loading ? <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-[#0b121b] p-12 text-slate-400"><Loader2 className="ml-2 animate-spin" size={18}/> جاري تحميل الذاكرة…</div> : items.length === 0 ? <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-10 text-center"><p className="font-bold">لا توجد تحليلات محفوظة بعد.</p><a href="/" className="mt-4 inline-flex rounded-xl bg-[#25cdb8] px-5 py-3 text-xs font-black text-[#04110e]">ابدأ أول تحليل</a></div> : <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">{items.map(item => <button key={item.id} onClick={() => openAnalysis(item)} className={`w-full rounded-2xl border p-4 text-right transition ${selected?.id === item.id ? "border-[#25cdb8]/40 bg-[#25cdb8]/5" : "border-white/10 bg-[#0b121b] hover:border-white/20"}`}><div className="flex items-start justify-between gap-3"><div><b className="text-sm">{item.storeUrl}</b><div className="mt-2 flex items-center gap-2 text-[10px] text-slate-600"><Clock3 size={12}/>{formatCreatedAt(item.createdAt)}</div></div><Eye size={16} className="text-slate-500"/></div>{selected?.id === item.id && <div className="mt-3 flex gap-2 text-[10px] text-slate-500"><span>Competitors: {selected.competitorCount}</span><span>Signals: {selected.signalCount}</span><span>Evidence: {selected.evidenceCount}</span></div>}</button>)}</div>
        <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6">{selected ? <><div className="flex items-center gap-2 text-sm font-black text-[#25cdb8]"><ShieldCheck size={17}/> Decision Pulse</div><h2 className="mt-5 text-xl font-black">{selected.nextAction || "التحليل محفوظ"}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{selected.summary || "تم حفظ التحليل مع بيانات الأدلة المتاحة وقت التنفيذ."}</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="التهديد" value={selected.threatLevel || "—"}/><Metric label="الفرصة" value={selected.opportunityLevel || "—"}/><Metric label="الأدلة" value={String(selected.evidenceCount)}/></div><a href="/" className="mt-6 inline-flex items-center gap-2 text-xs font-black text-[#25cdb8]">تحليل جديد <ArrowUpLeft size={14}/></a></> : <div className="grid min-h-64 place-items-center text-center text-slate-500"><History size={28}/><p>اختر تحليلاً لعرض ذاكرة القرار.</p></div>}</section>
      </div>}</main>
  </div>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/[0.07] bg-[#090f17] p-4"><div className="text-[10px] text-slate-600">{label}</div><div className="mt-2 text-sm font-black">{value}</div></div>}
