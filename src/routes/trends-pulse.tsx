import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpLeft, Bookmark, CheckCircle2, ExternalLink, Image as ImageIcon, Loader2, Radar, RefreshCw, Search, Sparkles, Target, Upload, WandSparkles, X } from 'lucide-react';

type Profile = {
  businessName: string;
  storeUrl: string;
  productName: string;
  productPrice: string;
  productDescription: string;
  audience: string;
  region: string;
  city: string;
  dialect: string;
  tone: string;
  objective: string;
  prohibitedClaims: string;
  platforms: string[];
};

type Trend = {
  id: string;
  title: string;
  hashtag?: string;
  platform: string;
  signalStrength: 'قوية' | 'متوسطة' | 'أولية';
  freshness: string;
  state: 'استخدم الآن' | 'راقب' | 'تجاهل';
  whyNow: string;
  businessFit: string;
  contentAngle: string;
  saturationRisk: string;
  confidenceNote: string;
  evidenceSummary?: string;
};

type Source = { title: string; url: string };
type Discovery = { generatedAt: string; summary: string; trends: Trend[]; sources: Source[]; searchQueries: string[]; trustNote: string };
type Script = { hook: string; hooks: string[]; body: string[]; cta: string; caption: string; hashtags: string[]; shotPlan: string[]; commentReplies: string[]; duration: string; safetyNote: string };

type PublishedResult = { trendId: string; title: string; result: string; createdAt: string };

const defaultProfile: Profile = {
  businessName: '', storeUrl: '', productName: '', productPrice: '', productDescription: '', audience: '',
  region: 'السعودية', city: '', dialect: 'سعودي', tone: 'ودّي وواضح', objective: 'بيع', prohibitedClaims: '',
  platforms: ['TikTok', 'Instagram Reels', 'X early signals'],
};

async function callApi(body: Record<string, unknown>) {
  const response = await fetch('/api/trends-pulse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data?.error === 'string' ? data.error : 'تعذّر إكمال العملية.') as Error & { code?: string };
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    throw error;
  }
  return data;
}

function strengthClasses(value: Trend['signalStrength']) {
  if (value === 'قوية') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
  if (value === 'متوسطة') return 'border-blue-400/25 bg-blue-400/10 text-blue-300';
  return 'border-amber-300/25 bg-amber-300/10 text-amber-200';
}
function stateClasses(value: Trend['state']) {
  if (value === 'استخدم الآن') return 'bg-emerald-300 text-slate-950';
  if (value === 'تجاهل') return 'bg-slate-700 text-slate-300';
  return 'bg-blue-500 text-white';
}

export const Route = createFileRoute('/trends-pulse')({
  head: () => ({ meta: [{ title: 'TRENDS PULSE — ترندات تناسب مشروعك' }, { name: 'description', content: 'رصد ترندات مخصص لأصحاب المشاريع الصغيرة وتحويلها إلى محتوى جاهز.' }] }),
  component: TrendsPulsePage,
});

function TrendsPulsePage() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [authRequired, setAuthRequired] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [published, setPublished] = useState<PublishedResult[]>([]);
  const [resultDraft, setResultDraft] = useState('');
  const [showProfile, setShowProfile] = useState(true);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('trends-pulse-profile');
      if (savedProfile) setProfile({ ...defaultProfile, ...JSON.parse(savedProfile) });
      setSavedIds(JSON.parse(localStorage.getItem('trends-pulse-saved') || '[]'));
      setPublished(JSON.parse(localStorage.getItem('trends-pulse-results') || '[]'));
    } catch {}
  }, []);

  useEffect(() => { try { localStorage.setItem('trends-pulse-profile', JSON.stringify(profile)); } catch {} }, [profile]);
  useEffect(() => { try { localStorage.setItem('trends-pulse-saved', JSON.stringify(savedIds)); } catch {} }, [savedIds]);
  useEffect(() => { try { localStorage.setItem('trends-pulse-results', JSON.stringify(published)); } catch {} }, [published]);

  const profileReady = Boolean(profile.storeUrl.trim() || profile.productName.trim() || profile.productDescription.trim());
  const actionableCount = useMemo(() => discovery?.trends.filter((item) => item.state === 'استخدم الآن').length || 0, [discovery]);

  const update = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile((current) => ({ ...current, [key]: value }));

  const handleImage = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('استخدم صورة JPG أو PNG أو WEBP.'); return; }
    if (file.size > 2_000_000) { setError('الصورة كبيرة. اختر صورة أقل من 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  const discover = async () => {
    if (!profileReady) { setError('أضف رابط المنتج أو اسمه/وصفه أولًا.'); return; }
    setDiscovering(true); setError(''); setAuthRequired(false); setScript(null); setSelectedTrend(null);
    try {
      const data = await callApi({ mode: 'discover', profile });
      setDiscovery(data.result as Discovery);
      setShowProfile(false);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message);
      setAuthRequired(err.code === 'AUTH_REQUIRED');
    } finally { setDiscovering(false); }
  };

  const generate = async (trend: Trend) => {
    setSelectedTrend(trend); setGenerating(true); setError(''); setAuthRequired(false); setScript(null);
    try {
      const data = await callApi({ mode: 'script', profile, trend, format: trend.platform.includes('Instagram') ? 'Instagram Reels' : 'TikTok', imageDataUrl: imageDataUrl || undefined });
      setScript(data.result as Script);
      setTimeout(() => document.getElementById('script-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message);
      setAuthRequired(err.code === 'AUTH_REQUIRED');
    } finally { setGenerating(false); }
  };

  const saveResult = () => {
    if (!selectedTrend || !resultDraft.trim()) return;
    setPublished((current) => [{ trendId: selectedTrend.id, title: selectedTrend.title, result: resultDraft.trim(), createdAt: new Date().toISOString() }, ...current].slice(0, 30));
    setResultDraft('');
  };

  const copyScript = async () => {
    if (!script) return;
    const text = [script.hook, ...script.body, script.cta, script.caption, script.hashtags.join(' ')].join('\n\n');
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return <main dir="rtl" className="min-h-screen bg-[#07101e] text-slate-100">
    <div className="border-b border-amber-300/15 bg-amber-300/5 px-4 py-2 text-center text-xs text-amber-100">
      Real V1 — البحث عبر الويب وGemini حقيقي. لا نعرض أرقام نمو أو مشاهدات إلا إذا كانت موثقة من مصدر.
    </div>

    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07101e]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 font-black shadow-lg shadow-blue-900/30">AI</div>
          <div><div className="font-black tracking-wide">TRENDS <span className="text-blue-400">PULSE</span></div><div className="text-[11px] text-slate-500">من الترند إلى محتوى يناسب منتجك</div></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowProfile((v) => !v)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10">ملف النشاط</button>
          <button onClick={() => setShowSources(true)} disabled={!discovery} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10">المصادر</button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-4 py-7 md:px-6 md:py-10">
      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-3xl border border-white/8 bg-gradient-to-bl from-blue-500/10 via-white/[.035] to-violet-500/10 p-6 md:p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs text-blue-200"><Radar size={14}/> لا نعرض كل الترندات. نعرض ما يناسب مشروعك فقط.</div>
          <h1 className="max-w-4xl text-3xl font-black leading-tight md:text-5xl">وش أنشر اليوم… <span className="text-blue-400">وليش هذا الترند يهم منتجي؟</span></h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 md:text-base">TRENDS PULSE يبحث عن الإشارات الحديثة، يربطها بمنتجك وجمهورك، ثم يعطيك زاوية محتوى وسكربت جاهز بدل Feed عام وعشوائي.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
            {['TikTok — نشر', 'Instagram Reels — نشر', 'X — Early Signal', 'مواسم سعودية وخليجية'].map((item) => <span key={item} className="rounded-full border border-white/8 bg-black/15 px-3 py-2">{item}</span>)}
          </div>
        </div>
        <div className="rounded-3xl border border-white/8 bg-white/[.035] p-5">
          <div className="text-xs text-slate-500">اليوم في مساحة عملك</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Metric icon={<Target size={17}/>} label="فرص قابلة للتنفيذ" value={discovery ? String(actionableCount) : '—'} />
            <Metric icon={<Activity size={17}/>} label="إشارات تم فحصها" value={discovery ? String(discovery.trends.length) : '—'} />
            <Metric icon={<Bookmark size={17}/>} label="محفوظة" value={String(savedIds.length)} />
            <Metric icon={<CheckCircle2 size={17}/>} label="نتائج مسجلة" value={String(published.length)} />
          </div>
        </div>
      </section>

      {showProfile && <section className="mt-5 rounded-3xl border border-white/8 bg-white/[.035] p-5 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-black">ملف هوية نشاطك</h2><p className="mt-1 text-xs text-slate-500">يبقى محفوظًا على جهازك. كلما كان أدق، صار الترند والسكربت أذكى.</p></div>
          <button onClick={() => setShowProfile(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/5"><X size={18}/></button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Field label="اسم النشاط" value={profile.businessName} onChange={(v) => update('businessName', v)} placeholder="مثال: متجر نورة" />
          <Field label="رابط المتجر أو المنتج" value={profile.storeUrl} onChange={(v) => update('storeUrl', v)} placeholder="https://..." />
          <Field label="اسم المنتج" value={profile.productName} onChange={(v) => update('productName', v)} placeholder="مثال: عباية لينن" />
          <Field label="السعر / العرض الحالي" value={profile.productPrice} onChange={(v) => update('productPrice', v)} placeholder="مثال: 249 ر.س — شحن مجاني" />
          <Field label="الجمهور" value={profile.audience} onChange={(v) => update('audience', v)} placeholder="نساء 22–38 في الرياض وجدة" />
          <Field label="المدينة" value={profile.city} onChange={(v) => update('city', v)} placeholder="مثال: الرياض" />
          <SelectField label="اللهجة" value={profile.dialect} onChange={(v) => update('dialect', v)} options={['سعودي','خليجي','إماراتي','مصري','لبناني','عربي أبيض']} />
          <SelectField label="النبرة" value={profile.tone} onChange={(v) => update('tone', v)} options={['ودّي وواضح','جرأة ذكية','هادئ وفخم','تعليمي','مرح وخفيف']} />
          <SelectField label="هدف المحتوى" value={profile.objective} onChange={(v) => update('objective', v)} options={['بيع','تفاعل','وعي','تعليم']} />
          <label className="md:col-span-2 lg:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-400">وصف المنتج</span><textarea value={profile.productDescription} onChange={(e) => update('productDescription', e.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-[#0a1525] px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-blue-400/40" placeholder="المادة، الميزة الأساسية، لمن يناسب، وما الذي لا تريد أن نقوله عنه..." /></label>
          <label><span className="mb-1.5 block text-xs font-bold text-slate-400">صورة المنتج</span><div className="flex min-h-[90px] items-center gap-3 rounded-2xl border border-dashed border-white/12 bg-[#0a1525] p-3">{imageDataUrl ? <img src={imageDataUrl} className="h-16 w-16 rounded-xl object-cover" alt="المنتج"/> : <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-500"><ImageIcon size={20}/></div>}<label className="cursor-pointer rounded-xl bg-white/7 px-3 py-2 text-xs font-bold hover:bg-white/10"><Upload size={14} className="ml-1 inline"/> {imageDataUrl ? 'غيّر الصورة' : 'ارفع صورة'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])}/></label></div></label>
          <label className="md:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-xs font-bold text-slate-400">محظورات أو كلمات حساسة</span><input value={profile.prohibitedClaims} onChange={(e) => update('prohibitedClaims', e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#0a1525] px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-blue-400/40" placeholder="مثال: لا نذكر وعود طبية، لا نقارن بمنافس بالاسم..."/></label>
        </div>
      </section>}

      <section className="mt-5 flex flex-col gap-3 rounded-3xl border border-blue-400/15 bg-blue-400/[.055] p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div><div className="flex items-center gap-2 font-black"><Search size={18} className="text-blue-400"/> ابحث عما يستحق النشر الآن</div><div className="mt-1 text-xs text-slate-500">سنبحث عن إشارات مرتبطة بمنتجك لا عن “أكثر شيء مشهور” فقط.</div></div>
        <button onClick={discover} disabled={discovering || !profileReady} className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-blue-500 to-violet-600 px-5 py-3 text-sm font-black shadow-lg shadow-blue-950/30 disabled:cursor-not-allowed disabled:opacity-50">{discovering ? <><Loader2 size={17} className="animate-spin"/> جاري البحث الحقيقي...</> : <><Radar size={17}/> شغّل الرصد الآن</>}</button>
      </section>

      {error && <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-100"><div>{error}</div>{authRequired && <a href="/auth" className="mt-3 inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">تسجيل الدخول <ArrowUpLeft size={14}/></a>}</div>}

      {discovery && <>
        <section className="mt-7 rounded-3xl border border-white/8 bg-white/[.03] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-xs text-slate-500">ماذا وجدنا؟</div><h2 className="mt-1 text-xl font-black">{discovery.summary}</h2></div><div className="rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-[11px] text-slate-500">آخر بحث: {new Date(discovery.generatedAt).toLocaleString('ar-SA')}</div></div>
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-6 text-amber-100/80">{discovery.trustNote}</div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
          <section className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="font-black">الإشارات المناسبة لك</h2><span className="text-xs text-slate-500">{discovery.trends.length} إشارة</span></div>
            {discovery.trends.map((trend) => <article key={trend.id} className="rounded-3xl border border-white/8 bg-white/[.035] p-5 transition hover:border-blue-400/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span className="rounded-full border border-white/8 bg-black/20 px-2.5 py-1">{trend.platform}</span><span>{trend.freshness}</span>{trend.hashtag && <span className="text-blue-400">{trend.hashtag}</span>}</div><h3 className="text-lg font-black leading-7">{trend.title}</h3></div>
                <button onClick={() => setSavedIds((ids) => ids.includes(trend.id) ? ids.filter((id) => id !== trend.id) : [...ids, trend.id])} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${savedIds.includes(trend.id) ? 'border-amber-300/25 bg-amber-300/10 text-amber-300' : 'border-white/8 bg-white/5 text-slate-500'}`}><Bookmark size={17} fill={savedIds.includes(trend.id) ? 'currentColor' : 'none'}/></button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${strengthClasses(trend.signalStrength)}`}>الإشارة: {trend.signalStrength}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${stateClasses(trend.state)}`}>{trend.state}</span></div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Info title="ليش يتحرك الآن؟" text={trend.whyNow}/><Info title="ليش يهم منتجك؟" text={trend.businessFit}/><Info title="الزاوية المقترحة" text={trend.contentAngle}/><Info title="خطر التشبّع" text={trend.saturationRisk}/>
              </div>
              {(trend.evidenceSummary || trend.confidenceNote) && <div className="mt-4 rounded-2xl border border-white/8 bg-[#091524] p-3 text-xs leading-6 text-slate-400"><b className="text-slate-300">الثقة والدليل:</b> {trend.evidenceSummary || trend.confidenceNote}</div>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button onClick={() => generate(trend)} disabled={generating} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-blue-500 to-violet-600 px-4 py-3 text-sm font-black disabled:opacity-50"><WandSparkles size={16}/>{generating && selectedTrend?.id === trend.id ? 'جاري كتابة المحتوى...' : 'حوّله إلى محتوى'}</button><button onClick={() => { setSelectedTrend(trend); setTimeout(() => document.getElementById('closed-loop')?.scrollIntoView({behavior:'smooth'}), 10); }} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold">نشرته — سجّل النتيجة</button></div>
            </article>)}
          </section>

          <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <section id="script-studio" className="rounded-3xl border border-violet-400/15 bg-gradient-to-b from-violet-400/[.07] to-white/[.025] p-5">
              <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-300"/><h2 className="font-black">Content Studio</h2></div>
              {!script ? <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/10 p-7 text-center text-sm leading-7 text-slate-500">اختر إشارة واضغط <b className="text-slate-300">«حوّله إلى محتوى»</b>.<br/>سنستخدم ملف نشاطك وصورة المنتج إن رفعتها.</div> : <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[.06] p-4"><div className="text-[11px] font-black text-violet-300">الهوك الأفضل</div><div className="mt-2 text-sm font-black leading-7">{script.hook}</div></div>
                <Block title="5 هوكات للاختبار" items={script.hooks}/><Block title="السكربت" items={script.body}/><Info title="CTA" text={script.cta}/><Info title="Caption" text={script.caption}/><Block title="لقطات سهلة بالجوال" items={script.shotPlan}/><Block title="ردود جاهزة للتعليقات" items={script.commentReplies}/>
                <div className="flex flex-wrap gap-2">{script.hashtags.map((tag) => <span key={tag} className="rounded-full bg-blue-400/10 px-2.5 py-1 text-[11px] text-blue-300">{tag}</span>)}</div>
                <div className="text-[11px] leading-5 text-amber-100/70">{script.safetyNote}</div>
                <div className="grid grid-cols-2 gap-2"><button onClick={() => selectedTrend && generate(selectedTrend)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> نسخة جديدة</button><button onClick={copyScript} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">نسخ المحتوى</button></div>
              </div>}
            </section>

            <section className="rounded-3xl border border-white/8 bg-white/[.03] p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black">لماذا هذه النسخة أقوى؟</h3></div><div className="space-y-3 text-xs leading-6 text-slate-400">{['لا Feed عام: كل إشارة تمر عبر ملاءمة منتجك.','X يستخدم كإنذار مبكر، لا كمنصة سكربت فيديو.','الصورة + الهوية تدخل في توليد المحتوى.','نحفظ نتيجة ما نشرته لنصنع Learning Loop لاحقًا.','المواسم المحلية تدخل في البحث عندما تكون ذات صلة.'].map((x) => <div key={x} className="flex gap-2"><CheckCircle2 size={15} className="mt-1 shrink-0 text-emerald-400"/><span>{x}</span></div>)}</div></section>
          </aside>
        </div>
      </>}

      <section id="closed-loop" className="mt-7 rounded-3xl border border-emerald-400/15 bg-emerald-400/[.04] p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
          <div><div className="text-xs text-emerald-300">Closed Loop</div><h2 className="mt-1 text-xl font-black">علّم TRENDS PULSE ماذا نجح معك</h2><p className="mt-2 text-sm leading-7 text-slate-400">بعد النشر، سجّل النتيجة بكلمات بسيطة. لاحقًا سنستخدم هذه البيانات لترتيب الترندات والهوكات حسب ما ينجح فعليًا مع جمهورك.</p></div>
          <div className="rounded-2xl border border-white/8 bg-[#091524] p-4"><div className="mb-2 text-xs font-bold text-slate-400">{selectedTrend ? `المنشور: ${selectedTrend.title}` : 'اختر ترندًا من الأعلى أولًا'}</div><textarea value={resultDraft} onChange={(e) => setResultDraft(e.target.value)} disabled={!selectedTrend} rows={3} className="w-full rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-sm outline-none disabled:opacity-40" placeholder="مثال: نشرته الساعة 8، جاب 42 طلب واتساب، التعليقات سألت كثير عن اللون..."/><button onClick={saveResult} disabled={!selectedTrend || !resultDraft.trim()} className="mt-2 w-full rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40">احفظ النتيجة</button>{published.length > 0 && <div className="mt-4 space-y-2">{published.slice(0, 3).map((item, index) => <div key={`${item.createdAt}-${index}`} className="rounded-xl border border-white/6 bg-white/[.025] p-3 text-xs text-slate-400"><b className="text-slate-200">{item.title}</b><div className="mt-1">{item.result}</div></div>)}</div>}</div>
        </div>
      </section>
    </div>

    {showSources && discovery && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setShowSources(false)}><div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-3xl border border-white/10 bg-[#0a1525] p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><div className="text-xs text-slate-500">أدلة البحث الحالي</div><h2 className="font-black">المصادر التي وجدها Gemini Search</h2></div><button onClick={() => setShowSources(false)} className="rounded-xl p-2 hover:bg-white/5"><X size={18}/></button></div><div className="space-y-2">{discovery.sources.length ? discovery.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[.03] p-3 hover:border-blue-400/20"><div className="min-w-0"><div className="truncate text-sm font-bold">{source.title}</div><div className="mt-1 truncate text-[10px] text-slate-600">{source.url}</div></div><ExternalLink size={15} className="shrink-0 text-blue-400"/></a>) : <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-slate-500">لم يرجع مزود البحث روابط مصادر قابلة للعرض في هذا التشغيل.</div>}</div>{discovery.searchQueries.length > 0 && <div className="mt-5"><div className="mb-2 text-xs font-bold text-slate-500">استعلامات البحث</div><div className="flex flex-wrap gap-2">{discovery.searchQueries.map((q) => <span key={q} className="rounded-full border border-white/8 px-2.5 py-1 text-[10px] text-slate-500">{q}</span>)}</div></div>}</div></div>}
  </main>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-white/10 bg-[#0a1525] px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-blue-400/40"/></label>;
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-[#0a1525] px-4 py-3 text-sm outline-none focus:border-blue-400/40">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/8 bg-[#0a1525] p-3"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-[10px]">{label}</span></div><div className="mt-2 text-xl font-black">{value}</div></div>;
}
function Info({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-white/8 bg-[#091524] p-3"><div className="mb-1 text-[11px] font-black text-slate-400">{title}</div><div className="text-xs leading-6 text-slate-300">{text || 'غير متاح بعد'}</div></div>;
}
function Block({ title, items }: { title: string; items: string[] }) {
  return <div><div className="mb-2 text-[11px] font-black text-slate-400">{title}</div><div className="space-y-2">{items.map((item, index) => <div key={`${title}-${index}`} className="rounded-xl border border-white/8 bg-[#091524] p-3 text-xs leading-6 text-slate-300">{item}</div>)}</div></div>;
}
