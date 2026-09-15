import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, BellRing, Bookmark, BrainCircuit, CalendarDays, CheckCircle2, ChevronLeft, Copy,
  ExternalLink, Eye, Image as ImageIcon, Layers3, Loader2, Newspaper, Radar, RefreshCw, Search,
  ShieldCheck, Sparkles, Sun, Target, Upload, Users, WandSparkles, Wrench, X, Zap,
} from 'lucide-react';

type Profile = {
  businessName:string; storeUrl:string; productName:string; productPrice:string; productDescription:string;
  audience:string; region:string; city:string; dialect:string; tone:string; objective:string;
  prohibitedClaims:string; platforms:string[];
};

type Trend = {
  id:string;
  title:string;
  kind:'ترند'|'خبر'|'إشارة مبكرة'|'موسم'|'أداة/ميزة'|'سلوك جمهور';
  hashtag?:string;
  platform:string;
  signalStrength:'قوية'|'متوسطة'|'أولية';
  freshness:string;
  state:'استخدم الآن'|'راقب'|'تجاهل';
  whatHappened:string;
  whyNow:string;
  businessFit:string;
  recommendedAction:string;
  contentPotential:'عالٍ'|'متوسط'|'منخفض';
  contentAngle:string;
  triggerToWatch:string;
  saturationRisk:string;
  confidenceNote:string;
  evidenceSummary?:string;
};

type Source = { title:string; url:string };
type Discovery = { generatedAt:string; summary:string; trends:Trend[]; sources:Source[]; searchQueries:string[]; trustNote:string };
type Script = { hook:string; hooks:string[]; body:string[]; cta:string; caption:string; hashtags:string[]; shotPlan:string[]; commentReplies:string[]; duration:string; safetyNote:string };
type Published = { trendId:string; title:string; result:string; createdAt:string };
type Filter = 'all'|'now'|'watch'|'saved';

const defaults: Profile = {
  businessName:'', storeUrl:'', productName:'', productPrice:'', productDescription:'', audience:'',
  region:'السعودية', city:'', dialect:'سعودي', tone:'ودّي وواضح', objective:'بيع', prohibitedClaims:'',
  platforms:['TikTok','Instagram Reels','YouTube','X','Google/Web'],
};

async function api(body: Record<string, unknown>) {
  const response = await fetch('/api/trends-pulse', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'تعذّر إكمال العملية.') as Error & { code?:string };
    if (typeof data?.code === 'string') error.code = data.code;
    throw error;
  }
  return data;
}

function strengthClass(v:Trend['signalStrength']) {
  return v==='قوية' ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-300' : v==='متوسطة' ? 'border-blue-400/30 bg-blue-400/12 text-blue-300' : 'border-amber-300/30 bg-amber-300/10 text-amber-200';
}
function stateClass(v:Trend['state']) {
  return v==='استخدم الآن' ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-200' : v==='تجاهل' ? 'border-slate-600 bg-slate-800 text-slate-400' : 'border-blue-400/25 bg-blue-400/10 text-blue-200';
}
function stateLabel(v:Trend['state']) { return v==='استخدم الآن' ? 'تحرّك الآن' : v; }
function KindIcon({ kind, size=16 }:{kind:Trend['kind'];size?:number}) {
  if (kind==='خبر') return <Newspaper size={size}/>;
  if (kind==='إشارة مبكرة') return <BellRing size={size}/>;
  if (kind==='موسم') return <CalendarDays size={size}/>;
  if (kind==='أداة/ميزة') return <Wrench size={size}/>;
  if (kind==='سلوك جمهور') return <Users size={size}/>;
  return <Zap size={size}/>;
}

// @ts-expect-error TanStack file-route type map is generated during build.
export const Route = createFileRoute('/trends-pulse')({
  head:()=>({meta:[
    {title:'TRENDS PULSE — ما الذي يستحق انتباهك الآن؟'},
    {name:'description',content:'رادار ذكاء يومي يفلتر الترندات والأخبار والإشارات التي تهم مشروعك.'},
  ]}),
  component:Page,
});

function Page() {
  const [profile,setProfile] = useState<Profile>(defaults);
  const [image,setImage] = useState('');
  const [discovery,setDiscovery] = useState<Discovery|null>(null);
  const [focused,setFocused] = useState<Trend|null>(null);
  const [selected,setSelected] = useState<Trend|null>(null);
  const [script,setScript] = useState<Script|null>(null);
  const [discovering,setDiscovering] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [error,setError] = useState('');
  const [auth,setAuth] = useState(false);
  const [saved,setSaved] = useState<string[]>([]);
  const [results,setResults] = useState<Published[]>([]);
  const [resultDraft,setResultDraft] = useState('');
  const [profileOpen,setProfileOpen] = useState(true);
  const [sourcesOpen,setSourcesOpen] = useState(false);
  const [studioOpen,setStudioOpen] = useState(false);
  const [filter,setFilter] = useState<Filter>('all');
  const [query,setQuery] = useState('');

  useEffect(()=>{
    try {
      const p=localStorage.getItem('trends-pulse-profile');
      if(p){ setProfile({...defaults,...JSON.parse(p)}); setProfileOpen(false); }
      setSaved(JSON.parse(localStorage.getItem('trends-pulse-saved')||'[]'));
      setResults(JSON.parse(localStorage.getItem('trends-pulse-results')||'[]'));
    } catch {}
  },[]);
  useEffect(()=>{ try { localStorage.setItem('trends-pulse-profile',JSON.stringify(profile)); } catch {} },[profile]);
  useEffect(()=>{ try { localStorage.setItem('trends-pulse-saved',JSON.stringify(saved)); } catch {} },[saved]);
  useEffect(()=>{ try { localStorage.setItem('trends-pulse-results',JSON.stringify(results)); } catch {} },[results]);

  const ready = Boolean(profile.storeUrl.trim()||profile.productName.trim()||profile.productDescription.trim());
  const actionable = useMemo(()=>discovery?.trends.filter(t=>t.state==='استخدم الآن').length||0,[discovery]);
  const watching = useMemo(()=>discovery?.trends.filter(t=>t.state==='راقب').length||0,[discovery]);
  const filtered = useMemo(()=>{
    if(!discovery) return [];
    const needle=query.trim().toLowerCase();
    return discovery.trends.filter(t=>{
      if(filter==='now'&&t.state!=='استخدم الآن') return false;
      if(filter==='watch'&&t.state!=='راقب') return false;
      if(filter==='saved'&&!saved.includes(t.id)) return false;
      if(needle&&!`${t.title} ${t.kind} ${t.platform} ${t.whatHappened} ${t.businessFit}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  },[discovery,filter,query,saved]);

  const update = <K extends keyof Profile>(key:K,value:Profile[K])=>setProfile(p=>({...p,[key]:value}));
  const togglePlatform=(name:string)=>setProfile(p=>({...p,platforms:p.platforms.includes(name)?p.platforms.filter(x=>x!==name):[...p.platforms,name]}));
  const loadImage=(file?:File)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('استخدم JPG أو PNG أو WEBP.');return}
    if(file.size>2_000_000){setError('الصورة أكبر من 2MB.');return}
    const r=new FileReader(); r.onload=()=>setImage(typeof r.result==='string'?r.result:''); r.readAsDataURL(file);
  };

  const runDiscover=async()=>{
    if(!ready){setError('أضف رابط النشاط/المنتج أو اسمه/وصفه أولًا.');setProfileOpen(true);return}
    setDiscovering(true); setError(''); setAuth(false); setScript(null); setFocused(null);
    try {
      const d=await api({mode:'discover',profile});
      const result=d.result as Discovery;
      setDiscovery(result); setProfileOpen(false); setFilter('all'); setQuery('');
      if(result.trends[0]) setFocused(result.trends[0]);
    } catch(e) {
      const x=e as Error&{code?:string}; setError(x.message); setAuth(x.code==='AUTH_REQUIRED');
    } finally { setDiscovering(false); }
  };

  const runScript=async(trend:Trend)=>{
    setSelected(trend); setGenerating(true); setError(''); setAuth(false); setScript(null); setStudioOpen(true);
    try {
      const body:Record<string,unknown>={mode:'script',profile,trend,format:trend.platform.includes('Instagram')?'Instagram Reels':'TikTok / Reels'};
      if(image) body['imageDataUrl']=image;
      const d=await api(body); setScript(d.result as Script);
    } catch(e) {
      const x=e as Error&{code?:string}; setError(x.message); setAuth(x.code==='AUTH_REQUIRED'); setStudioOpen(false);
    } finally { setGenerating(false); }
  };

  const copy=async()=>{if(!script)return;try{await navigator.clipboard.writeText([script.hook,...script.body,script.cta,script.caption,script.hashtags.join(' ')].join('\n\n'))}catch{}};
  const logResult=()=>{if(!selected||!resultDraft.trim())return;setResults(r=>[{trendId:selected.id,title:selected.title,result:resultDraft.trim(),createdAt:new Date().toISOString()},...r].slice(0,30));setResultDraft('')};

  return <main dir="rtl" className="min-h-screen bg-[#050b14] text-slate-100 selection:bg-blue-500/30">
    <div className="border-b border-emerald-300/10 bg-emerald-300/[.035] px-4 py-2 text-center text-[11px] text-emerald-100/80">الرصد الحقيقي يبدأ عند الضغط على «شغّل الرادار» — ما قبل ذلك لا توجد نتائج Demo.</div>

    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#050b14]/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3"><div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-blue-400/20 bg-blue-500/10 text-blue-300"><Radar size={22}/><span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.8)]"/></div><div><div className="font-black tracking-wide">TRENDS <span className="text-blue-400">PULSE</span></div><div className="text-[11px] text-slate-500">Your personalized relevance radar</div></div></div>
        <div className="flex gap-2"><button onClick={()=>setProfileOpen(v=>!v)} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold transition hover:bg-white/[.08]">ملفك</button><button disabled={!discovery} onClick={()=>setSourcesOpen(true)} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold disabled:opacity-35">المصادر</button></div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-7 md:px-6 md:py-10">
      <section className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
        <div className="relative overflow-hidden rounded-[30px] border border-white/8 bg-gradient-to-bl from-blue-500/10 via-white/[.025] to-violet-500/8 p-6 md:p-8">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"/>
          <div className="relative"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs text-blue-200"><Layers3 size={14}/> بدل ما تبرم بين التطبيقات</div><h1 className="text-3xl font-black leading-[1.25] md:text-5xl">شو صار اليوم… <span className="text-blue-400">وبيهمك فعلًا؟</span></h1><p className="mt-4 text-sm leading-7 text-slate-400 md:text-base">نراقب ما يتحرك عبر المنصات والويب، نحذف الضجيج، ونضع أمامك فقط الإشارات التي تستحق وقتك.</p><div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-300">{['ترندات','أخبار','إشارات مبكرة','مواسم','أدوات وميزات','سلوك الجمهور'].map(x=><span key={x} className="rounded-full border border-white/8 bg-black/20 px-3 py-2">{x}</span>)}</div><div className="mt-7"><button onClick={runDiscover} disabled={discovering||!ready} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-blue-500 to-violet-600 px-5 py-3.5 text-sm font-black shadow-lg shadow-blue-950/30 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45">{discovering?<><Loader2 size={17} className="animate-spin"/> الرادار يبحث الآن...</>:<><Radar size={17}/> شغّل الرادار الآن</>}</button><div className="mt-3 text-center text-[11px] leading-5 text-slate-500">{discovery?<>آخر رصد: <span className="text-emerald-300">{new Date(discovery.generatedAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</span></>:<>لم يتم تشغيل رصد حقيقي في هذه الجلسة بعد.</>}</div></div></div>
        </div>

        <PulseLine signals={discovery?.trends||[]} focusedId={focused?.id||''} onFocus={setFocused} scanning={discovering} region={profile.region} city={profile.city}/>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Metric icon={<Target size={17}/>} label="تحتاج حركة الآن" value={discovery?String(actionable):'—'} hint="ليست كلها محتوى"/><Metric icon={<Eye size={17}/>} label="نراقبها لك" value={discovery?String(watching):'—'} hint="بانتظار trigger"/><Metric icon={<Bookmark size={17}/>} label="محفوظة" value={String(saved.length)} hint="ذاكرتك الخاصة"/><Metric icon={<CheckCircle2 size={17}/>} label="نتائج سجلتها" value={String(results.length)} hint="تعلّم شخصي"/></section>

      {profileOpen&&<ProfilePanel profile={profile} update={update} togglePlatform={togglePlatform} image={image} loadImage={loadImage} onClose={()=>setProfileOpen(false)}/>}      
      {error&&<div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/[.07] p-4 text-sm text-rose-100">{error}{auth&&<a href="/auth" className="mr-3 inline-block rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">تسجيل الدخول</a>}</div>}

      {!discovery&&!discovering&&<section className="mt-7 rounded-[30px] border border-dashed border-white/10 bg-white/[.02] p-8 text-center md:p-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-white/8 bg-white/[.035] text-slate-500"><BrainCircuit size={28}/></div><h2 className="mt-4 text-xl font-black">لم نشغّل الرصد بعد</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">لن نملأ الشاشة بترندات تجريبية. أضف نشاطك وشغّل الرادار، وما يظهر بعدها يكون نتيجة البحث الفعلي.</p>{!ready&&<button onClick={()=>setProfileOpen(true)} className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm font-black text-blue-200">أضف نشاطك أولًا</button>}</section>}

      {discovery&&<>
        <section className="mt-7 overflow-hidden rounded-[30px] border border-white/8 bg-white/[.025]"><div className="grid lg:grid-cols-[1fr_.44fr]"><div className="p-5 md:p-6"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-blue-400">What matters now</div><h2 className="mt-2 text-xl font-black leading-8 md:text-2xl">{discovery.summary}</h2></div><div className="border-t border-white/8 bg-amber-300/[.035] p-5 text-xs leading-6 text-amber-100/75 lg:border-r lg:border-t-0"><div className="mb-1 flex items-center gap-2 font-black text-amber-200"><ShieldCheck size={15}/> حدود الثقة</div>{discovery.trustNote}</div></div></section>

        <section className="mt-5 rounded-3xl border border-white/8 bg-white/[.025] p-3 md:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2"><FilterButton active={filter==='all'} onClick={()=>setFilter('all')} label={`الكل ${discovery.trends.length}`}/><FilterButton active={filter==='now'} onClick={()=>setFilter('now')} label={`تحرّك الآن ${actionable}`}/><FilterButton active={filter==='watch'} onClick={()=>setFilter('watch')} label={`نراقب ${watching}`}/><FilterButton active={filter==='saved'} onClick={()=>setFilter('saved')} label={`محفوظ ${saved.length}`}/></div><label className="relative block min-w-0 lg:w-80"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث داخل رصدك..." className="w-full rounded-2xl border border-white/8 bg-[#081321] py-2.5 pr-9 pl-3 text-xs outline-none focus:border-blue-400/30"/></label></div></section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><section className="space-y-3">{filtered.length===0&&<div className="rounded-3xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">لا توجد إشارات ضمن هذا الفلتر.</div>}{filtered.map(trend=><SignalCard key={trend.id} trend={trend} saved={saved.includes(trend.id)} focused={focused?.id===trend.id} onSave={()=>setSaved(ids=>ids.includes(trend.id)?ids.filter(id=>id!==trend.id):[...ids,trend.id])} onFocus={()=>setFocused(trend)} onScript={()=>runScript(trend)}/>)}</section><aside className="xl:sticky xl:top-24 xl:self-start"><FocusPanel trend={focused} onScript={runScript} generating={generating} onSources={()=>setSourcesOpen(true)}/></aside></div>
      </>}

      {discovery&&<section className="mt-8 rounded-[30px] border border-emerald-400/12 bg-emerald-400/[.035] p-5 md:p-6"><div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div><div className="text-[11px] font-bold uppercase tracking-[.16em] text-emerald-300">Learning loop</div><h2 className="mt-2 text-xl font-black">شو صار بعد ما تحركت؟</h2><p className="mt-2 text-sm leading-7 text-slate-500">مع الوقت، هذه النتائج تجعل صفحتك تتعلم نوع الإشارات التي تفيدك أنت، وتتكلم لغتك أكثر.</p></div><div className="rounded-2xl border border-white/8 bg-[#081321] p-4"><div className="mb-2 text-xs text-slate-400">{selected?`الإشارة: ${selected.title}`:'حوّل أي إشارة إلى محتوى أولًا، ثم سجّل ما حدث.'}</div><div className="flex flex-col gap-2 sm:flex-row"><input value={resultDraft} onChange={e=>setResultDraft(e.target.value)} placeholder="مثال: جابت أسئلة أكثر من المعتاد..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#050b14] px-3 py-2.5 text-xs outline-none"/><button onClick={logResult} disabled={!selected||!resultDraft.trim()} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-35">احفظ النتيجة</button></div></div></div></section>}
    </div>

    {sourcesOpen&&discovery&&<Modal title="المصادر التي استند إليها الرصد" onClose={()=>setSourcesOpen(false)}><div className="mb-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-3 text-xs leading-6 text-amber-100/75">هذه روابط grounding من البحث العام، وليست ادعاء وصول مباشر لبيانات TikTok أو Instagram الخاصة.</div><div className="space-y-2">{discovery.sources.length?discovery.sources.map((s,i)=><a key={`${s.url}-${i}`} href={s.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[.03] p-3 text-sm hover:bg-white/[.06]"><span className="truncate">{s.title}</span><ExternalLink size={15} className="shrink-0 text-blue-400"/></a>):<div className="text-sm text-slate-500">لم يرجع Gemini روابط grounding واضحة لهذه الجولة.</div>}</div></Modal>}

    {studioOpen&&<Modal title={selected?`حوّل الإشارة إلى محتوى — ${selected.title}`:'Content Studio'} onClose={()=>setStudioOpen(false)} wide><div className="rounded-2xl border border-violet-400/15 bg-violet-400/[.04] p-4 text-xs leading-6 text-violet-100/80">هنا يبدأ المحتوى كـAction اختياري بعد فهم الإشارة، وليس كهدف المنصة الأساسي.</div>{generating?<div className="grid min-h-64 place-items-center"><div className="text-center text-slate-400"><Loader2 className="mx-auto mb-3 animate-spin"/>Gemini يبني المحتوى حسب منتجك ولهجتك...</div></div>:script?<div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="space-y-3"><Info title="أفضل Hook" text={script.hook}/><Block title="5 Hooks بديلة" items={script.hooks}/><Block title="السكربت" items={script.body}/><Info title="CTA" text={script.cta}/></div><div className="space-y-3"><Info title="Caption" text={script.caption}/><Block title="خطة تصوير بالجوال" items={script.shotPlan}/><Block title="ردود للتعليقات" items={script.commentReplies}/><div className="flex flex-wrap gap-2">{script.hashtags.map(tag=><span key={tag} className="rounded-full bg-blue-400/10 px-2.5 py-1 text-[11px] text-blue-300">{tag}</span>)}</div><button onClick={copy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950"><Copy size={14}/> نسخ المحتوى</button></div></div>:<div className="p-8 text-center text-sm text-slate-500">تعذّر توليد المحتوى.</div>}</Modal>}
  </main>;
}

function PulseLine({signals,focusedId,onFocus,scanning,region,city}:{signals:Trend[];focusedId:string;onFocus:(t:Trend)=>void;scanning:boolean;region:string;city:string}) {
  const theme=contextTheme(region,city);
  const points=signals.map((signal,index)=>timelinePoint(signal,index,signals.length));
  const path=points.length>1?points.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' '):'';
  return <section className="relative min-h-[410px] overflow-hidden rounded-[30px] border border-white/8 bg-[#081321] p-4 md:p-5">
    <ContextSkin theme={theme}/>
    <div className="relative z-10 flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[.18em] text-slate-500">Pulse Line</div><h2 className="mt-1 text-lg font-black">من الماضي → إلى ما يصعد الآن</h2></div><div className="rounded-full border border-white/8 bg-black/20 px-3 py-1.5 text-[11px] text-slate-300">{theme.flag} {theme.label}</div></div>
    <div className="relative z-10 mt-6 h-[285px] rounded-[24px] border border-white/6 bg-black/10 px-3">
      <div className="absolute inset-x-4 bottom-8 flex justify-between text-[10px] text-slate-600"><span>من أسبوع</span><span>أمس</span><span>اليوم</span><span className="text-blue-300">الآن</span></div>
      <div className="absolute bottom-[49px] left-4 right-4 h-px bg-gradient-to-r from-white/5 via-blue-400/20 to-emerald-300/30"/>
      {scanning&&<div className="absolute inset-0 overflow-hidden rounded-[24px]"><div className="absolute inset-y-0 w-20 animate-[scan_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue-400/10 to-transparent"/><div className="absolute inset-0 grid place-items-center"><div className="rounded-2xl border border-blue-400/15 bg-[#07101e]/80 px-4 py-3 text-xs text-blue-200 backdrop-blur"><Radar size={16} className="ml-2 inline animate-spin"/> نبحث عن الإشارات...</div></div></div>}
      {!scanning&&signals.length===0&&<div className="absolute inset-0 grid place-items-center text-center"><div><Radar size={28} className="mx-auto mb-3 text-slate-700"/><div className="text-sm font-bold text-slate-500">الخط ينتظر أول رصد حقيقي</div><div className="mt-1 text-[11px] text-slate-600">بعد الرصد، الجديد يكبر هنا والقديم يهدأ تدريجيًا.</div></div></div>}
      {signals.length>0&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-4 top-5 h-[210px] w-[calc(100%-2rem)] overflow-visible"><defs><linearGradient id="pulseLine" x1="0" x2="1"><stop offset="0%" stopColor="rgba(148,163,184,.15)"/><stop offset="65%" stopColor="rgba(96,165,250,.65)"/><stop offset="100%" stopColor="rgba(110,231,183,.9)"/></linearGradient></defs>{path&&<path d={path} fill="none" stroke="url(#pulseLine)" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>}</svg>}
      {signals.map((signal,index)=>{const p=points[index];const size=nodeSize(signal,index);const active=focusedId===signal.id;return <button key={signal.id} onMouseEnter={()=>onFocus(signal)} onFocus={()=>onFocus(signal)} onClick={()=>onFocus(signal)} className={`group absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border transition duration-300 ${active?'border-white/50 ring-4 ring-blue-400/10':'border-white/15 hover:border-white/40'}`} style={{left:`${p.x}%`,top:`${p.y}%`,width:size,height:size,opacity:p.opacity}} aria-label={signal.title}><span className={`absolute inset-0 rounded-full ${signal.state==='استخدم الآن'?'bg-emerald-300/20':signal.state==='راقب'?'bg-blue-400/18':'bg-slate-500/10'} ${index<2?'animate-pulse':''}`}/><span className="relative grid h-full w-full place-items-center text-white"><KindIcon kind={signal.kind} size={Math.max(13,size*.28)}/></span><span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden w-44 -translate-x-1/2 rounded-xl border border-white/10 bg-[#07101e]/95 p-2 text-right text-[10px] leading-4 shadow-2xl backdrop-blur group-hover:block group-focus:block"><b className="block text-slate-100">{signal.title}</b><span className="text-slate-500">{signal.freshness} · {signal.kind}</span></span></button>})}
    </div>
    <div className="relative z-10 mt-3 flex items-center justify-between text-[10px] text-slate-600"><span>الحجم = حداثة + أهمية الإشارة</span><span>حرّك المؤشر أو اضغط على أي نقطة</span></div>
  </section>;
}

function timelinePoint(signal:Trend,index:number,total:number){
  const f=signal.freshness.toLowerCase(); let x=20;
  if(f.includes('الآن')||f.includes('ساعة')) x=91;
  else if(f.includes('اليوم')||f.includes('24')) x=82;
  else if(f.includes('48')||f.includes('أمس')) x=65;
  else if(f.includes('أسبوع')) x=36;
  else x=Math.max(18,86-(index/(Math.max(total-1,1)))*65);
  const jitter=[0,4,-5,7,-8,3,-3,6,-6][index%9]; x=Math.min(94,Math.max(8,x+jitter));
  const y=[42,62,32,70,49,26,58,38,67][index%9];
  const opacity=Math.max(.35,1-(index*.07));
  return {x,y,opacity};
}
function nodeSize(signal:Trend,index:number){const base=signal.signalStrength==='قوية'?54:signal.signalStrength==='متوسطة'?44:35;return Math.max(28,base-index*1.7)}

function contextTheme(region:string,city:string){
  const month=new Date().getMonth()+1;
  const gulf=/السعود|الإمارات|قطر|عمان|الكويت|البحرين|الخليج/i.test(region);
  const flag=region.includes('السعود')?'🇸🇦':region.includes('الإمارات')?'🇦🇪':region.includes('قطر')?'🇶🇦':region.includes('عمان')?'🇴🇲':region.includes('لبنان')?'🇱🇧':region.includes('مصر')?'🇪🇬':'🌍';
  if(gulf&&month>=8&&month<=10) return {flag,label:`${city||region} · عودة للمدارس`,mode:'school' as const};
  if(month>=6&&month<=9) return {flag,label:`${city||region} · صيف`,mode:'summer' as const};
  if(month===12||month<=2) return {flag,label:`${city||region} · شتاء`,mode:'winter' as const};
  return {flag,label:city||region||'سياقك',mode:'neutral' as const};
}
function ContextSkin({theme}:{theme:ReturnType<typeof contextTheme>}){
  return <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-75">{theme.mode==='summer'&&<><div className="absolute -left-10 top-12 h-36 w-36 rounded-full bg-amber-300/8 blur-2xl"/><Sun size={76} className="absolute left-8 top-10 text-amber-200/[.055]"/><div className="absolute -bottom-16 -right-24 h-48 w-[130%] rotate-[-5deg] rounded-[50%] bg-amber-200/[.025]"/></>}{theme.mode==='school'&&<><div className="absolute left-8 top-10 h-28 w-28 rounded-full bg-amber-300/8 blur-2xl"/><CalendarDays size={72} className="absolute left-10 top-10 text-amber-200/[.05]"/><div className="absolute -bottom-16 right-4 h-44 w-[80%] rounded-[50%] bg-blue-400/[.025]"/></>}{theme.mode==='winter'&&<><div className="absolute -left-16 top-8 h-40 w-40 rounded-full bg-cyan-300/8 blur-3xl"/>{Array.from({length:12}).map((_,i)=><span key={i} className="absolute rounded-full bg-white/20" style={{left:`${8+(i*17)%90}%`,top:`${10+(i*23)%72}%`,width:2+(i%3),height:2+(i%3)}}/>)}</>}{theme.mode==='neutral'&&<><div className="absolute -left-20 top-8 h-44 w-44 rounded-full bg-violet-500/7 blur-3xl"/><div className="absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-blue-500/7 blur-3xl"/></>}</div>
}

function SignalCard({trend,saved,focused,onSave,onFocus,onScript}:{trend:Trend;saved:boolean;focused:boolean;onSave:()=>void;onFocus:()=>void;onScript:()=>void}){
  return <article id={`signal-${trend.id}`} onMouseEnter={onFocus} className={`rounded-[26px] border p-5 transition ${focused?'border-blue-400/30 bg-blue-400/[.055] shadow-lg shadow-blue-950/20':'border-white/8 bg-white/[.025] hover:bg-white/[.04]'}`}><div className="flex items-start justify-between gap-3"><div><div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1 rounded-full border border-white/8 px-2.5 py-1"><KindIcon kind={trend.kind} size={12}/>{trend.kind}</span><span>{trend.platform}</span><span>•</span><span>{trend.freshness}</span></div><h3 className="text-lg font-black leading-7">{trend.title}</h3></div><button onClick={onSave} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${saved?'border-amber-300/25 bg-amber-300/10 text-amber-300':'border-white/8 bg-white/[.03] text-slate-600'}`}><Bookmark size={16} fill={saved?'currentColor':'none'}/></button></div><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${strengthClass(trend.signalStrength)}`}>الإشارة {trend.signalStrength}</span><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${stateClass(trend.state)}`}>{stateLabel(trend.state)}</span><span className="rounded-full border border-violet-400/15 bg-violet-400/[.06] px-2.5 py-1 text-[10px] text-violet-200">محتوى: {trend.contentPotential}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2"><Info title="شو صار؟" text={trend.whatHappened}/><Info title="ليش يهمك؟" text={trend.businessFit}/></div><div className="mt-3 rounded-2xl border border-emerald-300/12 bg-emerald-300/[.035] p-4"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-300">Next action</div><div className="mt-1 text-sm font-bold leading-6">{trend.recommendedAction}</div></div><div className="mt-4 flex gap-2"><button onClick={onFocus} className="flex-1 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2.5 text-xs font-bold">افتح التحليل</button>{trend.contentPotential!=='منخفض'&&<button onClick={onScript} className="flex-1 rounded-xl bg-gradient-to-l from-blue-500 to-violet-600 px-3 py-2.5 text-xs font-black">حوّله لمحتوى</button>}</div></article>
}

function FocusPanel({trend,onScript,generating,onSources}:{trend:Trend|null;onScript:(t:Trend)=>void;generating:boolean;onSources:()=>void}){
  if(!trend)return <div className="rounded-[28px] border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">مرّر على نقطة في Pulse Line أو اختر إشارة.</div>;
  return <div className="rounded-[28px] border border-white/8 bg-[#081321] p-5"><div className="flex items-center justify-between gap-3"><div className="inline-flex items-center gap-2 text-xs font-bold text-blue-300"><KindIcon kind={trend.kind}/>{trend.kind}</div><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${stateClass(trend.state)}`}>{stateLabel(trend.state)}</span></div><h2 className="mt-3 text-xl font-black leading-8">{trend.title}</h2><div className="mt-4 space-y-3"><Info title="ليش ظهر هلأ؟" text={trend.whyNow}/><Info title="ماذا تراقب بعدها؟" text={trend.triggerToWatch}/><Info title="الثقة والدليل" text={trend.evidenceSummary||trend.confidenceNote}/></div><div className="mt-4 rounded-2xl border border-emerald-300/12 bg-emerald-300/[.04] p-4"><div className="text-[10px] font-bold text-emerald-300">الخطوة المقترحة</div><div className="mt-1 text-sm font-black leading-6">{trend.recommendedAction}</div></div><div className="mt-4 grid gap-2"><button onClick={onSources} className="rounded-xl border border-white/10 bg-white/[.035] px-3 py-2.5 text-xs font-bold">شوف المصادر</button>{trend.contentPotential!=='منخفض'&&<button onClick={()=>onScript(trend)} disabled={generating} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50"><WandSparkles size={14}/>{generating?'جاري التوليد...':'حوّلها إلى محتوى'}</button>}</div></div>
}

function ProfilePanel({profile,update,togglePlatform,image,loadImage,onClose}:{profile:Profile;update:<K extends keyof Profile>(k:K,v:Profile[K])=>void;togglePlatform:(s:string)=>void;image:string;loadImage:(f?:File)=>void;onClose:()=>void}){
  const platforms=['TikTok','Instagram Reels','YouTube','X','Google/Web'];
  return <section className="mt-5 rounded-[30px] border border-white/8 bg-white/[.025] p-5 md:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">صفحتك تبدأ من معرفتنا بك</h2><p className="mt-1 text-xs leading-6 text-slate-500">هذا الملف سيصبح مع الوقت ذاكرة اهتماماتك، لغتك، مناطقك، وما تعتبره مهمًا.</p></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-white/5"><X size={18}/></button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Field label="اسم النشاط" value={profile.businessName} onChange={v=>update('businessName',v)} placeholder="متجر نورة"/><Field label="رابط النشاط/المنتج" value={profile.storeUrl} onChange={v=>update('storeUrl',v)} placeholder="https://..."/><Field label="المنتج الأهم حاليًا" value={profile.productName} onChange={v=>update('productName',v)} placeholder="عباية لينن"/><Field label="السعر / العرض" value={profile.productPrice} onChange={v=>update('productPrice',v)} placeholder="249 ر.س — شحن مجاني"/><Field label="الجمهور" value={profile.audience} onChange={v=>update('audience',v)} placeholder="نساء 22–38"/><Field label="المدينة" value={profile.city} onChange={v=>update('city',v)} placeholder="الرياض"/><Select label="الدولة/السوق" value={profile.region} onChange={v=>update('region',v)} options={['السعودية','الإمارات','الخليج','قطر','عمان','الكويت','البحرين','لبنان','مصر']}/><Select label="اللهجة" value={profile.dialect} onChange={v=>update('dialect',v)} options={['سعودي','خليجي','إماراتي','مصري','لبناني','عربي أبيض']}/><Select label="الهدف" value={profile.objective} onChange={v=>update('objective',v)} options={['بيع','تفاعل','وعي','تعليم']}/><label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-400">وصف النشاط/المنتج</span><textarea rows={3} value={profile.productDescription} onChange={e=>update('productDescription',e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#07101e] px-4 py-3 text-sm outline-none focus:border-blue-400/30" placeholder="شو بتبيع، شو يميزك، ومين يشتري منك..."/></label><label><span className="mb-1.5 block text-xs font-bold text-slate-400">صورة المنتج</span><div className="flex min-h-[90px] items-center gap-3 rounded-2xl border border-dashed border-white/12 bg-[#07101e] p-3">{image?<img src={image} alt="المنتج" className="h-16 w-16 rounded-xl object-cover"/>:<div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-600"><ImageIcon size={20}/></div>}<label className="cursor-pointer rounded-xl bg-white/7 px-3 py-2 text-xs font-bold"><Upload size={14} className="ml-1 inline"/>{image?'غيّر':'ارفع'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>loadImage(e.target.files?.[0])}/></label></div></label><div className="md:col-span-2 lg:col-span-3"><div className="mb-2 text-xs font-bold text-slate-400">راقب لي</div><div className="flex flex-wrap gap-2">{platforms.map(p=><button type="button" key={p} onClick={()=>togglePlatform(p)} className={`rounded-full border px-3 py-2 text-[11px] font-bold ${profile.platforms.includes(p)?'border-blue-400/25 bg-blue-400/10 text-blue-200':'border-white/8 bg-white/[.025] text-slate-600'}`}>{p}</button>)}</div></div></div></section>
}

function Metric({icon,label,value,hint}:{icon:ReactNode;label:string;value:string;hint:string}){return <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-[11px]">{label}</span></div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-[10px] text-slate-600">{hint}</div></div>}
function Info({title,text}:{title:string;text:string}){return <div className="rounded-2xl border border-white/7 bg-black/10 p-3"><div className="text-[10px] font-bold text-slate-500">{title}</div><div className="mt-1 text-xs leading-6 text-slate-300">{text||'غير محسوم بعد.'}</div></div>}
function Block({title,items}:{title:string;items:string[]}){return <div className="rounded-2xl border border-white/7 bg-black/10 p-3"><div className="mb-2 text-[10px] font-bold text-slate-500">{title}</div><div className="space-y-2">{items.map((item,i)=><div key={`${item}-${i}`} className="flex gap-2 text-xs leading-6 text-slate-300"><span className="text-blue-400">{i+1}.</span><span>{item}</span></div>)}</div></div>}
function FilterButton({active,onClick,label}:{active:boolean;onClick:()=>void;label:string}){return <button onClick={onClick} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${active?'border-blue-400/25 bg-blue-400/10 text-blue-200':'border-white/8 bg-white/[.02] text-slate-500 hover:text-slate-300'}`}>{label}</button>}
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-[#07101e] px-4 py-3 text-sm outline-none focus:border-blue-400/30"/></label>}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:string[]}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#07101e] px-4 py-3 text-sm outline-none">{options.map(o=><option key={o}>{o}</option>)}</select></label>}
function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className={`max-h-[88vh] w-full overflow-y-auto rounded-[28px] border border-white/10 bg-[#081321] p-5 shadow-2xl ${wide?'max-w-5xl':'max-w-2xl'}`}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-black">{title}</h2><button onClick={onClose} className="rounded-xl border border-white/8 p-2 text-slate-500"><X size={17}/></button></div>{children}</div></div>}
