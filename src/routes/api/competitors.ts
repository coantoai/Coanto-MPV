import { createFileRoute } from '@tanstack/react-router';
import { authenticateRequest } from '@/lib/auth.server';
import { listDiscoveredCompetitors, runCompetitorDiscovery } from '@/lib/competitor-discovery.server';
import { apiSecurityHeaders, guardSameOriginMutation } from '@/lib/http-security.server';

function json(request:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:apiSecurityHeaders(request,{'content-type':'application/json; charset=utf-8'})})}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route=createFileRoute('/api/competitors')({server:{handlers:{
  GET:async({request})=>{const principal=await authenticateRequest(request);if(!principal)return json(request,{error:'Authentication required.'},401);try{return json(request,{competitors:await listDiscoveredCompetitors(principal.userId)});}catch(error){console.error('Competitor list failed',error);return json(request,{error:'تعذّر تحميل المنافسين.'},500);}},
  POST:async({request})=>{const mutation=guardSameOriginMutation(request);if(!mutation.ok)return json(request,{error:'Cross-site request rejected.'},mutation.status);const principal=await authenticateRequest(request);if(!principal)return json(request,{error:'Authentication required.'},401);try{return json(request,{competitors:await runCompetitorDiscovery(principal.userId)});}catch(error){const message=error instanceof Error?error.message:'';if(message==='ONBOARDING_REQUIRED')return json(request,{error:'أكمل إعداد نشاطك أولاً.',code:'ONBOARDING_REQUIRED'},409);if(message==='NO_VERIFIED_COMPETITORS')return json(request,{error:'لم نجد منافسين تجاريين موثوقين بما يكفي بعد. لم يتم اختراع نتائج.',code:'NO_VERIFIED_COMPETITORS'},422);console.error('Competitor discovery failed',error);return json(request,{error:'تعذّر تشغيل اكتشاف المنافسين حالياً.'},500);}}
}}});