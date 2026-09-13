import { fetchSite, hostname, normalizeUrl, searchEvidenceForUrl, type SiteSnapshot } from './analyze.server';

type JsonRecord=Record<string,unknown>;
export type GeminiDiscoveryResult={snapshots:SiteSnapshot[];candidateCount:number;searchQueries:number;status:'ok'|'missing-key'|'provider-error'|'empty'};
function record(value:unknown):JsonRecord{return value&&typeof value==='object'?value as JsonRecord:{}}
function array(value:unknown):unknown[]{return Array.isArray(value)?value:[]}
function stringValue(value:unknown):string{return typeof value==='string'?value:''}
function parseJson(text:string){const cleaned=text.replace(/^\uFEFF/,'').replace(/^\s*```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim(),start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');if(start<0||end<=start)return{} as JsonRecord;try{return record(JSON.parse(cleaned.slice(start,end+1)))}catch{return{} as JsonRecord}}
function candidateUrls(data:JsonRecord,ownHost:string){const urls:string[]=[];for(const item of array(data['competitors'])){const url=stringValue(record(item)['url']).trim();if(!url)continue;try{const normalized=normalizeUrl(url),host=hostname(normalized);if(!host||host===ownHost||host.endsWith(`.${ownHost}`))continue;if(!urls.some(x=>hostname(x)===host))urls.push(normalized)}catch{}}return urls.slice(0,6)}
function responseText(data:JsonRecord){const texts:string[]=[];for(const candidate of array(data['candidates'])){const content=record(record(candidate)['content']);for(const part of array(content['parts'])){const text=stringValue(record(part)['text']);if(text)texts.push(text)}}return texts.join('\n').trim()}
function searchCount(data:JsonRecord){let count=0;for(const candidate of array(data['candidates'])){const metadata=record(record(candidate)['groundingMetadata']);const queries=array(metadata['webSearchQueries']);count+=queries.length}return count}
function discoveryModel(){return process.env['GEMINI_DISCOVERY_MODEL']?.trim()||'gemini-3.1-flash-lite'}
const schema={type:'OBJECT',properties:{competitors:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},url:{type:'STRING'},reason:{type:'STRING'}},required:['name','url']}}},required:['competitors']};

export async function discoverCompetitorsWithGemini(main:SiteSnapshot):Promise<GeminiDiscoveryResult>{
 const apiKey=process.env['GEMINI_API_KEY']?.trim();if(!apiKey)return{snapshots:[],candidateCount:0,searchQueries:0,status:'missing-key'};
 const model=discoveryModel(),ownHost=hostname(main.url);const context=[main.title,main.description,...main.h1,...main.h2,main.text.slice(0,4500)].filter(Boolean).join('\n').slice(0,6500);
 const prompt=`Use Google Search to identify up to 6 direct commercial competitors of ${main.url}. Determine the actual business/category from the observed target-site context below. Return only real companies with their canonical official homepage URLs. Exclude articles, directories, comparison/review sites, social profiles, marketplaces, investors and data providers. Prefer competitors selling substantially similar products to substantially similar customers. Never invent a company or URL.\n\nTarget-site context:\n${context}`;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45_000);
 try{
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],tools:[{google_search:{}}],generationConfig:{responseMimeType:'application/json',responseSchema:schema,temperature:0.1,maxOutputTokens:1600}})});
  if(!response.ok){const detail=(await response.text()).slice(0,500);console.error('Gemini competitor discovery failed',{model,status:response.status,detail});return{snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'}}
  const raw=record(await response.json()),text=responseText(raw),urls=candidateUrls(parseJson(text),ownHost);
  const settled=await Promise.all(urls.map(async url=>{try{return await fetchSite(url)}catch{try{return await searchEvidenceForUrl(url)}catch{return null}}}));
  const snapshots=settled.filter((x):x is SiteSnapshot=>Boolean(x));const result:GeminiDiscoveryResult={snapshots,candidateCount:urls.length,searchQueries:searchCount(raw),status:urls.length?'ok':'empty'};
  console.info('Gemini competitor discovery',{model,status:result.status,candidates:urls.length,verifiedSnapshots:snapshots.length,searchQueries:result.searchQueries,outputChars:text.length});return result;
 }catch(error){console.error('Gemini competitor discovery unavailable',{error});return{snapshots:[],candidateCount:0,searchQueries:0,status:'provider-error'}}finally{clearTimeout(timer)}
}
