import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { getBillingOverview } from '@/lib/billing.functions';
import type { BillingPlan, BillingPlanKey, BillingStatus } from '@/lib/billing-policy.server';

// @ts-expect-error TanStack route types are generated separately.
export const Route=createFileRoute('/billing')({component:BillingPage});

type BillingView={
  account:{planKey:BillingPlanKey;status:BillingStatus;provider:string|null;currentPeriodEnd:string|null;cancelAtPeriodEnd:boolean;trialEndsAt:string|null};
  effectivePlan:BillingPlanKey;
  accessMode:'trial'|'free'|'paid';
  paymentAttentionRequired:boolean;
  plan:BillingPlan;
  catalog:BillingPlan[];
  gatewayConfigured:boolean;
};

const statusLabel=(status:BillingStatus)=>status==='trialing'?'تجربة':status==='active'?'نشط':status==='past_due'?'الدفع يحتاج متابعة':status==='paused'?'موقوف مؤقتاً':status==='canceled'?'ملغى':'منتهي';

function BillingPage(){
  const [data,setData]=useState<BillingView|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{void (async()=>{try{setData(await getBillingOverview({}) as BillingView)}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل حالة الاشتراك.')}finally{setLoading(false)}})()},[]);
  return <div dir="rtl" className="min-h-screen bg-[#070b11] text-[#f4f7fb]"><header className="border-b border-white/[.07] bg-[#080d15]"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><a href="/" className="font-black tracking-[4px] text-[#25cdb8]">COANTO</a><a href="/pricing" className="text-xs text-slate-400">الخطط</a></div></header><main className="mx-auto max-w-5xl space-y-5 px-5 py-8"><div><div className="flex items-center gap-2 text-[#25cdb8]"><CreditCard size={18}/><span className="text-xs font-black tracking-[2px]">BILLING</span></div><h1 className="mt-3 text-3xl font-black">الاشتراك والفوترة</h1><p className="mt-2 text-sm text-slate-500">حالة اشتراك COANTO مستقلة عن شركة الدفع، لذلك يمكن تبديل بوابة الدفع لاحقاً بدون تغيير حسابك أو بياناتك.</p></div>{loading&&<div className="rounded-2xl border border-white/10 bg-[#0b121b] p-6 text-sm text-slate-500">جاري تحميل حالة الاشتراك…</div>}{error&&<div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-5 text-sm text-red-200">{error}</div>}{data&&<><section className="grid gap-4 md:grid-cols-3"><Card label="الخطة الحالية" value={data.plan.name}/><Card label="الحالة" value={statusLabel(data.account.status)}/><Card label="مزود الدفع" value={data.gatewayConfigured?(data.account.provider??'متصل'):'غير مفعّل بعد'}/></section><section className="rounded-3xl border border-white/10 bg-[#0b121b] p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Sparkles size={18} className="text-[#25cdb8]"/><h2 className="font-black">{data.plan.name}</h2></div><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">{data.plan.description}</p></div><span className="rounded-full bg-[#25cdb8]/10 px-3 py-2 text-xs font-bold text-[#25cdb8]">{data.accessMode==='paid'?'مدفوع':data.accessMode==='trial'?'تجربة':'مجاني'}</span></div>{data.paymentAttentionRequired&&<div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">الاشتراك ما زال معروفاً للنظام، لكن حالة الدفع تحتاج متابعة قبل التجديد التالي.</div>}{data.account.currentPeriodEnd&&<div className="mt-4 text-xs text-slate-500">نهاية الفترة الحالية: {new Date(data.account.currentPeriodEnd).toLocaleString('ar-LB')}</div>}<a href="/pricing" className="mt-5 inline-block rounded-xl border border-[#25cdb8]/30 px-4 py-3 text-xs font-black text-[#25cdb8]">عرض الخطط</a></section><section className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0b121b] p-5 text-xs leading-6 text-slate-400"><ShieldCheck size={18} className="mt-1 shrink-0 text-[#25cdb8]"/><div><b className="text-slate-200">لا توجد عملية دفع وهمية.</b> حتى يتم اختيار وربط مزود دفع مناسب فعلياً، لن تعرض COANTO زر Checkout مزيفاً ولن تعتبر أي مستخدم مدفوعاً بدون حدث دفع موثق.</div></section></>}</main></div>
}
function Card({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/10 bg-[#0b121b] p-5"><div className="text-xs text-slate-600">{label}</div><div className="mt-2 text-xl font-black">{value}</div></div>}
