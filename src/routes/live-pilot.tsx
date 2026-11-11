import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

type ProviderName = 'gemini' | 'exa' | 'public-search';
type Competitor = {
  name:string;url:string;score:number;reason:string;description:string;
  sourceType:string;evidence:string[];sources:string[];providers:ProviderName[];
  relationship:'direct'|'adjacent'|'unverified';evidenceQuality:string;
  sharedProducts:string[];sharedAttributes:string[];confidence:'high'|'medium'|'low';
};
type Result = {
  target:{url:string;title:string;description:string};
  providerStatus:string;providerCounts:Record<ProviderName,number>;
  candidateCount:number;acceptedCount:number;verifiedCount:number;
  competitors:Competitor[];checkedAt:string;cacheHit?:boolean;error?:string;
};
const relationLabel = {direct:'تشابه مباشر في المنتجات',adjacent:'منافسة جزئية / قريبة',unverified:'مرشح يحتاج تحققاً إضافياً'};
const confidenceLabel = {high:'أدلة أقوى',medium:'أدلة متوسطة',low:'أدلة أولية'};
const providerLabel = {gemini:'Gemini',exa:'Exa','public-search':'البحث العام (Brave عند توفره)'};
const surface={padding:20,background:'#11222b',borderRadius:16,margin:'16px 0',border:'1px solid #294650'};
function Pilot(){
 const [busy,setBusy]=useState(false),[data,setData]=useState<Result|null>(null),[error,setError]=useState('');
 async function run(){
  setBusy(true);setError('');setData(null);
  try {
   const r=await fetch('/api/public-discovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.allbirds.com'})});
   const json=await r.json() as Result;
   if(!r.ok)throw new Error(json.error||'Live analysis failed');
   setData(json);
  } catch(e){setError(e instanceof Error?e.message:'Failed');}
  finally{setBusy(false);}
 }
 return <main dir="rtl" style={{minHeight:'100vh',background:'#071019',color:'#e6f5f5',fontFamily:'system-ui',padding:'24px',lineHeight:1.75}}>
  <div style={{maxWidth:900,margin:'auto'}}>
   <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #26414b',paddingBottom:20,gap:15}}>
    <b style={{fontSize:25,color:'#36e2c9'}}>COANTO</b><span style={{fontSize:12,letterSpacing:1}}>LIVE EVIDENCE PILOT · V2</span>
   </header>
   <h1 style={{fontSize:26}}>اكتشاف المنافسين — مع أدلة قابلة للمراجعة</h1>
   <p style={{color:'#adbec5'}}>نسخة اختبار منفصلة. درجة الصلة تقيس التشابه، وليست نسبة تأكد أو حصة سوقية.</p>
   <label htmlFor="target">موقع الاختبار</label>
   <input id="target" value="https://www.allbirds.com" readOnly style={{display:'block',width:'100%',boxSizing:'border-box',margin:'10px 0',padding:15,borderRadius:12,border:'1px solid #456',background:'#11222b',color:'white',direction:'ltr'}}/>
   <button onClick={run} disabled={busy} style={{padding:'14px 28px',background:'#36e2c9',color:'#05221e',border:0,borderRadius:12,fontWeight:800,cursor:busy?'wait':'pointer'}}>{busy?'جاري البحث والتحقق...':'ابدأ الاختبار الحقيقي'}</button>
   {error&&<p role="alert" style={{color:'#ff9c9c'}}>فشل الاختبار: {error}</p>}
   {data&&<section aria-live="polite">
    <h2 style={{marginBottom:4}}>{data.target.title||data.target.url}</h2>
    <p style={{color:'#adbec5'}}>{data.target.description}</p>
    <div style={{...surface,display:'flex',gap:28,flexWrap:'wrap'}}>
     <div><strong style={{fontSize:25,color:'#36e2c9'}}>{data.candidateCount}</strong><div>مرشحون فريدون</div></div>
     <div><strong style={{fontSize:25,color:'#36e2c9'}}>{data.acceptedCount}</strong><div>اجتازوا فلتر الصلة</div></div>
     <div><strong style={{fontSize:25,color:'#36e2c9'}}>{data.verifiedCount}</strong><div>تمت قراءة مواقعهم مباشرةً</div></div>
    </div>
    <p style={{fontSize:13,color:'#9db6bc'}}>آخر جمع أدلة: {new Date(data.checkedAt).toLocaleString('ar-LB')} {data.cacheHit?'· نتائج محفوظة لتخفيف التكلفة':''}</p>
    <details style={{padding:14,border:'1px solid #294650',borderRadius:12}}>
     <summary style={{cursor:'pointer'}}>مصادر البحث وحالة الاتصال</summary>
     <p dir="ltr" style={{textAlign:'right',overflowWrap:'anywhere'}}>{data.providerStatus}</p>
     {(Object.keys(providerLabel) as ProviderName[]).map(p=><p key={p}>{providerLabel[p]}: {data.providerCounts[p]} مرشحاً قبل دمج المصادر</p>)}
    </details>
    {data.competitors.length===0?<p>لا توجد حالياً نتائج اجتازت الفلتر. لم تُختلق بيانات.</p>:data.competitors.map(c=><article key={c.url} style={surface}>
     <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:'start'}}>
      <h3 style={{margin:0,fontSize:18}}>{c.name}</h3>
      <strong style={{color:'#36e2c9'}}>{c.score}/100 <span style={{fontWeight:400,fontSize:12}}>درجة تشابه</span></strong>
     </div>
     <p style={{margin:'4px 0',color:'#c5d8dc'}}>{relationLabel[c.relationship]} · {confidenceLabel[c.confidence]}</p>
     <p style={{fontSize:13,color:'#a9bfc6'}}>{c.evidenceQuality==='verified-site'?'تمت قراءة محتوى الموقع مباشرة':'المعلومات مفهرسة فقط؛ الموقع لم يُفحص مباشرة'}</p>
     {c.sharedProducts.length>0?<p><b>المنتجات المشتركة:</b> {c.sharedProducts.join('، ')}</p>:<p style={{color:'#eabf7b'}}>لم يثبت تطابق منتج محدد؛ الصلة قطاعية أو جزئية.</p>}
     {c.sharedAttributes.length>0&&<p><b>صفات مشتركة:</b> {c.sharedAttributes.join('، ')}</p>}
     <p>{c.description}</p>
     <p style={{fontSize:13,color:'#9db6bc'}}>مصادر الاكتشاف: {c.providers.map(p=>providerLabel[p]).join('، ')}</p>
     <a href={c.url} target="_blank" rel="noreferrer" style={{color:'#36e2c9'}}>فتح الموقع المرصود</a>
     <details style={{marginTop:12}}>
      <summary style={{cursor:'pointer'}}>فحص الأدلة والمصادر ({c.evidence.length})</summary>
      <p style={{fontSize:13,color:'#c2d8d9'}}>{c.reason}</p>
      {c.sources.map(source=><p key={source} style={{overflowWrap:'anywhere'}}><a href={source} target="_blank" rel="noreferrer" style={{color:'#36e2c9',fontSize:13}}>{source}</a></p>)}
      {c.evidence.map((entry,i)=><p key={i} style={{fontSize:13,overflowWrap:'anywhere'}}>{entry}</p>)}
     </details>
    </article>)}
   </section>}
   <footer style={{marginTop:50,color:'#91a6ac',fontSize:13}}>النتائج إشارات للمراجعة وليست حكماً نهائياً على السوق أو على المنافسة. النسخة محدودة حالياً بموقع Allbirds.</footer>
  </div>
 </main>;
}
export const Route=createFileRoute('/live-pilot')({component:Pilot});
