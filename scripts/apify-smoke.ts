import { fetchSiteViaApify, getApifyRuntimeConfig } from '../src/lib/apify.server.ts';

const originalFetch=globalThis.fetch;
const originalToken=process.env['APIFY_TOKEN'];
const originalMode=process.env['APIFY_MODE'];
const originalActor=process.env['APIFY_ACTOR_ID'];
const originalTimeout=process.env['APIFY_TIMEOUT_SECONDS'];

process.env['APIFY_TOKEN']='apify_test_secret_never_log';
process.env['APIFY_MODE']='fallback';
process.env['APIFY_ACTOR_ID']='apify/website-content-crawler';
process.env['APIFY_TIMEOUT_SECONDS']='30';

let requestedUrl='';
let authorization='';
let input:Record<string,unknown>={};
globalThis.fetch=(async(url: string | URL | Request, init?: RequestInit)=>{
  requestedUrl=String(url);
  const headers=new Headers(init?.headers);
  authorization=headers.get('authorization')||'';
  input=JSON.parse(String(init?.body||'{}')) as Record<string,unknown>;
  return new Response(JSON.stringify([{
    url:'https://example.com/',
    title:'Example Store',
    description:'Premium shoes',
    markdown:'# Example Store\n\n## New Arrivals\n\nPremium shoes from $120.',
  }]),{status:200,headers:{'content-type':'application/json'}});
}) as typeof fetch;

try{
  const config=getApifyRuntimeConfig();
  if(!config.configured||config.mode!=='fallback'||config.actorId!=='apify~website-content-crawler')throw new Error('Apify config normalization failed.');
  const page=await fetchSiteViaApify('https://example.com/');
  if(!requestedUrl.includes('/actors/apify~website-content-crawler/run-sync-get-dataset-items'))throw new Error('Apify actor endpoint contract failed.');
  if(requestedUrl.includes('apify_test_secret'))throw new Error('Apify token leaked into URL.');
  if(authorization!=='Bearer apify_test_secret_never_log')throw new Error('Apify Authorization header missing.');
  if(input['maxCrawlDepth']!==0||input['maxCrawlPages']!==1||input['summarize']!==false||input['respectRobotsTxtFile']!==true)throw new Error('Apify cost/safety bounds failed.');
  if(page.title!=='Example Store'||page.h1[0]!=='Example Store'||page.h2[0]!=='New Arrivals'||!page.text.includes('$120'))throw new Error('Apify dataset mapping failed.');
  console.log('APIFY_SMOKE_OK',JSON.stringify({actorId:config.actorId,mode:config.mode,maxPages:input['maxCrawlPages'],summarize:input['summarize']}));
}finally{
  globalThis.fetch=originalFetch;
  if(originalToken===undefined)delete process.env['APIFY_TOKEN'];else process.env['APIFY_TOKEN']=originalToken;
  if(originalMode===undefined)delete process.env['APIFY_MODE'];else process.env['APIFY_MODE']=originalMode;
  if(originalActor===undefined)delete process.env['APIFY_ACTOR_ID'];else process.env['APIFY_ACTOR_ID']=originalActor;
  if(originalTimeout===undefined)delete process.env['APIFY_TIMEOUT_SECONDS'];else process.env['APIFY_TIMEOUT_SECONDS']=originalTimeout;
}
