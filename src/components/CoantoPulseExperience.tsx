import { useEffect, useMemo, useState } from 'react';
import {
  BellRing, Bookmark, BrainCircuit, CalendarDays, Copy, ExternalLink,
  Eye, Image as ImageIcon, Layers3, Loader2, Newspaper, Radar, Search, ShieldCheck,
  Target, Upload, Users, WandSparkles, Wrench, X, Zap,
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
type Filter = 'all'|'now'|'watch'|'saved';

const defaults:Profile = {
  businessName:'', storeUrl:'', productName:'', productPrice:'', productDescription:'', audience:'',
  region:'السعودية', city:'', dialect:'سعودي', tone:'ودّي وواضح', objective:'بيع', prohibitedClaims:'',
  platforms:['TikTok','Instagram Reels','YouTube','X','Google/Web'],
};

async function callApi(body:Record<string,unknown>) {
  const response=await fetch('/api/trends-pulse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(typeof data?.error==='string'?data.error:'تعذّر إكمال العملية.') as Error&{code?:string};
    if(typeof data?.code==='string')error.code=data.code;
    throw error;
  }
  return data;
}

function KindIcon({kind,size=16}:{kind:Trend['kind'];size?:number}){
  if(kind==='خبر')return <Newspaper size={size}/>;
  if(kind==='إشارة مبكرة')return <BellRing size={size}/>;
  if(kind==='موسم')return <CalendarDays size={size}/>;
  if(kind==='أداة/ميزة')return <Wrench size={size}/>;
  if(kind==='سلوك جمهور')return <Users size={size}/>;
  return <Zap size={size}/>;
}

function signalColor(signal:Trend){
  if(signal.state==='استخدم الآن')return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100';
  if(signal.state==='تجاهل')return 'border-slate-600/50 bg-slate-700/20 text-slate-400';
  return 'border-blue-300/35 bg-blue-400/12 text-blue-100';
}

function signalSize(signal:Trend,index:number){
  const base=signal.signalStrength==='قوية'?72:signal.signalStrength==='متوسطة'?60:52;
  const decay=Math.min(index*4,20);
  return Math.max(42,base-decay);
}

function contextSkin(region:string){
  const gulf=/السعود|الإمارات|قطر|عمان|البحرين|الكويت/i.test(region);
  return gulf
    ? 'from-amber-300/[.08] via-blue-500/[.03] to-cyan-300/[.06]'
    : 'from-blue-500/[.08] via-violet-500/[.03] to-cyan-300/[.05]';
}

export default function CoantoPulseExperience(){
  const [profile,setProfile]=useState<Profile>(defaults);
  const [image,setImage]=useState('');
  const [discovery,setDiscovery]=useState<Discovery|null>(null);
  const [focused,setFocused]=useState<Trend|null>(null);
  const [selected,setSelected]=useState<Trend|null>(null);
  const [script,setScript]=useState<Script|null>(null);
  const [discovering,setDiscovering]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState('');
  const [auth,setAuth]=useState(false);
  const [saved,setSaved]=useState<string[]>([]);
  const [profileOpen,setProfileOpen]=useState(true);
  const [sourcesOpen,setSourcesOpen]=useState(false);
  const [studioOpen,setStudioOpen]=useState(false);
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');

  useEffect(()=>{
    try{
      const p=localStorage.getItem('coanto-pulse-profile')||localStorage.getItem('trends-pulse-profile');
      if(p){setProfile({...defaults,...JSON.parse(p)});setProfileOpen(false)}
      setSaved(JSON.parse(localStorage.getItem('coanto-pulse-saved')||'[]'));
    }catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem('coanto-pulse-profile',JSON.stringify(profile))}catch{}},[profile]);
  useEffect(()=>{try{localStorage.setItem('coanto-pulse-saved',JSON.stringify(saved))}catch{}},[saved]);

  const ready=Boolean(profile.storeUrl.trim()||profile.productName.trim()||profile.productDescription.trim());
  const actionable=useMemo(()=>discovery?.trends.filter(t=>t.state==='استخدم الآن').length||0,[discovery]);
  const watching=useMemo(()=>discovery?.trends.filter(t=>t.state==='راقب').length||0,[discovery]);
  const filtered=useMemo(()=>{
    if(!discovery)return [];
    const needle=query.trim().toLowerCase();
    return discovery.trends.filter(t=>{
      if(filter==='now'&&t.state!=='استخدم الآن')return false;
      if(filter==='watch'&&t.state!=='راقب')return false;
      if(filter==='saved'&&!saved.includes(t.id))return false;
      if(needle&&!`${t.title} ${t.kind} ${t.platform} ${t.whatHappened} ${t.businessFit}`.toLowerCase().includes(needle))return false;
      return true;
    });
  },[discovery,filter,query,saved]);

  const update=<K extends keyof Profile>(key:K,value:Profile[K])=>setProfile(p=>({...p,[key]:value}));
  const togglePlatform=(name:string)=>setProfile(p=>({...p,platforms:p.platforms.includes(name)?p.platforms.filter(x=>x!==name):[...p.platforms,name]}));

  const loadImage=(file?:File)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('استخدم JPG أو PNG أو WEBP.');return}
    if(file.size>2_000_000){setError('الصورة أكبر من 2MB.');return}
    const r=new FileReader();r.onload=()=>setImage(typeof r.result==='string'?r.result:'');r.readAsDataURL(file);
  };

  const runDiscover=async()=>{
    if(!ready){setError('أضف رابط النشاط/المنتج أو اسمه/وصفه أولًا.');setProfileOpen(true);return}
    setDiscovering(true);setError('');setAuth(false);setScript(null);setFocused(null);
    try{
      const d=await callApi({mode:'discover',profile});
      const result=d.result as Discovery;
      setDiscovery(result);setProfileOpen(false);setFilter('all');setQuery('');
      if(result.trends[0])setFocused(result.trends[0]);
    }catch(e){const x=e as Error&{code?:string};setError(x.message);setAuth(x.code==='AUTH_REQUIRED')}
    finally{setDiscovering(false)}
  };

  const runScript=async(trend:Trend)=>{
    setSelected(trend);setGenerating(true);setError('');setAuth(false);setScript(null);setStudioOpen(true);
    try{
      const body:Record<string,unknown>={mode:'script',profile,trend,format:trend.platform.includes('Instagram')?'Instagram Reels':'TikTok / Reels'};
      if(image)body['imageDataUrl']=image;
      const d=await callApi(body);setScript(d.result as Script);
    }catch(e){const x=e as Error&{code?:string};setError(x.message);setAuth(x.code==='AUTH_REQUIRED');setStudioOpen(false)}
    finally{setGenerating(false)}
  };

  const copyScript=async()=>{
    if(!script)return;
    try{await navigator.clipboard.writeText([script.hook,...script.body,script.cta,script.caption,script.hashtags.join(' ')].join('\n\n'))}catch{}
  };

  return <main dir="rtl" className="min-h-screen bg-[#050a12] text-slate-100 selection:bg-cyan-400/25">
    <div className="border-b border-emerald-300/10 bg-emerald-300/[.035] px-4 py-2 text-center text-[11px] text-emerald-100/80">
      COANTO لا يعرض نتائج Demo — الرصد يبدأ فقط عندما تشغّله أنت.
    </div>

    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#050a12]/84 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200">
            <Radar size={22}/><span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.85)]"/>
          </div>
          <div><div className="text-lg font-black tracking-[.16em]">COANTO</div><div className="text-[11px] text-slate-500">كوانتو · رادارك الشخصي لما يستحق انتباهك</div></div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setProfileOpen(v=>!v)} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold hover:bg-white/[.08]">ملفك</button>
          <button disabled={!discovery} onClick={()=>setSourcesOpen(true)} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-xs font-bold disabled:opacity-35">المصادر</button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-7 md:px-6 md:py-10">
      <section className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
        <div className="relative overflow-hidden rounded-[32px] border border-white/8 bg-gradient-to-bl from-cyan-400/10 via-white/[.025] to-violet-500/8 p-6 md:p-8">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"/>
          <div className="relative">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100"><Layers3 size={14}/> بدل ما تبرم بين التطبيقات</div>
            <h1 className="text-3xl font-black leading-[1.25] md:text-5xl">شو صار اليوم… <span className="text-cyan-300">وبيهمك فعلًا؟</span></h1>
            <p className="mt-4 text-sm leading-7 text-slate-400 md:text-base">كوانتو يراقب ما يتحرك عبر المنصات والويب، يحذف الضجيج، ويضع أمامك فقط ما يستحق وقتك.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] text-slate-300">{['ترندات','أخبار','إشارات مبكرة','مواسم','أدوات وميزات','سلوك الجمهور'].map(x=><span key={x} className="rounded-full border border-white/8 bg-black/20 px-3 py-2">{x}</span>)}</div>
            <button onClick={runDiscover} disabled={discovering||!ready} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-400 to-blue-500 px-5 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45">
              {discovering?<><Loader2 size={17} className="animate-spin"/> كوانتو يبحث الآن...</>:<><Radar size={17}/> شغّل الرادار الآن</>}
            </button>
            <div className="mt-3 text-center text-[11px] leading-5 text-slate-500">{discovery?<>آخر رصد: <span className="text-emerald-300">{new Date(discovery.generatedAt).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</span></>:<>لم يتم تشغيل رصد حقيقي في هذه الجلسة بعد.</>}</div>
          </div>
        </div>

        <PulseLine signals={discovery?.trends||[]} focused={focused} onFocus={setFocused} scanning={discovering} region={profile.region}/>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={<Target size={17}/>} label="تحتاج تحرّك" value={discovery?String(actionable):'—'}/>
        <Metric icon={<Eye size={17}/>} label="تحت المراقبة" value={discovery?String(watching):'—'}/>
        <Metric icon={<Bookmark size={17}/>} label="محفوظة" value={String(saved.length)}/>
        <Metric icon={<ShieldCheck size={17}/>} label="مصادر" value={discovery?String(discovery.sources.length):'—'}/>
      </section>

      {profileOpen&&<ProfilePanel profile={profile} image={image} onUpdate={update} onTogglePlatform={togglePlatform} onImage={loadImage} onClose={()=>setProfileOpen(false)}/>}      

      {error&&<div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-100">{error}{auth&&<a href="/auth" className="mr-3 inline-block rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">تسجيل الدخول</a>}</div>}

      {discovery&&<>
        <section className="mt-7 rounded-[28px] border border-white/8 bg-white/[.025] p-5 md:p-6">
          <div className="flex items-start gap-3"><BrainCircuit className="mt-1 text-cyan-300" size={20}/><div><div className="text-[11px] text-slate-500">خلاصة كوانتو</div><h2 className="mt-1 text-xl font-black leading-8">{discovery.summary}</h2></div></div>
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.045] p-3 text-xs leading-6 text-amber-100/75">{discovery.trustNote}</div>
        </section>

        <section className="mt-5 flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/[.02] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">{([['all','الكل'],['now','تحرّك الآن'],['watch','راقب'],['saved','المحفوظة']] as [Filter,string][]).map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter===value?'bg-cyan-300 text-slate-950':'border border-white/8 bg-white/[.035] text-slate-300'}`}>{label}</button>)}</div>
          <label className="relative min-w-0 md:w-80"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث داخل إشاراتك" className="w-full rounded-xl border border-white/10 bg-[#09121f] py-2.5 pr-9 pl-3 text-xs outline-none"/></label>
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <section className="space-y-3">{filtered.map(trend=><SignalCard key={trend.id} trend={trend} saved={saved.includes(trend.id)} onSave={()=>setSaved(ids=>ids.includes(trend.id)?ids.filter(id=>id!==trend.id):[...ids,trend.id])} onFocus={()=>setFocused(trend)} onContent={()=>runScript(trend)}/>)}</section>
          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            {focused?<FocusCard trend={focused} onContent={()=>runScript(focused)}/>:<div className="rounded-3xl border border-dashed border-white/10 p-7 text-center text-sm leading-7 text-slate-500">حرّك الماوس أو اضغط على أي نقطة في Pulse Line.</div>}
          </aside>
        </div>
      </>}
    </div>

    {sourcesOpen&&discovery&&<Modal title="المصادر التي اعتمد عليها الرصد" onClose={()=>setSourcesOpen(false)}><div className="space-y-2">{discovery.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[.03] p-3 text-sm hover:bg-white/[.06]"><span className="truncate">{source.title}</span><ExternalLink size={15} className="shrink-0 text-cyan-300"/></a>)}</div></Modal>}

    {studioOpen&&<Modal title={selected?`حوّل الإشارة إلى محتوى · ${selected.title}`:'Content Studio'} onClose={()=>setStudioOpen(false)} wide><div className="space-y-4">{generating?<div className="grid min-h-56 place-items-center text-slate-400"><div className="text-center"><Loader2 className="mx-auto animate-spin text-cyan-300"/><div className="mt-3 text-sm">كوانتو يكتب نسخة مخصصة...</div></div></div>:script?<><Info title="أفضل Hook" text={script.hook}/><Block title="Hooks بديلة" items={script.hooks}/><Block title="السكربت" items={script.body}/><Info title="CTA" text={script.cta}/><Info title="Caption" text={script.caption}/><Block title="خطة تصوير بسيطة" items={script.shotPlan}/><div className="flex flex-wrap gap-2">{script.hashtags.map(tag=><span key={tag} className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-200">{tag}</span>)}</div><button onClick={copyScript} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-950"><Copy size={14}/> نسخ المحتوى</button></>:<div className="p-10 text-center text-slate-500">لم يتم توليد محتوى بعد.</div>}</div></Modal>}
  </main>;
}

function PulseLine({signals,focused,onFocus,scanning,region}:{signals:Trend[];focused:Trend|null;onFocus:(trend:Trend)=>void;scanning:boolean;region:string}){
  return <section className={`relative min-h-[410px] overflow-hidden rounded-[32px] border border-white/8 bg-gradient-to-bl ${contextSkin(region)} p-5 md:p-6`}>
    <div className="pointer-events-none absolute inset-0 opacity-50"><div className="absolute -right-20 bottom-[-80px] h-52 w-72 rounded-[50%] border border-amber-200/10 bg-amber-200/[.03] blur-sm"/><div className="absolute right-1/3 top-8 h-16 w-16 rounded-full bg-cyan-300/[.035] blur-xl"/></div>
    <div className="relative flex items-start justify-between gap-3"><div><div className="text-[11px] font-black tracking-[.18em] text-cyan-300">PULSE LINE</div><h2 className="mt-1 text-xl font-black">المشهد يتحرّك مع الوقت</h2><p className="mt-1 text-xs leading-6 text-slate-500">الجديد أكبر وأوضح. القديم يصغر ويبهت. الحجم هنا يعني أهمية الإشارة لك + حداثتها، وليس عدد المشاهدات.</p></div><div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-[11px] text-slate-400">{region}</div></div>

    {!signals.length?<div className="relative mt-10 grid min-h-56 place-items-center rounded-3xl border border-dashed border-white/10 bg-black/10"><div className="text-center">{scanning?<><Loader2 className="mx-auto animate-spin text-cyan-300"/><div className="mt-3 text-sm text-slate-400">الرادار يلتقط الإشارات الآن...</div></>:<><Radar className="mx-auto text-slate-600" size={28}/><div className="mt-3 text-sm font-bold text-slate-400">Pulse Line بانتظار أول رصد حقيقي</div><div className="mt-1 text-xs text-slate-600">لن نملأها ببيانات تجميلية.</div></>}</div></div>:<>
      <div className="relative mt-10 h-48 overflow-x-auto overflow-y-hidden px-3 pb-2">
        <div className="absolute left-6 right-6 top-[88px] h-px bg-gradient-to-r from-slate-700 via-cyan-300/50 to-emerald-300/70"/>
        <div className="absolute left-6 right-6 top-[83px] h-3 opacity-40 blur-sm bg-gradient-to-r from-transparent via-cyan-300/20 to-emerald-300/25"/>
        <div className="relative flex min-w-[720px] flex-row-reverse items-start justify-between gap-5 pt-5">
          {signals.map((signal,index)=>{
            const size=signalSize(signal,index);const active=focused?.id===signal.id;
            return <button key={signal.id} onMouseEnter={()=>onFocus(signal)} onFocus={()=>onFocus(signal)} onClick={()=>onFocus(signal)} className="group relative flex w-[110px] flex-col items-center text-center outline-none" style={{opacity:Math.max(.42,1-index*.07)}}>
              <div className={`grid place-items-center rounded-full border transition duration-300 group-hover:scale-110 ${signalColor(signal)} ${active?'ring-4 ring-cyan-300/10 shadow-[0_0_28px_rgba(103,232,249,.22)]':''}`} style={{width:size,height:size}}><KindIcon kind={signal.kind} size={Math.max(15,size*.28)}/></div>
              <div className="mt-3 line-clamp-2 text-[11px] font-bold leading-4 text-slate-300">{signal.title}</div>
              <div className="mt-1 text-[10px] text-slate-600">{index===0?'الآن':index<=2?'اليوم':index<=4?'أمس':'هذا الأسبوع'}</div>
            </button>;
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3 text-[10px] text-slate-600"><span>هذا الأسبوع ← الأقدم</span><span>اليوم</span><span className="text-emerald-300">الآن ← الأحدث</span></div>
    </>}
  </section>;
}

function SignalCard({trend,saved,onSave,onFocus,onContent}:{trend:Trend;saved:boolean;onSave:()=>void;onFocus:()=>void;onContent:()=>void}){
  return <article onMouseEnter={onFocus} className="rounded-[26px] border border-white/8 bg-white/[.027] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/15 hover:bg-white/[.04]">
    <div className="flex items-start justify-between gap-3"><div><div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1 rounded-full border border-white/8 px-2.5 py-1"><KindIcon kind={trend.kind} size={12}/>{trend.kind}</span><span className="rounded-full border border-white/8 px-2.5 py-1">{trend.platform}</span><span className="py-1">{trend.freshness}</span></div><h3 className="text-lg font-black leading-7">{trend.title}</h3></div><button onClick={onSave} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${saved?'border-amber-300/25 bg-amber-300/10 text-amber-300':'border-white/8 bg-white/[.035] text-slate-500'}`}><Bookmark size={16} fill={saved?'currentColor':'none'}/></button></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2"><Info title="شو صار؟" text={trend.whatHappened}/><Info title="ليش يهمك؟" text={trend.businessFit}/></div>
    <div className="mt-4 rounded-2xl border border-cyan-300/12 bg-cyan-300/[.045] p-4"><div className="text-[10px] font-black text-cyan-300">ماذا تفعل الآن؟</div><div className="mt-1 text-sm font-bold leading-6">{trend.recommendedAction}</div></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${signalColor(trend)}`}>{trend.state==='استخدم الآن'?'تحرّك الآن':trend.state}</span><span className="rounded-full border border-white/8 px-2.5 py-1 text-[10px] text-slate-400">قوة الإشارة: {trend.signalStrength}</span><span className="rounded-full border border-white/8 px-2.5 py-1 text-[10px] text-slate-400">فرصة محتوى: {trend.contentPotential}</span></div>
    {trend.contentPotential!=='منخفض'&&<button onClick={onContent} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.045] px-4 py-2.5 text-xs font-bold hover:bg-white/[.08]"><WandSparkles size={15}/> حوّلها إلى محتوى</button>}
  </article>;
}

function FocusCard({trend,onContent}:{trend:Trend;onContent:()=>void}){
  return <section className="rounded-[28px] border border-cyan-300/12 bg-cyan-300/[.035] p-5"><div className="flex items-center gap-2 text-[10px] font-black text-cyan-300"><KindIcon kind={trend.kind} size={13}/> تحت العدسة الآن</div><h3 className="mt-2 text-xl font-black leading-8">{trend.title}</h3><div className="mt-4 space-y-3"><Info title="ليش الآن؟" text={trend.whyNow}/><Info title="إذا قررت تراقب" text={trend.triggerToWatch}/><Info title="الدليل والثقة" text={trend.evidenceSummary||trend.confidenceNote}/></div>{trend.contentPotential!=='منخفض'&&<button onClick={onContent} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950"><WandSparkles size={15}/> اصنع محتوى من هذه الإشارة</button>}</section>;
}

function ProfilePanel({profile,image,onUpdate,onTogglePlatform,onImage,onClose}:{profile:Profile;image:string;onUpdate:<K extends keyof Profile>(key:K,value:Profile[K])=>void;onTogglePlatform:(name:string)=>void;onImage:(file?:File)=>void;onClose:()=>void}){
  return <section className="mt-5 rounded-[28px] border border-white/8 bg-white/[.025] p-5 md:p-6"><div className="mb-5 flex items-start justify-between"><div><div className="text-[10px] font-black tracking-[.18em] text-cyan-300">YOUR COANTO</div><h2 className="mt-1 text-lg font-black">كل ما تعرفه كوانتو عن نشاطك يجعل الرصد أذكى</h2></div><button onClick={onClose} className="p-2 text-slate-500"><X size={18}/></button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Field label="اسم النشاط" value={profile.businessName} onChange={v=>onUpdate('businessName',v)} placeholder="مثال: متجر نورة"/><Field label="رابط المتجر أو المنتج" value={profile.storeUrl} onChange={v=>onUpdate('storeUrl',v)} placeholder="https://..."/><Field label="اسم المنتج" value={profile.productName} onChange={v=>onUpdate('productName',v)} placeholder="مثال: عطر شرقي"/><Field label="السعر / العرض" value={profile.productPrice} onChange={v=>onUpdate('productPrice',v)} placeholder="249 ر.س — شحن مجاني"/><Field label="الجمهور" value={profile.audience} onChange={v=>onUpdate('audience',v)} placeholder="نساء 22–38"/><Field label="المدينة" value={profile.city} onChange={v=>onUpdate('city',v)} placeholder="الرياض"/><Select label="اللهجة" value={profile.dialect} onChange={v=>onUpdate('dialect',v)} options={['سعودي','خليجي','إماراتي','مصري','لبناني','عربي أبيض']}/><Select label="النبرة" value={profile.tone} onChange={v=>onUpdate('tone',v)} options={['ودّي وواضح','جرأة ذكية','هادئ وفخم','تعليمي','مرح وخفيف']}/><Select label="الهدف" value={profile.objective} onChange={v=>onUpdate('objective',v)} options={['بيع','تفاعل','وعي','تعليم']}/><label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-400">وصف المنتج/النشاط</span><textarea rows={3} value={profile.productDescription} onChange={e=>onUpdate('productDescription',e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#08121f] px-4 py-3 text-sm outline-none focus:border-cyan-300/30" placeholder="شو تبيع؟ شو يميزك؟ لمن؟"/></label><label><span className="mb-1.5 block text-xs font-bold text-slate-400">صورة المنتج</span><div className="flex min-h-[94px] items-center gap-3 rounded-2xl border border-dashed border-white/12 bg-[#08121f] p-3">{image?<img src={image} alt="المنتج" className="h-16 w-16 rounded-xl object-cover"/>:<div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-500"><ImageIcon size={20}/></div>}<label className="cursor-pointer rounded-xl bg-white/[.06] px-3 py-2 text-xs font-bold"><Upload size={14} className="ml-1 inline"/>{image?'غيّر':'ارفع'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>onImage(e.target.files?.[0])}/></label></div></label><div className="md:col-span-2 lg:col-span-3"><span className="mb-2 block text-xs font-bold text-slate-400">المصادر التي تهمك</span><div className="flex flex-wrap gap-2">{['TikTok','Instagram Reels','YouTube','X','Google/Web'].map(name=><button type="button" key={name} onClick={()=>onTogglePlatform(name)} className={`rounded-full border px-3 py-2 text-[11px] ${profile.platforms.includes(name)?'border-cyan-300/25 bg-cyan-300/10 text-cyan-200':'border-white/8 text-slate-500'}`}>{name}</button>)}</div></div></div></section>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-2xl border border-white/8 bg-white/[.025] p-4"><div className="flex items-center justify-between text-slate-500"><span className="text-[11px]">{label}</span>{icon}</div><div className="mt-2 text-2xl font-black">{value}</div></div>}
function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-[#08121f] px-4 py-3 text-sm outline-none focus:border-cyan-300/30"/></label>}
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[]}){return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#08121f] px-4 py-3 text-sm outline-none">{options.map(option=><option key={option}>{option}</option>)}</select></label>}
function Info({title,text}:{title:string;text:string}){return <div className="rounded-2xl border border-white/8 bg-[#07111d] p-3"><div className="text-[10px] font-black text-slate-500">{title}</div><div className="mt-1 text-xs leading-6 text-slate-300">{text||'—'}</div></div>}
function Block({title,items}:{title:string;items:string[]}){return <div><div className="mb-2 text-[10px] font-black text-slate-500">{title}</div><div className="space-y-2">{items.map((item,index)=><div key={`${item}-${index}`} className="rounded-xl border border-white/8 bg-[#07111d] p-3 text-xs leading-6 text-slate-300">{item}</div>)}</div></div>}
function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className={`max-h-[88vh] w-full overflow-y-auto rounded-[28px] border border-white/10 bg-[#07111d] p-5 shadow-2xl ${wide?'max-w-3xl':'max-w-xl'}`}><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black">{title}</h3><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/8 bg-white/[.04] text-slate-400"><X size={16}/></button></div>{children}</div></div>}
