import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Eye, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';
import {
  getAlertPreferences,
  listAlerts,
  markAlertRead,
  refreshAlerts,
  saveAlertPreferences,
  type AlertItem,
} from '@/lib/alerts-reports.functions';
import type { AlertPreferences } from '@/lib/alerts-reports.server';

// @ts-expect-error TanStack route types are generated separately.
export const Route = createFileRoute('/alerts')({
  component: AlertsPage,
  head: () => ({ meta: [{ title: 'COANTO — التنبيهات' }, { name: 'description', content: 'تنبيهات تنافسية مرتبطة بالأدلة والقرارات.' }] }),
});

const severityLabel: Record<string,string> = { critical:'حرج', high:'عالي', medium:'متوسط', low:'منخفض' };
const kindLabel: Record<string,string> = { monitoring:'مراقبة', decision:'قرار', intelligence:'رؤية' };

function AlertsPage(){
  const [alerts,setAlerts]=useState<AlertItem[]>([]);
  const [preferences,setPreferences]=useState<AlertPreferences|null>(null);
  const [busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    const [prefs,rows]=await Promise.all([getAlertPreferences({}),listAlerts({data:{limit:100}})]);
    setPreferences(prefs);setAlerts(rows);
  }
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'تعذر تحميل التنبيهات.'));},[]);

  async function refresh(){
    setBusy(true);setError('');
    try{await refreshAlerts({});await load();}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث التنبيهات.');}finally{setBusy(false);}
  }
  async function toggleRead(item:AlertItem){
    setError('');
    try{await markAlertRead({data:{id:item.id,read:!item.readAt}});setAlerts(current=>current.map(row=>row.id===item.id?{...row,readAt:item.readAt?null:new Date().toISOString()}:row));}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث حالة التنبيه.');}
  }
  async function persistPreferences(){
    if(!preferences)return;setSaving(true);setError('');
    try{const next=await saveAlertPreferences({data:preferences});setPreferences(next);await refresh();}catch(e){setError(e instanceof Error?e.message:'تعذر حفظ الإعدادات.');}finally{setSaving(false);}
  }

  const unread=alerts.filter(item=>!item.readAt).length;
  const critical=alerts.filter(item=>item.severity==='critical'||item.severity==='high').length;
  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]">
    <header className="border-b border-white/[.07] bg-[#080d15]"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5"><a href="/" className="font-black tracking-[4px] text-[#25cdb8]">COANTO</a><nav className="flex gap-4 text-xs font-bold text-slate-500"><a href="/reports" className="hover:text-white">التقارير</a><a href="/monitoring" className="hover:text-white">المراقبة</a></nav></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[#25cdb8]"><BellRing size={18}/><span className="text-xs font-black tracking-[2px]">ALERT CENTER</span></div><h1 className="mt-3 text-3xl font-black">التنبيهات التي تستحق انتباهك</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">لا نرفع كل تغيير. التنبيه يمر عبر حد أهمية، ويحمل رابطاً واضحاً إلى المراقبة أو القرار أو الرؤية التي أنشأته.</p></div><button onClick={()=>void refresh()} disabled={busy} className="flex items-center gap-2 rounded-xl bg-[#25cdb8] px-4 py-3 text-xs font-black text-[#04110e]"><RefreshCw size={15} className={busy?'animate-spin':''}/> تحديث التنبيهات</button></section>
      {error&&<div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>}
      <section className="grid gap-3 md:grid-cols-3"><Stat label="غير مقروء" value={String(unread)}/><Stat label="عالي/حرج" value={String(critical)}/><Stat label="إجمالي التنبيهات" value={String(alerts.length)}/></section>

      {preferences&&<section className="rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:p-6"><div className="flex items-center gap-2 font-black"><Settings2 size={17} className="text-[#25cdb8]"/> قواعد التنبيه</div><div className="mt-5 grid gap-4 md:grid-cols-4"><label className="text-xs text-slate-500">الحد الأدنى للتغيير<select value={preferences.minimumChangeScore} onChange={e=>setPreferences({...preferences,minimumChangeScore:Number(e.target.value)})} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d15] p-3 text-sm text-white"><option value={50}>50 — حساس</option><option value={70}>70 — متوازن</option><option value={85}>85 — المهم فقط</option></select></label><label className="flex items-center gap-3 rounded-xl border border-white/[.07] p-3 text-xs text-slate-400"><input type="checkbox" checked={preferences.includeDecisions} onChange={e=>setPreferences({...preferences,includeDecisions:e.target.checked})}/> تنبيهات القرارات</label><label className="flex items-center gap-3 rounded-xl border border-white/[.07] p-3 text-xs text-slate-400"><input type="checkbox" checked={preferences.includeIntelligence} onChange={e=>setPreferences({...preferences,includeIntelligence:e.target.checked})}/> تنبيهات الرؤى</label><label className="text-xs text-slate-500">وتيرة التقرير<select value={preferences.digestFrequency} onChange={e=>setPreferences({...preferences,digestFrequency:e.target.value as AlertPreferences['digestFrequency']})} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d15] p-3 text-sm text-white"><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="off">متوقف</option></select></label></div><div className="mt-4 flex justify-end"><button onClick={()=>void persistPreferences()} disabled={saving} className="rounded-xl border border-[#25cdb8]/25 px-4 py-2.5 text-xs font-black text-[#25cdb8]">{saving?'جاري الحفظ…':'حفظ القواعد'}</button></div><p className="mt-3 text-[10px] text-slate-600">هذه إعدادات داخل COANTO فقط حالياً؛ لا تعني إرسال بريد أو SMS بدون قناة توصيل مفعّلة.</p></section>}

      <section className="rounded-3xl border border-white/10 bg-[#0b121b] p-5 md:p-6"><div className="flex items-center justify-between"><div className="font-black">آخر التنبيهات</div><span className="text-[10px] text-slate-600">EVIDENCE-LINKED</span></div><div className="mt-4 space-y-3">{alerts.length?alerts.map(item=><article key={item.id} className={`rounded-2xl border p-4 ${item.readAt?'border-white/[.05] opacity-65':'border-white/[.1]'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[10px]"><span className="rounded-full bg-white/[.05] px-2 py-1 text-slate-400">{kindLabel[item.kind]??item.kind}</span><span className="rounded-full border border-[#25cdb8]/15 px-2 py-1 text-[#25cdb8]">{severityLabel[item.severity]??item.severity}</span><span className="text-slate-600">{item.score}/100</span></div><h2 className="mt-3 font-black">{item.title}</h2><p className="mt-2 text-sm leading-7 text-slate-400">{item.summary}</p></div><button onClick={()=>void toggleRead(item)} className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black text-slate-400">{item.readAt?<Eye size={13}/>:<CheckCircle2 size={13}/>} {item.readAt?'غير مقروء':'تمت القراءة'}</button></div><div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/[.05] pt-3 text-[10px] text-slate-600"><span className="flex items-center gap-1"><ShieldCheck size={12}/>{item.evidence.length} دليل/مرجع</span><span>{Math.round(item.confidence*100)}% ثقة</span><span>{item.sourceType}</span><span>{new Date(item.occurredAt).toLocaleString('ar-LB')}</span></div></article>):<div className="py-12 text-center text-sm text-slate-600">لا توجد تنبيهات تستوفي القواعد الحالية. شغّل التحديث بعد جمع بيانات مراقبة أو قرارات.</div>}</div></section>
    </main>
  </div>;
}

function Stat({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-5"><div className="text-xs text-slate-600">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>}
