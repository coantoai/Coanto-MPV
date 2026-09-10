import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BarChart3, FileText, RefreshCw, ShieldCheck, Target, TrendingUp } from 'lucide-react';
import { generateExecutiveReport, listExecutiveReports, type ExecutiveReportItem } from '@/lib/alerts-reports.functions';
import type { Json } from '@/lib/json';

// @ts-expect-error TanStack route types are generated separately.
export const Route = createFileRoute('/reports')({
  component: ReportsPage,
  head: () => ({ meta: [{ title: 'COANTO — التقارير التنفيذية' }, { name: 'description', content: 'تقارير تنافسية تنفيذية مبنية على الأدلة والقرارات المحفوظة.' }] }),
});

function asObject(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json> : {};
}
function asArray(value: Json | undefined): Json[] { return Array.isArray(value) ? value : []; }
function text(value: Json | undefined): string { return typeof value === 'string' ? value : ''; }
function number(value: Json | undefined): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

function ReportsPage(){
  const [reports,setReports]=useState<ExecutiveReportItem[]>([]);
  const [selected,setSelected]=useState<ExecutiveReportItem|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function load(){const rows=await listExecutiveReports({data:{limit:30}});setReports(rows);setSelected(current=>current&&rows.some(row=>row.id===current.id)?current:(rows[0]??null));}
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل التقارير.'));},[]);
  async function generate(days:number){setBusy(true);setError('');try{const report=await generateExecutiveReport({data:{days}});await load();setSelected(report);}catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء التقرير.');}finally{setBusy(false);}}

  const payload=asObject(selected?.payload);
  const health=asObject(payload['health']);
  const topDecision=asObject(payload['topDecision']);
  const changes=asArray(payload['topChanges']);
  const insights=asArray(payload['topInsights']);

  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
    <header className="border-b border-white/[.07] bg-[#080d15]"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5"><a href="/" className="font-black tracking-[4px] text-[#25cdb8]">COANTO</a><nav className="flex gap-4 text-xs font-bold text-slate-500"><a href="/alerts" className="hover:text-white">التنبيهات</a><a href="/decision" className="hover:text-white">القرارات</a></nav></div></header>
    <main className="mx-auto max-w-7xl space-y-5 px-5 py-8">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[#25cdb8]"><FileText size={18}/><span className="text-xs font-black tracking-[2px]">EXECUTIVE REPORTS</span></div><h1 className="mt-3 text-3xl font-black">التقرير التنافسي التنفيذي</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">ملخّص قابل للتدقيق يجمع المراقبة، Intelligence، القرار وأثر تغطية الأدلة ضمن فترة واحدة.</p></div><div className="flex gap-2"><button onClick={()=>void generate(7)} disabled={busy} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-slate-300">7 أيام</button><button onClick={()=>void generate(30)} disabled={busy} className="flex items-center gap-2 rounded-xl bg-[#25cdb8] px-4 py-3 text-xs font-black text-[#04110e]"><RefreshCw size={14} className={busy?'animate-spin':''}/> إنشاء 30 يوم</button></div></section>
      {error&&<div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[.35fr_.65fr]">
        <aside className="rounded-3xl border border-white/10 bg-[#0b121b] p-4"><div className="px-2 pb-3 text-xs font-black text-slate-500">سجل التقارير</div><div className="space-y-2">{reports.length?reports.map(report=><button key={report.id} onClick={()=>setSelected(report)} className={`w-full rounded-2xl border p-4 text-right ${selected?.id===report.id?'border-[#25cdb8]/30 bg-[#25cdb8]/[.04]':'border-white/[.06] bg-[#090f17]'}`}><div className="text-sm font-black">{report.title}</div><div className="mt-2 text-[10px] text-slate-600">{new Date(report.periodStart).toLocaleDateString('ar-LB')} — {new Date(report.periodEnd).toLocaleDateString('ar-LB')}</div></button>):<div className="p-6 text-center text-xs text-slate-600">أنشئ أول تقرير.</div>}</div></aside>
        <section className="space-y-5">{selected?<><div className="rounded-3xl border border-[#25cdb8]/20 bg-[radial-gradient(circle_at_90%_0%,rgba(37,205,184,.1),transparent_35%),#0b121b] p-6 md:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-black tracking-[2px] text-[#25cdb8]">COMPETITIVE DIGEST</div><h2 className="mt-2 text-2xl font-black">{selected.title}</h2></div><span className="text-[10px] text-slate-600">{new Date(selected.periodEnd).toLocaleString('ar-LB')}</span></div><p className="mt-5 text-sm leading-8 text-slate-300">{selected.summary}</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<Target size={15}/>} label="المنافسون" value={String(number(health['competitors']))}/><Metric icon={<TrendingUp size={15}/>} label="التغييرات" value={String(number(health['changes']))}/><Metric icon={<ShieldCheck size={15}/>} label="أدلة مرتبطة" value={String(number(health['evidenceLinks']))}/><Metric icon={<BarChart3 size={15}/>} label="قرارات قابلة للتنفيذ" value={String(number(health['actionableDecisions']))}/></div>
        <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><div className="flex items-center gap-2 font-black"><Target size={17} className="text-[#25cdb8]"/> أهم قرار</div>{Object.keys(topDecision).length?<div className="mt-4 rounded-2xl border border-[#25cdb8]/15 bg-[#25cdb8]/[.035] p-5"><div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>{number(topDecision['score'])}/100</span><span>{Math.round(number(topDecision['confidence'])*100)}% ثقة</span><span>{number(topDecision['evidenceCount'])} أدلة</span></div><h3 className="mt-3 text-lg font-black">{text(topDecision['title'])}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{text(topDecision['action'])}</p></div>:<div className="py-8 text-center text-sm text-slate-600">لا يوجد قرار اجتاز بوابة الدليل في هذه الفترة.</div>}</section>
        <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><h3 className="font-black">أهم التحركات</h3><div className="mt-4 space-y-3">{changes.length?changes.map((item,index)=>{const row=asObject(item);return <div key={`${text(row['id'])}-${index}`} className="rounded-2xl border border-white/[.07] p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{text(row['title'])}</b><span className="text-[10px] text-[#25cdb8]">{number(row['score'])}/100</span></div><p className="mt-2 text-xs leading-6 text-slate-500">{text(row['summary'])}</p></div>}):<div className="py-8 text-center text-xs text-slate-600">لا توجد تغييرات موثقة.</div>}</div></div><div className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><h3 className="font-black">أهم الرؤى</h3><div className="mt-4 space-y-3">{insights.length?insights.map((item,index)=>{const row=asObject(item);return <div key={`${text(row['id'])}-${index}`} className="rounded-2xl border border-white/[.07] p-4"><div className="flex items-center justify-between gap-2"><b className="text-sm">{text(row['title'])}</b><span className="text-[10px] text-[#25cdb8]">{Math.round(number(row['confidence'])*100)}%</span></div><p className="mt-2 text-xs leading-6 text-slate-500">{text(row['recommendation'])||text(row['summary'])}</p></div>}):<div className="py-8 text-center text-xs text-slate-600">لا توجد رؤى موثقة.</div>}</div></div></section>
        <div className="rounded-2xl border border-white/[.06] bg-[#090f17] p-4 text-[10px] leading-6 text-slate-600">قاعدة التقرير: AI output ليس دليلاً. التقرير يعرض فقط ما هو محفوظ مع lineage للأدلة والقرارات المشتقة منها.</div></>:<div className="rounded-3xl border border-white/10 bg-[#0b121b] p-12 text-center text-sm text-slate-600">أنشئ تقرير 7 أو 30 يوم لبدء السجل التنفيذي.</div>}</section>
      </div>
    </main>
  </div>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-4"><div className="flex items-center gap-2 text-[11px] text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>}
