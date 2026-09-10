import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Check, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { acknowledgeMonitoringEvent, createMonitoringTarget, deleteMonitoringTarget, listMonitoringEvents, listMonitoringTargets, runMonitoringCheck, setMonitoringActive, type MonitoringEvent, type MonitoringTarget } from "@/lib/monitoring.functions";
// @ts-expect-error TanStack route types are generated separately.
export const Route=createFileRoute("/monitoring")({component:MonitoringPage});

const severityLabel=(value:string)=>value==="high"?"عالي":value==="medium"?"متوسط":"منخفض";
const eventLabel=(value:string)=>value==="title-change"?"تغيّر عنوان":value==="structure-change"?"تغيّر هيكل":value==="content-change"?"تغيّر محتوى":value==="error"?"خطأ":"حدث";

function MonitoringPage(){
  const [targets,setTargets]=useState<MonitoringTarget[]>([]);
  const [events,setEvents]=useState<MonitoringEvent[]>([]);
  const [name,setName]=useState("");const [url,setUrl]=useState("");const [intervalHours,setIntervalHours]=useState(24);
  const [busy,setBusy]=useState<string>("");const [error,setError]=useState("");const [notice,setNotice]=useState("");
  async function load(){try{setTargets(await listMonitoringTargets({}));setEvents(await listMonitoringEvents({data:{limit:50}}));}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل المراقبة.");}}
  useEffect(()=>{void load();},[]);
  async function add(e:React.FormEvent){e.preventDefault();if(!name.trim()||!url.trim())return;setBusy("add");setError("");setNotice("");try{await createMonitoringTarget({data:{name,url,intervalHours}});setName("");setUrl("");setNotice("تمت إضافة المنافس وسيبدأ خط الأساس في أول فحص.");await load();}catch(e){setError(e instanceof Error?e.message:"تعذر إضافة الموقع.");}finally{setBusy("");}}
  async function check(id:string){setBusy(id);setError("");setNotice("");try{const result=await runMonitoringCheck({data:{id}});setNotice(result.changed?"تم اكتشاف تغيير جديد وحفظه بالأدلة.":"تم الفحص، لا يوجد تغيير مهم.");await load();}catch(e){setError(e instanceof Error?e.message:"فشل الفحص.");}finally{setBusy("");}}
  async function remove(id:string){setBusy(`delete:${id}`);setError("");try{await deleteMonitoringTarget({data:{id}});await load();}catch(e){setError(e instanceof Error?e.message:"تعذر حذف الموقع.");}finally{setBusy("");}}
  async function acknowledge(id:string){setBusy(`ack:${id}`);try{await acknowledgeMonitoringEvent({data:{id}});await load();}finally{setBusy("");}}
  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
    <header className="border-b border-white/[.07] bg-[#080d15]"><div className="mx-auto flex max-w-6xl justify-between px-5 py-5"><a href="/" className="font-black tracking-[4px] text-[#25cdb8]">COANTO</a><a href="/business-intelligence" className="text-xs text-slate-400">ذكاء الأعمال</a></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
      <div><div className="flex gap-2 text-[#25cdb8]"><Activity size={18}/><span className="text-xs font-black tracking-[2px]">MONITORING</span></div><h1 className="mt-3 text-3xl font-black">المراقبة التنافسية</h1><p className="mt-2 text-sm text-slate-500">خط أساس، فحص دوري، وتصنيف دقيق للتغييرات المهمة مع سجل أدلة.</p></div>
      {error&&<div className="rounded-xl border border-red-400/20 p-4 text-sm text-red-200">{error}</div>}
      {notice&&<div className="rounded-xl border border-[#25cdb8]/20 p-4 text-sm text-[#8ce8dc]">{notice}</div>}
      <form onSubmit={add} className="grid gap-3 rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:grid-cols-[1fr_2fr_170px_auto]">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="اسم المنافس" className="rounded-xl border border-white/10 bg-[#090f17] p-3"/>
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://competitor.com" className="rounded-xl border border-white/10 bg-[#090f17] p-3"/>
        <select value={intervalHours} onChange={e=>setIntervalHours(Number(e.target.value))} className="rounded-xl border border-white/10 bg-[#090f17] p-3 text-sm"><option value={1}>كل ساعة</option><option value={6}>كل 6 ساعات</option><option value={12}>كل 12 ساعة</option><option value={24}>كل 24 ساعة</option><option value={168}>أسبوعياً</option></select>
        <button disabled={busy==="add"} className="rounded-xl bg-[#25cdb8] px-5 py-3 text-xs font-black text-[#04110e]"><Plus size={16} className="inline"/> إضافة</button>
      </form>
      <section className="grid gap-3">{targets.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b121b] p-5"><div><div className="flex items-center gap-2"><b>{t.name}</b><span className={`rounded-full px-2 py-1 text-[10px] ${t.active?"bg-[#25cdb8]/10 text-[#25cdb8]":"bg-white/5 text-slate-500"}`}>{t.active?"نشط":"متوقف"}</span></div><div className="mt-1 text-xs text-slate-500">{t.url} · كل {t.intervalHours} ساعة · {t.lastCheckedAt?`آخر فحص ${new Date(t.lastCheckedAt).toLocaleString("ar-LB")}`:"لم يُفحص بعد"}</div></div><div className="flex items-center gap-4"><button disabled={busy===t.id} onClick={()=>void check(t.id)} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"><RefreshCw size={14} className={busy===t.id?"animate-spin":""}/> فحص الآن</button><button onClick={async()=>{await setMonitoringActive({data:{id:t.id,active:!t.active}});await load();}} className={t.active?"text-[#25cdb8]":"text-slate-600"} title={t.active?"إيقاف":"تشغيل"}><Power size={18}/></button><button disabled={busy===`delete:${t.id}`} onClick={()=>void remove(t.id)} className="text-slate-600 hover:text-red-300" title="حذف"><Trash2 size={17}/></button></div></div>)}</section>
      <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-5"><div className="flex items-center justify-between"><h2 className="font-black">آخر الأحداث</h2><span className="text-xs text-slate-600">{events.filter(e=>!e.acknowledgedAt).length} غير مقروء</span></div><div className="mt-4 space-y-2">{events.length?events.map(e=><div key={e.id} className={`rounded-xl border p-4 ${e.acknowledgedAt?"border-white/[.05] opacity-60":"border-white/[.1]"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><b className="text-sm">{e.title}</b><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400">{eventLabel(e.eventType)}</span><span className="text-[10px] text-slate-500">خطورة {severityLabel(e.severity)}</span></div><p className="mt-1 text-xs text-slate-500">{e.summary}</p><div className="mt-2 text-[10px] text-slate-700">{new Date(e.detectedAt).toLocaleString("ar-LB")}</div></div>{!e.acknowledgedAt&&<button disabled={busy===`ack:${e.id}`} onClick={()=>void acknowledge(e.id)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400"><Check size={12}/> تم الاطلاع</button>}</div></div>):<p className="py-8 text-center text-sm text-slate-600">لا توجد أحداث بعد.</p>}</div></section>
    </main>
  </div>;
}
