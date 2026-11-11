import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
type Competitor={name:string;url:string;score:number;reason:string;description:string;sourceType:string;evidence:string[]};
type Result={target:{url:string;title:string;description:string};providerStatus:string;candidateCount:number;verifiedCount:number;competitors:Competitor[];checkedAt:string;error?:string};
function Pilot(){
 const [busy,setBusy]=useState(false),[data,setData]=useState<Result|null>(null),[error,setError]=useState('');
 async function run(){setBusy(true);setError('');setData(null);try{const r=await fetch('/api/public-discovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.allbirds.com'})});const json=await r.json() as Result;if(!r.ok)throw new Error(json.error||'Live analysis failed');setData(json);}catch(e){setError(e instanceof Error?e.message:'Failed');}finally{setBusy(false)}}
 return <main dir="rtl" style={{minHeight:'100vh',background:'#071019',color:'#e6f5f5',fontFamily:'system-ui',padding:'24px'}}>
 <div style={{maxWidth:900,margin:'auto'}}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #26414b',paddingBottom:20}}><b style={{fontSize:25,color:'#36e2c9'}}>COANTO</b><span>LIVE EVIDENCE PILOT</span></header>
 <h1>اختبار اكتشاف المنافسين الحقيقيين</h1><p>نسخة منفصلة للاختبار. لا تعرض منافسين إلا بعد التحقق من أدلة عامة.</p>
 <label htmlFor="target">موقع الاختبار</label><input id="target" value="https://www.allbirds.com" readOnly style={{display:'block',width:'100%',boxSizing:'border-box',margin:'10px 0',padding:15,borderRadius:12,border:'1px solid #456',background:'#11222b',color:'white'}}/>
 <button onClick={run} disabled={busy} style={{padding:'14px 28px',background:'#36e2c9',color:'#05221e',border:0,borderRadius:12,fontWeight:800,cursor:busy?'wait':'pointer'}}>{busy?'جاري جمع الأدلة والتحقق...':'ابدأ الاختبار الحقيقي'}</button>
 {error&&<p role="alert" style={{color:'#ff9c9c'}}>فشل الاختبار: {error}</p>}
 {data&&<section aria-live="polite"><h2>{data.target.title||data.target.url}</h2><p>{data.target.description}</p><p>وقت التحقق: {data.checkedAt} | المرشحون: {data.candidateCount} | المقبولون: {data.verifiedCount}</p>
 {data.competitors.length===0?<p>لم نعثر على منافسين اجتازوا التحقق. لم تُختلق نتائج.</p>:data.competitors.map(c=><article key={c.url} style={{padding:20,background:'#11222b',borderRadius:16,margin:'16px 0',border:'1px solid #294650'}}><h3>{c.name}</h3><p>درجة الصلة: {c.score}/100</p><p>{c.reason}</p><p>{c.description}</p><a style={{color:'#36e2c9'}} href={c.url} target="_blank" rel="noreferrer">زيارة موقع المنافس</a><details><summary style={{cursor:'pointer',marginTop:14}}>الأدلة ({c.evidence.length})</summary>{c.evidence.map((e,i)=><p key={i} style={{overflowWrap:'anywhere'}}>{e}</p>)}</details></article>)}</section>}
 <footer style={{marginTop:50,color:'#91a6ac'}}>هذه تجربة محدودة بموقع Allbirds، وليست إطلاقاً تجارياً.</footer></div></main>;
}
export const Route=createFileRoute('/live-pilot')({component:Pilot});
