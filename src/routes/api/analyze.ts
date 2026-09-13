import { createFileRoute } from '@tanstack/react-router';
import { discoverCompetitors, buildPrompt, getMainSnapshot, hostname, normalizeUrl, parseJsonBlock, validateTargetUrl, type AnalyzeInput, type SiteSnapshot } from '@/lib/analyze.server';
import { runResearchAnalysis } from '@/lib/ai-engine.server';
import { discoverCompetitorsWithGemini } from '@/lib/gemini-competitor-discovery.server';
import { validateAiOutput } from '@/lib/ai-output.server';
import { enforceEvidence } from '@/lib/trust.server';
import { filterCommercialCompetitors } from '@/lib/competitor-filter.server';
import { saveAnalysis } from '@/lib/analysis-persistence.server';
import { businessContextForPrompt, getBusinessContext } from '@/lib/business-context.server';
import { buildAnalysisEvidenceLedger } from '@/lib/evidence-ledger.server';
import { createInsForgeEvidenceStore } from '@/lib/insforge-persistence.server';
import { apiSecurityHeaders, contentLengthTooLarge, guardSameOriginMutation, requestId, utf8TooLarge } from '@/lib/http-security.server';
import { analysisInputHash } from '@/lib/cost-policy.server';
import { completeAnalysisOperation, failAnalysisOperation, reserveAnalysisOperation } from '@/lib/operation-guard.server';

const MAX_REQUEST_BYTES=64_000,MAX_URL_LENGTH=2_048,MAX_COMPETITOR_LENGTH=500;
function json(request:Request,traceId:string,body:unknown,status=200,extraHeaders:HeadersInit={}){return new Response(JSON.stringify(body),{status,headers:apiSecurityHeaders(request,{'content-type':'application/json; charset=utf-8','x-request-id':traceId,...extraHeaders})});}
function cachedAnalysis(result:Record<string,unknown>,traceId:string,runId:string,cacheExpiresAt:string){const cloned=structuredClone(result);const metadata=cloned['metadata']&&typeof cloned['metadata']==='object'&&!Array.isArray(cloned['metadata'])?{...(cloned['metadata'] as Record<string,unknown>)}:{};Object.assign(metadata,{requestId:traceId,cacheHit:true,cachedRunId:runId,cacheExpiresAt});cloned['metadata']=metadata;return cloned;}
function discoveryError(status:string,candidates:number,snapshots:number,accepted:number){if(status==='missing-key')return {code:'DISCOVERY_NO_KEY',stage:'gemini-key'};if(status==='provider-error')return {code:'DISCOVERY_PROVIDER_ERROR',stage:'gemini-request'};if(status==='empty'||candidates===0)return {code:'DISCOVERY_EMPTY',stage:'gemini-output'};if(snapshots===0)return {code:'DISCOVERY_URL_VERIFY_FAILED',stage:'competitor-sites'};if(accepted===0)return {code:'DISCOVERY_FILTER_REJECTED',stage:'competitor-filter'};return {code:'NO_VERIFIED_COMPETITORS',stage:'unknown'};}
function discoveryMessage(code:string){if(code==='DISCOVERY_NO_KEY')return 'مفتاح Gemini غير متاح لمحرك الاكتشاف.';if(code==='DISCOVERY_PROVIDER_ERROR')return 'تعذّر اتصال COANTO بمحرك Gemini / Google Search.';if(code==='DISCOVERY_EMPTY')return 'تم تشغيل البحث، لكن لم يرجع منافسين موثوقين بما يكفي.';if(code==='DISCOVERY_URL_VERIFY_FAILED')return 'وجدنا مرشحين، لكن تعذّر تثبيت أدلة عامة كافية على مواقعهم.';if(code==='DISCOVERY_FILTER_REJECTED')return 'وجدنا مرشحين، لكن بوابة التحقق رفضتهم لأن الصلة أو الدليل غير كافيين.';return 'لم نتمكن من التحقق من منافسين مناسبين لهذا الموقع حتى الآن. لم يتم اختراع نتائج.';}
function mergeSnapshots(...groups:SiteSnapshot[][]){const byHost=new Map<string,SiteSnapshot>();for(const site of groups.flat()){const host=hostname(site.url);if(!host)continue;const existing=byHost.get(host);if(!existing||existing.sourceType==='search-index'&&site.sourceType==='direct-site')byHost.set(host,site);}return[...byHost.values()];}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route=createFileRoute('/api/analyze')({server:{handlers:{POST:async({request})=>{
  const traceId=requestId(request);let activeRun:{userId:string;runId:string}|null=null;
  const failRun=async(code:string)=>{if(!activeRun)return;try{await failAnalysisOperation(activeRun.userId,activeRun.runId,code);}catch(error){console.error('Analysis failure ledger write failed',{traceId,error});}activeRun=null;};
  try{
    const mutation=guardSameOriginMutation(request);if(!mutation.ok)return json(request,traceId,{error:'Cross-site request rejected.'},mutation.status);
    if(contentLengthTooLarge(request,MAX_REQUEST_BYTES))return json(request,traceId,{error:'حجم الطلب كبير جدًا.'},413);
    const rawBody=await request.text();if(utf8TooLarge(rawBody,MAX_REQUEST_BYTES))return json(request,traceId,{error:'حجم الطلب كبير جدًا.'},413);
    let body:Partial<AnalyzeInput>;try{body=JSON.parse(rawBody) as Partial<AnalyzeInput>;}catch{return json(request,traceId,{error:'بيانات الطلب غير صالحة.'},400);}
    const{getUserIdFromRequest}=await import('@/lib/auth.server');const userId=await getUserIdFromRequest(request);if(!userId)return json(request,traceId,{error:'يجب تسجيل الدخول لتشغيل التحليل.'},401);
    const businessContext=await getBusinessContext(userId);if(!businessContext)return json(request,traceId,{error:'أكمل إعداد نشاطك أولًا.',code:'ONBOARDING_REQUIRED'},409);
    const rawStoreUrl=typeof body.storeUrl==='string'&&body.storeUrl.trim()?body.storeUrl.trim():businessContext.websiteUrl;if(rawStoreUrl.length>MAX_URL_LENGTH)return json(request,traceId,{error:'رابط الموقع طويل جدًا.'},400);
    const competitors=Array.isArray(body.competitors)?body.competitors.filter((item):item is string=>typeof item==='string').map(item=>item.trim()).filter(item=>item.length>0&&item.length<=MAX_COMPETITOR_LENGTH).slice(0,10):[];
    const urlValidation=validateTargetUrl(rawStoreUrl);if(!urlValidation.ok||!urlValidation.url)return json(request,traceId,{error:urlValidation.reason},400);
    const normalizedStoreUrl=normalizeUrl(urlValidation.url),inputHash=analysisInputHash({storeUrl:normalizedStoreUrl,competitors,businessContextUpdatedAt:businessContext.updatedAt});
    let reservation;try{reservation=await reserveAnalysisOperation({userId,inputHash});}catch(error){console.error('Analysis performance guard failed',{traceId,error});return json(request,traceId,{error:'تعذّر حجز تشغيل التحليل بأمان. حاول مرة أخرى.'},503,{'retry-after':'30'});}
    if(reservation.kind==='cached')return json(request,traceId,cachedAnalysis(reservation.result,traceId,reservation.runId,reservation.cacheExpiresAt));
    if(reservation.kind==='in-progress')return json(request,traceId,{error:`هذا التحليل قيد التشغيل بالفعل. حاول بعد ${reservation.retryAfterSeconds} ثانية.`,code:'ANALYSIS_IN_PROGRESS',retryAfterSeconds:reservation.retryAfterSeconds},409,{'retry-after':String(reservation.retryAfterSeconds)});
    if(reservation.kind==='burst-limited')return json(request,traceId,{error:'تم الوصول إلى حد التحليلات اللحظي. حاول بعد قليل.',code:'ANALYSIS_BURST_LIMIT'},429,{'retry-after':String(reservation.retryAfterSeconds)});
    if(reservation.kind==='daily-limited')return json(request,traceId,{error:'تم الوصول إلى ميزانية التحليل اليومية لهذا الحساب.',code:'ANALYSIS_DAILY_LIMIT'},429,{'retry-after':String(reservation.retryAfterSeconds)});
    activeRun={userId,runId:reservation.runId};
    let main;try{main=await getMainSnapshot(normalizedStoreUrl);}catch{await failRun('EVIDENCE_COLLECTION_FAILED');return json(request,traceId,{error:'تعذّر جمع أدلة عامة عن الموقع.',code:'EVIDENCE_COLLECTION_FAILED',stage:'target-site'},422);}

    let discovered:SiteSnapshot[]=[];let commercialCompetitors:SiteSnapshot[]=[];let discoveryMethod='gemini-google-search';
    const grounded=await discoverCompetitorsWithGemini(main);const geminiSnapshots=grounded.snapshots.length;const geminiDiscovery={candidateCount:grounded.candidateCount,searchQueries:grounded.searchQueries,status:grounded.status};
    discovered=mergeSnapshots(discovered,grounded.snapshots);commercialCompetitors=filterCommercialCompetitors(main,discovered,competitors);
    console.info('Gemini competitor verification',{traceId,geminiCandidates:grounded.candidateCount,geminiSnapshots,accepted:commercialCompetitors.length,status:grounded.status});
    if(!commercialCompetitors.length){const legacy=await discoverCompetitors(main,competitors);discovered=mergeSnapshots(discovered,legacy);commercialCompetitors=filterCommercialCompetitors(main,discovered,competitors);discoveryMethod=grounded.snapshots.length?'gemini-google-search+legacy-fallback':'legacy-search-fallback';console.info('Legacy competitor fallback',{traceId,legacyCandidates:legacy.length,totalCandidates:discovered.length,accepted:commercialCompetitors.length});}
    if(!commercialCompetitors.length){const diagnostic=discoveryError(geminiDiscovery.status,geminiDiscovery.candidateCount,geminiSnapshots,commercialCompetitors.length);await failRun(diagnostic.code);return json(request,traceId,{error:discoveryMessage(diagnostic.code),...diagnostic,diagnostic:{geminiStatus:geminiDiscovery.status,candidates:geminiDiscovery.candidateCount,verifiedSites:geminiSnapshots,totalDiscovered:discovered.length}},422);}

    const prompt=`OWNER-PROVIDED BUSINESS CONTEXT (context only; verify market claims independently):\n${businessContextForPrompt(businessContext)}\n\n${buildPrompt(main,commercialCompetitors)}`;
    let ai;try{ai=await runResearchAnalysis(prompt);}catch(error){console.error('AI analysis failed',{traceId,error});await failRun('AI_PROVIDER_FAILED');return json(request,traceId,{error:'تعذّر تشغيل محرك التحليل حاليًا.',code:'AI_PROVIDER_FAILED',stage:'analysis-ai'},502);}
    let parsedAi:Record<string,unknown>;try{parsedAi=validateAiOutput(parseJsonBlock(ai.text));}catch(error){console.error('AI output contract failed',{traceId,error});await failRun('AI_CONTRACT_FAILED');return json(request,traceId,{error:'محرك التحليل أعاد نتيجة غير مكتملة. لم يتم عرض نتيجة غير موثوقة.',code:'AI_CONTRACT_FAILED',stage:'analysis-output'},502);}
    const analysis=enforceEvidence(parsedAi,main,commercialCompetitors,ai.sources);
    const sources=[main,...commercialCompetitors],directCount=sources.filter(s=>s.sourceType==='direct-site').length,indexedCount=sources.filter(s=>s.sourceType==='search-index').length;
    const metadata=(analysis['metadata']&&typeof analysis['metadata']==='object'?{...(analysis['metadata'] as Record<string,unknown>)}:{}) as Record<string,unknown>;const observedAt=new Date().toISOString();
    Object.assign(metadata,{requestId:traceId,analysisRunId:reservation.runId,cacheHit:false,cacheExpiresAt:reservation.cacheExpiresAt,storeUrl:normalizedStoreUrl,businessContextUpdatedAt:businessContext.updatedAt,analyzedAt:observedAt,aiProvider:ai.provider,aiModel:ai.model,aiWebSources:ai.sources.length,sourceCount:sources.length,directEvidenceSources:directCount,indexedEvidenceSources:indexedCount,discoveredCompetitors:discovered.length,commercialCompetitors:commercialCompetitors.length,competitorDiscoveryMethod:discoveryMethod,geminiDiscovery,freshness:'الآن',caveat:indexedCount?'بعض الأدلة جاءت من فهارس بحث عامة أو بحث Google الموثق لأن بعض المواقع تمنع الوصول الآلي. لم يتم تجاوز أي حماية؛ نوع الدليل ظاهر في النتيجة.':'المصادر المتاحة تمت قراءتها مباشرة.'});analysis['metadata']=metadata;
    try{const saved=await saveAnalysis({userId,storeUrl:normalizedStoreUrl,result:analysis});metadata['id']=saved.id;try{const ledger=buildAnalysisEvidenceLedger(main,commercialCompetitors,observedAt);await createInsForgeEvidenceStore().persistAnalysisEvidence({userId,analysisId:saved.id,entries:ledger});metadata['evidenceLedgerRecords']=ledger.length;metadata['evidenceLedgerPersisted']=true;}catch(error){console.error('Evidence ledger persistence failed',{traceId,error});metadata['evidenceLedgerPersisted']=false;}}catch(error){console.error('Analysis persistence failed',{traceId,error});metadata['saveError']='تعذّر حفظ التحليل في السجل.';}
    try{await completeAnalysisOperation(userId,reservation.runId,analysis);activeRun=null;}catch(error){console.error('Analysis cache completion failed',{traceId,error});}
    return json(request,traceId,analysis);
  }catch(error){await failRun('UNEXPECTED_ANALYSIS_FAILURE');console.error('Analysis request failed',{traceId,error});return json(request,traceId,{error:'حدث خطأ أثناء التحليل. حاول مرة أخرى.',code:'UNEXPECTED_ANALYSIS_FAILURE'},500);}
}}}});
