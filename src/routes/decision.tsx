import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpLeft, CheckCircle2, Clock3, ShieldCheck, Target } from "lucide-react";
import { getLatestDecision, type Decision } from "@/lib/decision.functions";

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute("/decision")({
  component: DecisionPage,
  head: () => ({
    meta: [
      { title: "COANTO — القرار" },
      {
        name: "description",
        content: "تحويل الذكاء التنافسي إلى قرار واضح وقابل للتنفيذ.",
      },
    ],
  }),
});

const priorityClass: Record<string, string> = {
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
};

function DecisionPage() {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getLatestDecision({})
      .then(setDecision)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "تعذر تحميل القرار."),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
      <header className="border-b border-white/[0.07] bg-[#080d15]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]">
              <Target size={18} />
            </div>
            <b className="tracking-[4px] text-[#25cdb8]">COANTO</b>
          </a>
          <a href="/history" className="text-xs font-bold text-slate-400">
            سجل القرارات
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-5 py-8">
        <div>
          <div className="flex items-center gap-2 text-[#25cdb8]">
            <CheckCircle2 size={18} />
            <span className="text-xs font-black tracking-[2px]">DECISION</span>
          </div>
          <h1 className="mt-3 text-3xl font-black">القرار الذي يستحق التنفيذ الآن</h1>
          <p className="mt-2 text-sm text-slate-500">
            تحويل آخر تحليل محفوظ إلى قرار واضح، مع أولوية وثقة وسند قابل للتتبع.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-12 text-center text-slate-500">
            جاري تحميل القرار…
          </div>
        ) : !decision ? (
          <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-10 text-center">
            <p className="font-bold">لا يوجد تحليل محفوظ بعد.</p>
            <a
              href="/"
              className="mt-4 inline-flex rounded-xl bg-[#25cdb8] px-5 py-3 text-xs font-black text-[#04110e]"
            >
              ابدأ التحليل
            </a>
          </div>
        ) : (
          <>
            <section className="rounded-[28px] border border-[#25cdb8]/20 bg-[radial-gradient(circle_at_85%_0%,rgba(37,205,184,.12),transparent_38%),#0b121b] p-7 md:p-9">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-black ${priorityClass[decision.priority] || priorityClass["medium"]}`}
                >
                  {decision.priority.toUpperCase()}
                </span>
                <span className="flex items-center gap-2 text-[11px] text-slate-600">
                  <Clock3 size={13} />
                  {new Date(decision.createdAt).toLocaleString("ar-LB")}
                </span>
              </div>
              <h2 className="mt-6 text-2xl font-black md:text-3xl">{decision.title}</h2>
              <div className="mt-6 rounded-2xl border border-[#25cdb8]/20 bg-[#25cdb8]/[0.04] p-5">
                <div className="flex items-center gap-2 text-xs font-black text-[#25cdb8]">
                  <ArrowUpLeft size={16} /> افعل هذا الآن
                </div>
                <p className="mt-3 text-lg font-bold leading-8">{decision.action}</p>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              <Metric label="الثقة" value={decision.confidence} />
              <Metric label="الأدلة" value={String(decision.evidenceCount)} />
              <Metric label="المتجر" value={decision.storeUrl} />
            </div>

            <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6">
              <div className="flex items-center gap-2 text-sm font-black">
                <ShieldCheck size={17} className="text-[#25cdb8]" />
                لماذا هذا القرار؟
              </div>
              <p className="mt-4 text-sm leading-8 text-slate-400">{decision.rationale}</p>
              {decision.evidenceBasis.length > 0 && (
                <div className="mt-5 grid gap-2 md:grid-cols-2">
                  {decision.evidenceBasis.map((x, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/[0.07] bg-[#090f17] p-3 text-xs leading-6 text-slate-500"
                    >
                      {x}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex flex-wrap gap-3">
              <a
                href="/history"
                className="rounded-xl border border-white/10 px-5 py-3 text-xs font-black text-slate-300"
              >
                ذاكرة القرار
              </a>
              <a
                href="/"
                className="rounded-xl bg-[#25cdb8] px-5 py-3 text-xs font-black text-[#04110e]"
              >
                تحليل جديد
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-4">
      <div className="text-[10px] text-slate-600">{label}</div>
      <div className="mt-2 truncate text-sm font-black">{value}</div>
    </div>
  );
}
