import { fetchSite, hostname, normalizeUrl, searchEvidenceForUrl, type SiteSnapshot } from './analyze.server';

type JsonRecord = Record<string, unknown>;
export type GeminiDiscoveryResult = { snapshots: SiteSnapshot[]; candidateCount: number; searchQueries: number; status: 'ok' | 'missing-key' | 'provider-error' | 'empty' };
function record(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function parseJson(text: string) { const cleaned=text.replace(/^\uFEFF/,'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim(); const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}'); if(start<0||end<=start)return {} as JsonRecord; try{return record(JSON.parse(cleaned.slice(start,end+1)));}catch{return {} as JsonRecord;} }
function candidateUrls(data: JsonRecord, ownHost: string) { const urls:string[]=[]; for(const item of array(data['competitors'])) { const url=stringValue(record(item)['url']).trim(); if(!url)continue; try { const normalized=normalizeUrl(url),host=hostname(normalized); if(!host||host===ownHost||host.endsWith(`.${ownHost}`))continue; if(!urls.some((existing)=>hostname(existing)===host))urls.push(normalized); } catch {} } return urls.slice(0,10); }
function interactionText(data: JsonRecord) { const direct=stringValue(data['output_text']); if(direct)return direct; const texts:string[]=[]; for(const step of array(data['steps'])) { const s=record(step); if(s['type']!=='model_output')continue; for(const block of array(s['content'])) { const text=stringValue(record(block)['text']); if(text)texts.push(text); } } return texts.join('\n'); }
function interactionSearchCount(data: JsonRecord) { return array(data['steps']).filter((step)=>record(step)['type']==='google_search_call').length; }

// Discovery intentionally has its own known-good Gemini 3 default. GEMINI_MODEL may be
// configured for the analysis engine to a legacy/retired model and must not break discovery.
function discoveryModels() {
  const configured=process.env['GEMINI_DISCOVERY_MODEL']?.trim();
  return [...new Set([configured,'gemini-3.8-flash','gemini-3.1-pro-preview'].filter((v):v is string=>Boolean(v)))];
}

async function callGemini(apiKey:string,model:string,prompt:string,signal:AbortSignal) {
  return fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({
    model,input:prompt,tools:[{type:'google_search'}],store:false,
    response_format:{type:'text',mime_type:'application/json',schema:{type:'object',properties:{competitors:{type:'array',items:{type:'object',properties:{name:{type:'string'},url:{type:'string'},reason:{type:'string'}},required:['name','url']}}},required:['competitors']}}
  })});
}

export async function discoverCompetitorsWithGemini(main: SiteSnapshot): Promise<GeminiDiscoveryResult> {
  const apiKey=process.env['GEMINI_API_KEY']?.trim(); if(!apiKey)return { snapshots:[],candidateCount:0,searchQueries:0,status:'missing-key' };
  const ownHost=hostname(main.url); const context=[main.title,main.description,...main.h1,...main.h2,main.text.slice(0,5500)].filter(Boolean).join('\n').slice(0,8000);
  const prompt=`Search Google for direct commercial competitors of ${main.url}. Understand the business from the observed target-site context. Return 5-8 real competitors when supported by public evidence. URL must be the competitor's official website. Exclude articles, directories, comparison sites, social profiles and marketplace listings. Never invent a company or URL.\n\nTarget-site context:\n${context}`;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),55_000);
  try {
    let raw:JsonRecord|null=null; let usedModel='';
    for(const model of discoveryModels()) {
      const response=await callGemini(apiKey,model,prompt,controller.signal);
      if(response.ok){raw=record(await response.json());usedModel=model;break;}
      const detail=(await response.text()).slice(0,500);
      console.error('Gemini competitor discovery model failed',{model,status:response.status,detail});
      if(response.status===401||response.status===403||response.status===429) break;
    }
    if(!raw)return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};
    const text=interactionText(raw); const urls=candidateUrls(parseJson(text),ownHost); const snapshots:SiteSnapshot[]=[];
    for(const url of urls){try{snapshots.push(await fetchSite(url));}catch{try{const indexed=await searchEvidenceForUrl(url);if(indexed)snapshots.push(indexed);}catch{}}}
    const result:GeminiDiscoveryResult={snapshots,candidateCount:urls.length,searchQueries:interactionSearchCount(raw),status:urls.length?'ok':'empty'};
    console.info('Gemini competitor discovery',{model:usedModel,status:result.status,candidates:result.candidateCount,verifiedSnapshots:snapshots.length,searchQueries:result.searchQueries,outputChars:text.length});
    return result;
  } catch(error){console.error('Gemini competitor discovery unavailable',{error});return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};} finally{clearTimeout(timer);}
}
