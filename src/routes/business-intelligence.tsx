import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BarChart3, Brain, RefreshCw, ShieldCheck } from 'lucide-react';
import { listBusinessInsights, listBusinessMetrics, refreshBusinessIntelligence, type BusinessInsight, type BusinessMetric } from '@/lib/business-intelligence.functions';
// @ts-expect-error TanStack route types are generated separately.
export const Route=createFileRoute('/business-intelligence')({component:BusinessIntelligencePage});

const metricLabels:Record<string,string>={
  analyses_30d:'التحليلات — 30 يوم',
  monitoring_events_30d:'أحداث المراقبة',
  competitive_changes_30d:'التغييرات التنافسية',
  high_priority_changes_30d:'تغييرات عالية الأولوية',
  cross_competitor_patterns_30d:'أنماط عبر عدة منافسين',
  price_changes_30d:'تغييرات الأسعار',
  offer_changes_30d:'تغييرات العروض',
  product_changes_30d:'تغييرات المنتجات',
  messaging_changes_30d:'تغييرات الرسائل',
  monitoring_errors_30d:'أخطاء المراقبة',
  average_change_score_30d:'متوسط أهمية التغيير',
  memory_items_30d:'عناصر الذاكرة',
  decisions_30d:'القرارات',
};
const categoryLabel=(value:string)=>value==='pricing'?'تسعير':value==='promotion'?'عروض':value==='product'?'منتج':value==='positioning'?'تموضع':value==='competition'?'منافسة':'تشغيل';
const impactLabel=(value:string)=>value==='high'?'أثر مرتفع':value==='medium'?'أثر متوسط':'أثر منخفض';

function BusinessIntelligencePage(){
  const [insights,setInsights]=useState<BusinessInsight[]>([]);const [metrics,setMetrics]=useState<BusinessMetric[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function load(){try{const [i,m]=await Promise.all([listBusinessInsights({data:{limit:50}}),listBusinessMetrics({data:{limit:100}})]);setInsights(i);setMetrics(m);}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل ذكاء الأعمال.');}}
  useEffect(()=>{void load();},[]);
  async function refresh(){setBusy(true);setError('');try{await refreshBusinessIntelligence({});await load();}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث ذكاء الأعمال.');}finally{setBusy(false)}}
  const latest=new Map<string,BusinessMetric>();for(const metric of metrics)if(!latest.has(metric.metricKey))latest.set(metric.metricKey,metric);
  const metric=(key:string)=>latest.get(key)?.metricValue??0;
  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]"><header className="border-b border-white/[.07] bg-[#080d15]"><div className="mx-auto flex max-w-6xl justify-between px-5 py-5"><a href="/" className="font-black tracking-[4px] text-[#25cdb8]">COANTO</a><a href="/monitoring" className="text-xs text-slate-400">المراقبة</a></div></header><main className="mx-auto max-w-6xl space-y-5 px-5 py-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex gap-2 text-[#25cdb8]"><BarChart3 size={18}/><span className="text-xs font-black tracking-[2px]">COMPETITIVE INTELLIGENCE</span></div><h1 className="mt-3 text-3xl font-black">ذكاء المنافسة</h1><p className="mt-2 text-sm text-slate-500">تحويل تغييرات المنافسين الموثقة إلى إشارات مرتبة حسب الأهمية، واكتشاف الأنماط عبر أكثر من منافس، ثم رؤى تنفيذية قابلة للتدقيق.</p></div><button onClick={()=>void refresh()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-[#25cdb8] px-4 py-3 text-xs font-black text-[#04110e]"><RefreshCw size={15} className={busy?'animate-spin':''}/> تحديث الذكاء</button></div>{error&&<div className="rounded-xl border border-red-400/20 p-4 text-sm text-red-200">{error}</div>}<section className="grid gap-3 md:grid-cols-5"><Stat label="تغييرات موثقة" value={String(metric('competitive_changes_30d'))}/><Stat label="عالية الأولوية" value={String(metric('high_priority_changes_30d'))}/><Stat label="أنماط مشتركة" value={String(metric('cross_competitor_patterns_30d'))}/><Stat label="متوسط الأهمية" value={`${metric('average_change_score_30d')}/100`}/><Stat label="قرارات مسجلة" value={String(metric('decisions_30d'))}/></section><section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><div className="flex items-center gap-2 font-black"><Brain size={18} className="text-[#25cdb8]"/> الرؤى التنفيذية</div><div className="mt-4 grid gap-3">{insights.length?insights.map(i=><article key={i.id} className="rounded-2xl border border-white/[.07] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="mb-2 flex items-center gap-2 text-[10px]"><span className="rounded-full bg-[#25cdb8]/10 px-2 py-1 text-[#25cdb8]">{categoryLabel(i.category)}</span><span className="text-slate-500">{impactLabel(i.impact)}</span></div><b>{i.title}</b></div><div className="flex items-center gap-1 text-xs text-[#25cdb8]"><ShieldCheck size={13}/>{Math.round(i.confidence*100)}% ثقة</div></div><p className="mt-2 text-sm leading-7 text-slate-400">{i.summary}</p><div className="mt-2 text-[10px] text-slate-600">{i.evidence.length} مرجع/حدث داعم</div>{i.recommendation&&<p className="mt-3 rounded-xl bg-[#25cdb8]/5 p-3 text-xs leading-6 text-slate-300">الخطوة المقترحة: {i.recommendation}</p>}</article>):<p className="py-10 text-center text-sm text-slate-600">لا توجد تغييرات موثقة كافية لصناعة رؤية بعد.</p>}</div></section><section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><h2 className="font-black">مؤشرات آخر 30 يومًا</h2><div className="mt-4 grid gap-2 md:grid-cols-3">{[...latest.values()].map(m=><div key={m.id} className="rounded-xl border border-white/[.07] p-4"><div className="text-xs text-slate-500">{metricLabels[m.metricKey]??m.metricKey}</div><div className="mt-1 text-xl font-black">{m.metricValue}{m.unit==='score/100'?'/100':m.unit==='count'?'':m.unit?` ${m.unit}`:''}</div></div>)}</div></section></main></div>;
}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-5"><div className="text-xs text-slate-600">{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>}
