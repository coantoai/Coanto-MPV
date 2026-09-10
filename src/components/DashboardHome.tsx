import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Activity, ArrowLeft, BarChart3, BellRing, Brain, CheckCircle2, Crosshair, Eye, Loader2, Radar, RefreshCw, ShieldCheck, Sparkles, Target, TrendingUp } from 'lucide-react';
import { clientAuth } from '@/lib/auth-client';
import { getDashboardSnapshot, type DashboardChange, type DashboardInsight, type DashboardSnapshot } from '@/lib/dashboard.functions';

const eventLabel: Record<string,string> = {
  'price-change':'سعر', 'offer-change':'عرض', 'product-change':'منتج', 'messaging-change':'رسالة',
  'title-change':'عنوان', 'structure-change':'هيكل', 'content-change':'محتوى', change:'تغيير',
};
const priorityLabel:Record<string,string>={critical:'حرج',high:'عالي',medium:'متوسط',low:'منخفض'};
const statusLabel:Record<string,string>={proposed:'مقترح',accepted:'مقبول',completed:'مكتمل',dismissed:'مستبعد'};
const categoryLabel:Record<string,string>={pricing:'تسعير',promotion:'عروض',product:'منتج',positioning:'تموضع',competition:'منافسة',operations:'تشغيل'};

export default function DashboardHome(){
  const nav=useNavigate();
  const [snapshot,setSnapshot]=useState<DashboardSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    const session=await clientAuth.getSession();
    if(!session){await nav({to:'/auth'});return;}
    const data=await getDashboardSnapshot({});
    setSnapshot(data);
  }
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل لوحة القيادة.')).finally(()=>setLoading(false));},[]);
  async function refresh(){setRefreshing(true);setError('');try{await load();}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث اللوحة.');}finally{setRefreshing(false)}}

  if(loading)return <Shell><div className="grid min-h-[65vh] place-items-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-[#25cdb8]"/><div className="mt-3 text-sm text-slate-500">تجميع صورة القرار…</div></div></div></Shell>;
  if(!snapshot)return <Shell><div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-200">{error||'لا توجد بيانات متاحة.'}</div></Shell>;

  const h=snapshot.health;
  return <Shell>
    <section className="relative overflow-hidden rounded-[30px] border border-[#203240] bg-[radial-gradient(circle_at_85%_0%,rgba(37,205,184,.14),transparent_33%),#0b121b] p-6 md:p-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div><div className="flex items-center gap-2 text-[11px] font-black tracking-[2px] text-[#25cdb8]"><Crosshair size={15}/> EXECUTIVE COMMAND CENTER</div><h1 className="mt-3 text-3xl font-black md:text-4xl">{snapshot.business?.name||'COANTO'} <span className="text-slate-500">— ماذا يحدث الآن؟</span></h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">قرارك الأعلى أولوية، أهم تحركات المنافسين، قوة التغطية والأنماط المتكررة — من سجل موثّق واحد.</p>{snapshot.business&&<div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-white/10 px-3 py-1.5">{snapshot.business.websiteUrl}</span><span className="rounded-full border border-white/10 px-3 py-1.5">السوق: {snapshot.business.primaryMarket}</span></div>}</div>
        <div className="flex flex-wrap gap-2"><button onClick={()=>void refresh()} disabled={refreshing} className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-slate-300 hover:bg-white/5"><RefreshCw size={14} className={refreshing?'animate-spin':''}/> تحديث</button><button onClick={()=>nav({to:'/analysis'})} className="flex items-center gap-2 rounded-xl bg-[#25cdb8] px-4 py-3 text-xs font-black text-[#04110e]"><Sparkles size={14}/> تحليل جديد</button></div>
      </div>
    </section>

    {error&&<div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi icon={<Target size={16}/>} label="منافسون موثقون" value={h.competitors}/>
      <Kpi icon={<Radar size={16}/>} label="مراقبة نشطة" value={h.activeMonitoring}/>
      <Kpi icon={<BellRing size={16}/>} label="غير مقروء" value={h.unreadChanges} attention={h.unreadChanges>0}/>
      <Kpi icon={<TrendingUp size={16}/>} label="عالي الأولوية" value={h.highPriorityChanges} attention={h.highPriorityChanges>0}/>
      <Kpi icon={<Eye size={16}/>} label="أدلة مرتبطة" value={h.verifiedEvidenceLinks}/>
      <Kpi icon={<Brain size={16}/>} label="أنماط مشتركة" value={h.patterns30d}/>
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <TopDecision snapshot={snapshot}/>
      <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-black"><ShieldCheck size={17} className="text-[#25cdb8]"/> صحة الاستخبارات</div><span className="text-[10px] text-slate-600">30 DAYS</span></div><div className="mt-5 space-y-4"><HealthRow label="متوسط أهمية التغيير" value={`${h.averageChangeScore}/100`} progress={h.averageChangeScore}/><HealthRow label="تحليلات محفوظة" value={String(h.analyses30d)} progress={Math.min(100,h.analyses30d*10)}/><HealthRow label="تغطية المراقبة" value={`${h.activeMonitoring}/${Math.max(h.competitors,1)}`} progress={h.competitors?Math.min(100,Math.round(h.activeMonitoring/h.competitors*100)):0}/></div><div className="mt-6 grid grid-cols-2 gap-2"><QuickLink to="/business-intelligence" icon={<BarChart3 size={15}/>} label="ذكاء المنافسة"/><QuickLink to="/monitoring" icon={<Activity size={15}/>} label="المراقبة"/></div></div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <Changes items={snapshot.changes}/>
      <Insights items={snapshot.insights}/>
    </section>

    <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:p-6"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-black"><Radar size={17} className="text-[#25cdb8]"/> المنافسون</div><p className="mt-1 text-xs text-slate-600">الأعلى صلة من قائمة Competitor Discovery.</p></div><a href="/competitors" className="flex items-center gap-1 text-xs font-black text-[#25cdb8]">فتح القائمة <ArrowLeft size={13}/></a></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{snapshot.competitors.length?snapshot.competitors.map(c=><div key={c.id} className="rounded-2xl border border-white/[.07] bg-[#090f17] p-4"><div className="flex items-start justify-between gap-2"><div><b className="text-sm">{c.name}</b><div className="mt-1 text-[10px] text-slate-600">{c.domain}</div></div><span className="rounded-full border border-[#25cdb8]/15 px-2 py-1 text-[10px] text-[#25cdb8]">{c.relevanceScore}/100</span></div><div className="mt-4 flex items-center gap-1 text-[10px] text-slate-600"><CheckCircle2 size={12}/>{c.verificationStatus==='verified'?'قراءة مباشرة':'دليل مفهرس'}</div></div>):<Empty text="لم تُكتشف قائمة منافسين بعد."/>}</div></section>

    <section className="grid gap-3 md:grid-cols-5"><Pipeline icon={<Radar size={15}/>} step="01" title="Discovery"/><Pipeline icon={<Eye size={15}/>} step="02" title="Evidence"/><Pipeline icon={<Activity size={15}/>} step="03" title="Change"/><Pipeline icon={<Brain size={15}/>} step="04" title="Intelligence"/><Pipeline icon={<Target size={15}/>} step="05" title="Decision"/></section>
    <div className="pb-4 text-center text-[10px] text-slate-700">آخر تجميع {new Date(snapshot.generatedAt).toLocaleString('ar-LB')} · Evidence → Verification → Intelligence → Decision → Action</div>
  </Shell>;
}

function Shell({children}:{children:ReactNode}){return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]"><header className="sticky top-0 z-30 border-b border-white/[.07] bg-[#080d15]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><a href="/" className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#25cdb8]/10 text-[#25cdb8]"><Crosshair size={18}/></div><div><div className="text-sm font-black tracking-[4px] text-[#25cdb8]">COANTO</div><div className="text-[9px] text-slate-600">DECISION INTELLIGENCE</div></div></a><nav className="hidden items-center gap-5 text-xs font-bold text-slate-500 md:flex"><a href="/competitors" className="hover:text-white">المنافسون</a><a href="/monitoring" className="hover:text-white">المراقبة</a><a href="/business-intelligence" className="hover:text-white">الذكاء</a><a href="/decision" className="hover:text-white">القرارات</a></nav><a href="/auth" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400">الحساب</a></div></header><main className="mx-auto max-w-7xl space-y-5 px-5 py-7">{children}</main></div>}
function Kpi({icon,label,value,attention=false}:{icon:ReactNode;label:string;value:number;attention?:boolean}){return <div className={`rounded-2xl border p-4 ${attention?'border-[#25cdb8]/25 bg-[#25cdb8]/[.04]':'border-white/10 bg-[#0b121b]'}`}><div className="flex items-center gap-2 text-[11px] text-slate-500">{icon}{label}</div><div className="mt-3 text-3xl font-black">{value}</div></div>}
function TopDecision({snapshot}:{snapshot:DashboardSnapshot}){const d=snapshot.topDecision;return <div className="rounded-3xl border border-[#25cdb8]/20 bg-[radial-gradient(circle_at_90%_0%,rgba(37,205,184,.1),transparent_34%),#0b121b] p-6"> <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black"><Target size={17} className="text-[#25cdb8]"/> القرار الأعلى أولوية</div><a href="/decision" className="text-xs font-black text-[#25cdb8]">كل القرارات</a></div>{d?<><div className="mt-5 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full border border-[#25cdb8]/20 px-2.5 py-1 font-black text-[#25cdb8]">{d.score}/100</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">{priorityLabel[d.priority]??d.priority}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">{statusLabel[d.status]??d.status}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-slate-500">{Math.round(d.confidence*100)}% ثقة</span></div><h2 className="mt-4 text-xl font-black md:text-2xl">{d.title}</h2><div className="mt-4 rounded-2xl border border-[#25cdb8]/15 bg-[#25cdb8]/[.035] p-4"><div className="text-[10px] font-black text-[#25cdb8]">NEXT BEST ACTION</div><p className="mt-2 text-sm font-bold leading-7">{d.action}</p></div><div className="mt-4 flex items-center justify-between text-[10px] text-slate-600"><span>{d.evidenceCount} أدلة داعمة</span><span>{new Date(d.updatedAt).toLocaleDateString('ar-LB')}</span></div></>:<div className="py-10 text-center"><div className="text-sm font-bold text-slate-400">لا يوجد قرار v2 منشور بعد.</div><a href="/business-intelligence" className="mt-4 inline-flex rounded-xl bg-[#25cdb8] px-4 py-2.5 text-xs font-black text-[#04110e]">ابنِ Intelligence أولاً</a></div>}</div>}
function Changes({items}:{items:DashboardChange[]}){return <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:p-6"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2 font-black"><BellRing size={17} className="text-[#25cdb8]"/> آخر التحركات</div><p className="mt-1 text-xs text-slate-600">تغييرات فعلية بعد Noise Suppression.</p></div><a href="/monitoring" className="text-xs font-black text-[#25cdb8]">السجل الكامل</a></div><div className="mt-4 space-y-2">{items.length?items.slice(0,7).map(item=><div key={item.id} className={`rounded-2xl border p-4 ${item.acknowledged?'border-white/[.05] opacity-65':'border-white/[.09]'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="rounded-full bg-white/[.05] px-2 py-1 text-[10px] text-slate-400">{eventLabel[item.eventType]??item.eventType}</span><b className="text-sm">{item.targetName}</b></div><span className="text-[10px] font-black text-[#25cdb8]">{item.score}/100</span></div><div className="mt-2 text-xs text-slate-400">{item.summary}</div><div className="mt-2 text-[10px] text-slate-700">{new Date(item.detectedAt).toLocaleString('ar-LB')}</div></div>):<Empty text="لا توجد تغييرات تنافسية موثقة خلال آخر 30 يومًا."/>}</div></div>}
function Insights({items}:{items:DashboardInsight[]}){return <div className="rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:p-6"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2 font-black"><Brain size={17} className="text-[#25cdb8]"/> Intelligence</div><p className="mt-1 text-xs text-slate-600">ما تعنيه الأدلة، وليس مجرد ما تغيّر.</p></div><a href="/business-intelligence" className="text-xs font-black text-[#25cdb8]">كل الرؤى</a></div><div className="mt-4 space-y-3">{items.length?items.slice(0,5).map(item=><div key={item.id} className="rounded-2xl border border-white/[.07] p-4"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#25cdb8]/10 px-2 py-1 text-[10px] text-[#25cdb8]">{categoryLabel[item.category]??item.category}</span><span className="text-[10px] text-slate-600">{Math.round(item.confidence*100)}% ثقة</span></div><b className="mt-3 block text-sm">{item.title}</b><p className="mt-1 text-xs leading-6 text-slate-500">{item.summary}</p></div>):<Empty text="حدّث Intelligence بعد جمع تغييرات موثقة."/>}</div></div>}
function HealthRow({label,value,progress}:{label:string;value:string;progress:number}){return <div><div className="mb-2 flex items-center justify-between text-xs"><span className="text-slate-500">{label}</span><b>{value}</b></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-[#25cdb8]" style={{width:`${Math.max(0,Math.min(100,progress))}%`}}/></div></div>}
function QuickLink({to,icon,label}:{to:string;icon:ReactNode;label:string}){return <a href={to} className="flex items-center justify-center gap-2 rounded-xl border border-white/[.08] p-3 text-xs font-bold text-slate-400 hover:border-[#25cdb8]/20 hover:text-[#25cdb8]">{icon}{label}</a>}
function Pipeline({icon,step,title}:{icon:ReactNode;step:string;title:string}){return <div className="rounded-2xl border border-white/[.07] bg-[#090f17] p-4"><div className="flex items-center justify-between text-[#25cdb8]">{icon}<span className="text-[9px] font-black text-slate-700">{step}</span></div><div className="mt-3 text-xs font-black text-slate-400">{title}</div></div>}
function Empty({text}:{text:string}){return <div className="rounded-2xl border border-dashed border-white/[.08] p-6 text-center text-xs text-slate-600">{text}</div>}
