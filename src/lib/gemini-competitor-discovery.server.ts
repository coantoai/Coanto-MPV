import { fetchSite, hostname, normalizeUrl, searchEvidenceForUrl, type SiteSnapshot } from './analyze.server';

type JsonRecord = Record<string, unknown>;
export type GeminiDiscoveryResult = { snapshots: SiteSnapshot[]; candidateCount: number; searchQueries: number; status: 'ok' | 'missing-key' | 'provider-error' | 'empty' };
function record(value: unknown): JsonRecord { return value && typeof value === 'object' ? value as JsonRecord : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function parseJson(text: string) { const cleaned=text.replace(/^\uFEFF/,'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim(); const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}'); if(start<0||end<=start)return {} as JsonRecord; try{return record(JSON.parse(cleaned.slice(start,end+1)));}catch{return {} as JsonRecord;} }
function candidateUrls(data: JsonRecord, ownHost: string) { const urls:string[]=[]; for(const item of array(data['competitors'])) { const url=stringValue(record(item)['url']).trim(); if(!url)continue; try { const normalized=normalizeUrl(url),host=hostname(normalized); if(!host||host===ownHost||host.endsWith(`.${ownHost}`))continue; if(!urls.some((existing)=>hostname(existing)===host))urls.push(normalized); } catch {} } return urls.slice(0,6); }

function interactionText(data: JsonRecord) {
  const direct=stringValue(data['output_text']); if(direct)return direct;
  const texts:string[]=[];
  const collect=(item:unknown)=>{
    const obj=record(item);
    const ownText=stringValue(obj['text']); if(ownText)texts.push(ownText);
    for(const block of array(obj['content'])) { const b=record(block); const text=stringValue(b['text']); if(text)texts.push(text); }
  };
  for(const output of array(data['outputs'])) collect(output);
  for(const step of array(data['steps'])) collect(step);
  return texts.join('\n');
}
function interactionSearchCount(data: JsonRecord) {
  return [...array(data['outputs']),...array(data['steps'])].filter((item)=>{
    const type=stringValue(record(item)['type']); return type==='google_search_call'||type==='google_search';
  }).length;
}

// Testing mode: one inexpensive model only. Do not silently fall back to Pro models
// and consume prepaid credit when a request fails.
function discoveryModel() {
  return process.env['GEMINI_DISCOVERY_MODEL']?.trim() || 'gemini-3.1-flash-lite';
}
async function callGemini(apiKey:string,model:string,prompt:string,signal:AbortSignal) {
  return fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({
    model,input:prompt,tools:[{type:'google_search'}],store:false,
    response_format:{type:'text',mime_type:'application/json',schema:{type:'object',properties:{competitors:{type:'array',items:{type:'object',properties:{name:{type:'string'},url:{type:'string'},reason:{type:'string'}},required:['name','url']}}},required:['competitors']}}
  })});
}

export async function discoverCompetitorsWithGemini(main: SiteSnapshot): Promise<GeminiDiscoveryResult> {
  const apiKey=process.env['GEMINI_API_KEY']?.trim(); if(!apiKey)return { snapshots:[],candidateCount:0,searchQueries:0,status:'missing-key' };
  const ownHost=hostname(main.url); const context=[main.title,main.description,...main.h1,...main.h2,main.text.slice(0,4000)].filter(Boolean).join('\n').slice(0,6000);
  const prompt=`Search Google for direct commercial competitors of ${main.url}. Use the target-site context to understand the business. Return up to 6 real direct competitors supported by public evidence. Each URL must be the company's official website. Exclude articles, directories, comparison sites, social profiles and marketplaces. Never invent a company or URL.\n\nTarget-site context:\n${context}`;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),45_000);
  try {
    const model=discoveryModel();
    const response=await callGemini(apiKey,model,prompt,controller.signal);
    if(!response.ok){const detail=(await response.text()).slice(0,500);console.error('Gemini competitor discovery failed',{model,status:response.status,detail});return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};}
    const raw=record(await response.json());
    const text=interactionText(raw); const urls=candidateUrls(parseJson(text),ownHost); const snapshots:SiteSnapshot[]=[];
    // Verify only the small grounded shortlist to keep each demo run predictable.
    for(const url of urls){try{snapshots.push(await fetchSite(url));}catch{try{const indexed=await searchEvidenceForUrl(url);if(indexed)snapshots.push(indexed);}catch{}}}
    const result:GeminiDiscoveryResult={snapshots,candidateCount:urls.length,searchQueries:interactionSearchCount(raw),status:urls.length?'ok':'empty'};
    console.info('Gemini competitor discovery',{model,interactionStatus:stringValue(raw['status']),status:result.status,candidates:result.candidateCount,verifiedSnapshots:snapshots.length,searchQueries:result.searchQueries,outputChars:text.length});
    return result;
  } catch(error){console.error('Gemini competitor discovery unavailable',{error});return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};} finally{clearTimeout(timer);}
}
