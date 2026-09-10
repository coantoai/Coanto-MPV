import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@/lib/auth.server';
import { listDiscoveredCompetitors, runCompetitorDiscovery } from '@/lib/competitor-discovery.server';

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route=createFileRoute('/api/competitors')({server:{handlers:{
  GET:async({request})=>{const principal=await authenticateRequest(request);if(!principal)return json({error:'Authentication required.'},401);try{return json({competitors:await listDiscoveredCompetitors(principal.userId)});}catch(error){console.error('Competitor list failed',error);return json({error:'تعذّر تحميل المنافسين.'},500);}},
  POST:async({request})=>{const principal=await authenticateRequest(request);if(!principal)return json({error:'Authentication required.'},401);try{return json({competitors:await runCompetitorDiscovery(principal.userId)});}catch(error){const message=error instanceof Error?error.message:'';if(message==='ONBOARDING_REQUIRED')return json({error:'أكمل إعداد نشاطك أولاً.',code:'ONBOARDING_REQUIRED'},409);if(message==='NO_VERIFIED_COMPETITORS')return json({error:'لم نجد منافسين تجاريين موثوقين بما يكفي بعد. لم يتم اختراع نتائج.',code:'NO_VERIFIED_COMPETITORS'},422);console.error('Competitor discovery failed',error);return json({error:'تعذّر تشغيل اكتشاف المنافسين حالياً.'},500);}}
}}});
