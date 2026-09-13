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

export async function discoverCompetitorsWithGemini(main: SiteSnapshot): Promise<GeminiDiscoveryResult> {
  const apiKey=process.env['GEMINI_API_KEY']?.trim(); if(!apiKey)return { snapshots:[],candidateCount:0,searchQueries:0,status:'missing-key' };
  const model=process.env['GEMINI_MODEL']?.trim()||'gemini-3.1-flash-lite'; const ownHost=hostname(main.url);
  const context=[main.title,main.description,...main.h1,...main.h2,main.text.slice(0,5500)].filter(Boolean).join('\n').slice(0,8000);
  const prompt=`Search Google and identify direct commercial competitors of ${main.url}. Use the target-site context below to understand its actual product category and customer. Return 5-8 real companies when evidence supports them. Each URL MUST be the company's official website, not an article, directory, social profile, marketplace listing, or search result. Do not invent a company or URL.\n\nTarget-site context:\n${context}`;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),45_000);
  try {
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({model,input:prompt,tools:[{type:'google_search'}],response_format:{type:'text',mime_type:'application/json',schema:{type:'object',properties:{competitors:{type:'array',items:{type:'object',properties:{name:{type:'string'},url:{type:'string'},reason:{type:'string'}},required:['name','url']}}},required:['competitors']}}})});
    if(!response.ok){console.error('Gemini competitor discovery failed',{status:response.status});return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};}
    const raw=record(await response.json()); const urls=candidateUrls(parseJson(interactionText(raw)),ownHost); const snapshots:SiteSnapshot[]=[];
    for(const url of urls){try{snapshots.push(await fetchSite(url));}catch{try{const indexed=await searchEvidenceForUrl(url);if(indexed)snapshots.push(indexed);}catch{}}}
    const result:GeminiDiscoveryResult={snapshots,candidateCount:urls.length,searchQueries:interactionSearchCount(raw),status:urls.length?'ok':'empty'};
    console.info('Gemini competitor discovery',{status:result.status,candidates:result.candidateCount,verifiedSnapshots:snapshots.length,searchQueries:result.searchQueries}); return result;
  } catch(error){console.error('Gemini competitor discovery unavailable',{error});return {snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'};} finally{clearTimeout(timer);}
}
