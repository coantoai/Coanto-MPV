import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpLeft, Clock3, Eye, History, Loader2, ShieldCheck, Target } from "lucide-react";
import { listAnalyses, getAnalysis, type HistoryItem } from "@/lib/history.functions";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "COANTO — سجل القرارات" },
      { name: "description", content: "سجل تحليلات COANTO والقرارات المبنية على الأدلة." },
    ],
  }),
});

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listAnalyses({})
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "تعذّر تحميل السجل."))
      .finally(() => setLoading(false));
  }, []);

  async function openAnalysis(id: string) {
    try {
      const result = await getAnalysis({ data: { id } });
      setSelected(JSON.parse(result.json));
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر فتح التحليل.");
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080d15]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]"><Target size={18} /></div>
            <div><div className="text-sm font-black tracking-[4px] text-[#25cdb8]">COANTO</div><div className="text-[10px] text-slate-500">EVIDENCE → INTELLIGENCE → DECISION</div></div>
          </a>
          <a href="/" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">تحليل جديد</a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <section className="rounded-[28px] border border-[#1d3344] bg-[radial-gradient(circle_at_80%_0%,rgba(37,205,184,.13),transparent_35%),#0b121b] p-7 md:p-10">
          <div className="flex items-center gap-2 text-[11px] font-black tracking-[2px] text-[#25cdb8]"><History size={15} /> DECISION MEMORY</div>
          <h1 className="mt-4 text-3xl font-black md:text-5xl">سجل قراراتك</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">كل تحليل محفوظ يعود كجزء من ذاكرة COANTO، حتى لا تبدأ من الصفر في كل مرة.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-4">
            <div className="mb-3 flex items-center gap-2 px-2 text-xs font-black text-slate-400"><Clock3 size={15} /> آخر التحليلات</div>
            {loading ? <div className="flex items-center gap-2 p-5 text-xs text-slate-500"><Loader2 className="animate-spin" size={16} /> جاري تحميل السجل...</div> : items.length === 0 ? <div className="p-5 text-xs leading-6 text-slate-600">لا توجد تحليلات محفوظة بعد. شغّل أول تحليل من الصفحة الرئيسية.</div> : <div className="space-y-2">{items.map((item) => <button key={item.id} onClick={() => openAnalysis(item.id)} className="w-full rounded-2xl border border-white/[0.07] bg-[#090f17] p-4 text-right transition hover:border-[#25cdb8]/30 hover:bg-white/[0.025]"><div className="truncate text-sm font-black">{item.storeUrl}</div><div className="mt-2 text-[10px] text-slate-600">{new Date(item.createdAt).toLocaleString("ar-LB")}</div></button>)}</div>}
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-6">
            {!selected ? <div className="grid min-h-[360px] place-items-center text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#25cdb8]/10 text-[#25cdb8]"><Eye size={24} /></div><div className="mt-4 font-black">اختر تحليلًا</div><div className="mt-2 text-xs text-slate-600">سنفتح القرار، الأدلة، المنافسين والإشارات المحفوظة.</div></div></div> : <HistoryResult analysis={selected} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function HistoryResult({ analysis }: { analysis: any }) {
  const m = analysis.metadata ?? {};
  const pulse = analysis.decisionPulse ?? {};
  const competitors = analysis.competitors ?? [];
  const signals = analysis.signals ?? [];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs text-slate-600">التحليل المحفوظ</div><h2 className="mt-1 text-xl font-black">{m.storeUrl ?? "موقع"}</h2></div><div className="flex items-center gap-2 rounded-full border border-[#25cdb8]/20 bg-[#25cdb8]/5 px-3 py-1.5 text-[10px] font-black text-[#25cdb8]"><ShieldCheck size={13} /> Evidence-backed</div></div>
    <div className="grid gap-3 md:grid-cols-3"><Mini title="المنافسون" value={analysis.snapshot?.competitorCount ?? competitors.length} /><Mini title="الإشارات" value={analysis.snapshot?.meaningfulSignals ?? signals.length} /><Mini title="الأدلة" value={m.evidenceCount ?? m.sourceCount ?? 0} /></div>
    <div className="grid gap-3 md:grid-cols-3"><Card title="التهديد" data={pulse.threat} /><Card title="الفرصة" data={pulse.opportunity} /><Card title="الخطوة التالية" data={pulse.action} /></div>
    <div><div className="mb-3 text-xs font-black text-slate-500">المنافسون المكتشفون</div><div className="grid gap-2 md:grid-cols-2">{competitors.slice(0, 6).map((c: any, i: number) => <div key={i} className="rounded-xl border border-white/[0.07] bg-[#090f17] p-3"><div className="text-sm font-black">{c.name ?? c.url ?? "منافس"}</div><div className="mt-1 text-[11px] text-slate-600">{c.url ?? c.domain ?? ""}</div></div>)}</div></div>
    <a href="/" className="inline-flex items-center gap-2 rounded-xl bg-[#25cdb8] px-4 py-2.5 text-xs font-black text-[#04110e]">تشغيل تحليل جديد <ArrowUpLeft size={15} /></a>
  </div>;
}

function Mini({ title, value }: { title: string; value: number }) { return <div className="rounded-2xl border border-white/[0.07] bg-[#090f17] p-4"><div className="text-[10px] text-slate-600">{title}</div><div className="mt-1 text-2xl font-black">{value}</div></div>; }
function Card({ title, data }: { title: string; data: any }) { return <div className="rounded-2xl border border-white/[0.07] bg-[#090f17] p-4"><div className="text-[10px] font-black text-slate-600">{title}</div><div className="mt-2 text-sm font-black">{data?.title ?? "غير محدد"}</div><p className="mt-1 text-xs leading-6 text-slate-500">{data?.description ?? "لا توجد أدلة كافية."}</p></div>; }
