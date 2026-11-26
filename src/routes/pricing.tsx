import { createFileRoute } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowUpLeft, BadgeCheck, Check, CheckCircle2, CircleHelp,
  ExternalLink, Eye, FileText, Fingerprint, Globe2, Mail, ShieldCheck,
  Sparkles, Target, Zap,
} from 'lucide-react';

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: 'COANTO — اعرف منافسيك. قرّر بالدليل.' },
      {
        name: 'description',
        content: 'تجربة تحليل تنافسي مدفوعة للمتاجر الإلكترونية: إشارات موثقة، مقارنة منافسين، وقرار عملي واضح. اطلب تجربة COANTO الأولى بقيمة 99 دولاراً.',
      },
    ],
  }),
});

const benefits = [
  {
    icon: Eye,
    title: 'نشوف شو عم يصير فعلاً',
    description: 'نراجع إشارات متاحة علناً من متجرك والمنافسين: عروض، منتجات، تغييرات ورسائل تسويقية قابلة للتوثيق.',
  },
  {
    icon: ShieldCheck,
    title: 'نفرّق الدليل عن التخمين',
    description: 'كل ملاحظة مهمة مرتبطة بمصدرها، وما منخترع أرقام مبيعات أو حصص سوقية أو نتائج غير متاحة.',
  },
  {
    icon: Target,
    title: 'منحوّل المعلومة لقرار',
    description: 'شو صار؟ ليش بيهمّك؟ شو بتعمل هلأ؟ وشو لازم تراقب قبل ما تغيّر خطتك؟',
  },
];

const steps = [
  { number: '01', title: 'اطلب التجربة', description: 'ابعث رابط متجرك وبريدك، من دون كلمة سر أو وصول لحساباتك.' },
  { number: '02', title: 'منحدّد النطاق والدفع', description: 'منردّ عليك لتأكيد ملاءمة الحالة ونطاق التجربة وطريقة الدفع قبل أي رسوم.' },
  { number: '03', title: 'بتستلم قراءة قابلة للتنفيذ', description: 'تحليل المنافسة والأدلة ونقاط القرار، مع توضيح الأمور التي لا تتوفر عنها بيانات كافية.' },
];

const questions = [
  { q: 'هل بتحتاجوا وصول للمتجر أو بيانات مبيعات؟', a: 'لا. التجربة الأولى تعتمد على معلومات متاحة علناً. إذا احتجنا سياقاً داخلياً لقرار أدق، نطلبه بموافقتك فقط.' },
  { q: 'هل النتيجة مضمونة؟', a: 'ما منوعد بمبيعات إضافية أو أرباح مضمونة. منقدّم تحليل مبني على أدلة متاحة ومقترحات قرارات، ومنوضح حدود التغطية.' },
  { q: 'هل بيُسحب المبلغ فوراً؟', a: 'لا. إرسال الطلب مجاني. مبلغ 99 دولاراً هو سعر التجربة المقترح، والدفع يتم فقط بعد الاتفاق والتأكيد. ما في خصم تلقائي أو اشتراك مخفي.' },
  { q: 'هل المثال الموجود بالمنصة تحليل حقيقي؟', a: 'صفحة العرض التوضيحي فيها بيانات افتراضية موضّح أنها Demo. التحليل الحقيقي يتم فقط على مواقع فعلية مع أدلة قابلة للفحص.' },
];

function PricingPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [priority, setPriority] = useState('المنافسون والأسعار');
  const [agreed, setAgreed] = useState(false);
  const [mailOpened, setMailOpened] = useState(false);

  function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed) return;
    const subject = encodeURIComponent('COANTO — طلب تجربة مدفوعة بقيمة 99 دولار');
    const body = encodeURIComponent([
      'مرحباً فريق COANTO،',
      '',
      'أرغب في مناقشة تجربة التحليل التنافسي الأولى (99 USD).',
      'الاسم: ' + name.trim(),
      'البريد الإلكتروني: ' + email.trim(),
      'موقع المتجر: ' + website.trim(),
      'أولوية المتابعة: ' + priority,
      '',
      'أفهم أن إرسال الطلب مجاني، وأن السعر ونطاق الخدمة والدفع تُؤكد قبل بدء العمل.',
    ].join('\n'));
    setMailOpened(true);
    window.location.href = 'mailto:coantoai@gmail.com?subject=' + subject + '&body=' + body;
  }

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#071018] text-[#f5faf9]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[700px] bg-[radial-gradient(ellipse_at_73%_6%,rgba(36,202,181,.13),transparent_47%),radial-gradient(ellipse_at_8%_20%,rgba(54,115,152,.12),transparent_50%)]" aria-hidden="true" />
      <header className="relative z-10 border-b border-white/[.07] bg-[#071018]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <a href="/pricing" aria-label="COANTO" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#31d8be]/25 bg-[#31d8be]/10 text-[#31d8be]"><Fingerprint size={21} /></span>
            <span><strong className="block text-lg font-black tracking-[3px] text-[#b9fff3]">COANTO</strong><small className="block text-[10px] font-medium tracking-[.12em] text-slate-400">COMPETITIVE DECISION INTELLIGENCE</small></span>
          </a>
          <nav className="flex items-center gap-3 text-xs font-semibold">
            <a href="/demo" className="hidden text-slate-300 transition hover:text-white sm:inline">شوف مثال</a>
            <a href="#apply" className="rounded-xl bg-[#40dbc1] px-4 py-3 font-black text-[#06221c] transition hover:bg-[#84ffe7]">اطلب التجربة <ArrowLeft className="mr-1 inline" size={14} /></a>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:pb-24 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#39d7c0]/25 bg-[#2cd3ba]/[.07] px-4 py-2 text-xs font-semibold text-[#8ff9e6]"><Sparkles size={14} /> تجربة مخصّصة للمتاجر الإلكترونية</div>
            <h1 className="mt-7 max-w-3xl text-[clamp(2.45rem,5.5vw,4.4rem)] font-black leading-[1.18] tracking-tight">
              منافسك تحرّك.<br /><span className="text-[#53e4cc]">شو قرارك؟</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-9 text-[#bac9d0]">
              COANTO بتراجع المنافسة حول متجرك، بتفرز الإشارات المهمّة من الضجيج، وبتوصلك لقرار عملي <strong className="text-white">مع الدليل ومصدره</strong>، مش تقرير طويل وما بتعرف شو تعمل فيه.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#apply" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#40dbc1] px-6 py-3 font-black text-[#06221c] transition hover:bg-[#84ffe7]">ابدأ بطلب التجربة <ArrowLeft size={17} /></a>
              <a href="/demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/5">شاهد مثالاً توضيحياً <ExternalLink size={14} /></a>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={15} className="text-[#53e4cc]" /> الطلب مجاني. منؤكّد الخدمة وطريقة الدفع قبل أي التزام.</p>
          </div>

          <div className="relative rounded-[28px] border border-[#245149]/70 bg-[#0d1c25]/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,.33)] sm:p-7">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5">
              <div><div className="text-[11px] font-bold tracking-[.15em] text-[#67ddc9]">THE DECISION BRIEF</div><h2 className="mt-2 text-lg font-extrabold">المهم مش شو تغيّر. المهم شو تعمل.</h2></div>
              <span className="rounded-full border border-[#53e4cc]/25 bg-[#53e4cc]/10 px-3 py-1 text-[10px] font-bold text-[#7cebd9]">شكل النتيجة</span>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-white/[.07] bg-[#10252b] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#80dbc9]"><Globe2 size={15} /> شو لاحظنا؟</div>
                <p className="mt-2 text-sm leading-7 text-slate-200">تغيّر واضح في عرض أحد المنافسين — ما منعتبره تهديداً إلا بعد التحقق من المصدر والصلة بمتجرك.</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-[#10252b] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#80dbc9]"><Target size={15} /> شو القرار؟</div>
                <p className="mt-2 text-sm leading-7 text-slate-200">ACT / TEST / WATCH / IGNORE — خطوة محدّدة، سببها، وما الذي يجعلنا نعيد تقييمها.</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-[#10252b] p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#80dbc9]"><FileText size={15} /> وين الدليل؟</div>
                <p className="mt-2 text-sm leading-7 text-slate-200">مصادر قابلة للفحص، مع فصل واضح بين الملاحظة، الاستنتاج، والمعلومات غير المتوفرة.</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-500">هذا شرح لشكل المخرجات، وليس تقريراً أو بيانات حقيقية عن متجر محدد.</p>
          </div>
        </section>

        <section className="border-y border-white/[.06] bg-white/[.025]">
          <div className="mx-auto grid max-w-6xl gap-5 px-5 py-10 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-white/[.07] bg-[#0c1821] p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#38d7be]/10 text-[#63eed7]"><Icon size={20} /></div>
                <h2 className="mt-5 text-lg font-black">{title}</h2>
                <p className="mt-3 text-sm leading-8 text-slate-400">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#73ebd5]"><Zap size={16} /> OFFER / PILOT</div>
            <h2 className="mt-4 text-3xl font-black leading-snug sm:text-4xl">أول خطوة صغيرة.<br />قرار أوضح.</h2>
            <p className="mt-5 max-w-lg text-sm leading-8 text-slate-400">بدل اشتراك كبير من أول يوم، منبدأ مع متجر واحد بتجربة محدّدة لنثبت إذا تحليل المنافسة فعلاً مفيد إلك.</p>
            <div className="mt-7 space-y-4">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#46d5bf]/25 bg-[#46d5bf]/[.05] text-sm font-bold text-[#64ead6]">{step.number}</span>
                  <div><h3 className="text-sm font-black">{step.title}</h3><p className="mt-1 text-sm leading-7 text-slate-400">{step.description}</p></div>
                </div>
              ))}
            </div>
          </div>
          <div className="self-start rounded-[28px] border border-[#3bcfb5]/40 bg-[linear-gradient(165deg,rgba(40,150,133,.12),rgba(11,25,33,.95)_45%)] p-7 sm:p-9">
            <div className="flex items-center justify-between"><span className="text-xs font-extrabold text-[#86f1de]">تجربة تجارية أولى</span><BadgeCheck size={22} className="text-[#6fe4d1]" /></div>
            <div className="mt-5 flex items-end gap-2"><strong className="text-6xl font-black tracking-tight text-white">$99</strong><span className="pb-2 text-sm text-slate-400">للتجربة الأولى</span></div>
            <p className="mt-4 text-sm leading-7 text-slate-300">تحليل تنافسي أولي لمتجرك، مراجعة المنافسين الملائمين، وإيجاز بالقرارات المقترحة والأدلة والقيود.</p>
            <div className="my-7 h-px bg-white/10" />
            <div className="space-y-3 text-sm text-slate-200">
              {['تحديد المنافسين وفق ما تثبته المصادر','إشارات تجارية علنية قابلة للتوثيق','قرار أو اختبار مقترح واضح','مصادر وروابط مع عرض ما لا نعرفه','تأكيد النطاق وموعد التسليم قبل الدفع'].map((line) => <div key={line} className="flex items-start gap-3"><Check className="mt-1 shrink-0 text-[#6cebd5]" size={16}/><span>{line}</span></div>)}
            </div>
            <a href="#apply" className="mt-8 flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#41d9c0] px-5 py-3 text-sm font-black text-[#06241c] transition hover:bg-[#90ffe9]">اطلب عرض التجربة <ArrowLeft size={17}/></a>
            <p className="mt-4 text-center text-xs leading-6 text-slate-400">لا يُحصّل أي مبلغ عبر هذه الصفحة. الدفع بعد تأكيد النطاق والموافقة.</p>
          </div>
        </section>

        <section id="apply" className="scroll-mt-20 border-y border-white/[.07] bg-[#0b1720]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#79ebd7]"><Mail size={16}/> START HERE</div>
              <h2 className="mt-4 text-3xl font-black leading-snug">احكيلنا عن متجرك.</h2>
              <p className="mt-5 text-sm leading-8 text-slate-400">منحتاج بس رابط المتجر ومعلومة عن الشي اللي حابب تعرفه. ما منطلب وصول لحساباتك، ولا معلومات دفع.</p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="text-[#6aead5]" size={17}/> شفافين من أولها</div><p className="mt-2 text-xs leading-7 text-slate-400">إرسال هالطلب بيفتح رسالة بريد جاهزة عندك. لازم تضغط «إرسال» بتطبيق البريد حتى يوصل الطلب. ما في جمع بيانات مخفي أو دفعة تلقائية.</p></div>
            </div>
            <form onSubmit={sendRequest} className="space-y-5 rounded-[26px] border border-white/10 bg-[#101e28] p-6 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-200">اسمك أو اسم المتجر
                  <input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثلاً: متجر نور" autoComplete="organization" className="mt-2 block w-full rounded-xl border border-white/15 bg-[#07121a] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#4bdcc6]" />
                </label>
                <label className="block text-sm font-semibold text-slate-200">البريد الإلكتروني
                  <input required type="email" maxLength={180} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@store.com" autoComplete="email" dir="ltr" className="mt-2 block w-full rounded-xl border border-white/15 bg-[#07121a] px-4 py-3 text-left text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#4bdcc6]" />
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-200">رابط متجرك
                <input required type="url" maxLength={500} value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://yourstore.com" dir="ltr" className="mt-2 block w-full rounded-xl border border-white/15 bg-[#07121a] px-4 py-3 text-left text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#4bdcc6]" />
              </label>
              <label className="block text-sm font-semibold text-slate-200">شو أهم شي بدك تعرفه؟
                <select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/15 bg-[#07121a] px-4 py-3 text-sm text-white outline-none focus:border-[#4bdcc6]">
                  <option>المنافسون والأسعار</option>
                  <option>العروض والتغييرات الجديدة</option>
                  <option>كيف ميّز متجري عن المنافسين؟</option>
                  <option>شو القرار التجاري الأهم هلأ؟</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-3 text-xs leading-7 text-slate-300"><input type="checkbox" required checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-2 accent-[#43dfc5]" /><span>أوافق على إرسال المعلومات التي كتبتها إلى COANTO من خلال بريدي للحصول على رد بخصوص التجربة. أفهم أن الطلب غير ملزم بالشراء.</span></label>
              <button type="submit" className="flex w-full min-h-13 items-center justify-center gap-3 rounded-xl bg-[#43dec4] px-5 py-4 text-sm font-black text-[#06221c] transition hover:bg-[#8cffe6]">جهّز رسالة طلب التجربة <ArrowUpLeft size={17}/></button>
              {mailOpened && <p role="status" className="rounded-xl border border-[#55dec9]/25 bg-[#55dec9]/[.08] p-4 text-xs leading-7 text-[#b2ffed]">انفتحت رسالة البريد إذا جهازك بيدعم الروابط البريدية. اضغط «إرسال» داخل تطبيق البريد حتى يصل طلبك. إذا ما انفتحت، راسلنا على <a href="mailto:coantoai@gmail.com" className="font-bold underline" dir="ltr">coantoai@gmail.com</a>.</p>}
              <p className="text-center text-xs leading-6 text-slate-500">أو ابعث مباشرة إلى <a className="text-[#7fe9d6] underline" href="mailto:coantoai@gmail.com">coantoai@gmail.com</a></p>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <div className="flex items-center gap-2 text-xs font-bold text-[#73ddca]"><CircleHelp size={16}/> الأسئلة الأساسية</div>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">قبل ما تقرّر.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {questions.map(({ q, a }) => <div key={q} className="rounded-2xl border border-white/[.08] bg-[#0e1b24] p-6"><h3 className="text-sm font-black">{q}</h3><p className="mt-3 text-xs leading-7 text-slate-400">{a}</p></div>)}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[.08] bg-[#071018]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-slate-400">
          <span><strong className="ml-2 text-[#86e9d7]">COANTO</strong> من الدليل إلى القرار.</span>
          <div className="flex flex-wrap items-center gap-5"><a href="/demo" className="hover:text-white">مثال توضيحي</a><a href="/auth" className="hover:text-white">دخول المنصة</a><a href="mailto:coantoai@gmail.com" className="hover:text-white">تواصل معنا</a></div>
        </div>
      </footer>
    </div>
  );
}
