import { readFile } from 'node:fs/promises';
import { acquireSiteSnapshot } from '../src/lib/acquisition.server.ts';
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

  let privateRejected=false;
  try{await acquireSiteSnapshot('http://127.0.0.1/internal');}catch{privateRejected=true;}
  if(!privateRejected)throw new Error('Acquisition SSRF gate failed for private target.');

  const [acquisition,evidenceCollector,monitoringEngine,monitoringRunner,migration,envExample]=await Promise.all([
    readFile(new URL('../src/lib/acquisition.server.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/evidence-collector.server.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/monitoring-engine.server.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/lib/monitoring-runner.server.ts',import.meta.url),'utf8'),
    readFile(new URL('../migrations/20260910230000_apify_acquisition.sql',import.meta.url),'utf8'),
    readFile(new URL('../.env.example',import.meta.url),'utf8'),
  ]);
  if(!acquisition.includes('validateTargetUrl')||!acquisition.includes("mode === 'preferred'"))throw new Error('Acquisition policy boundary missing.');
  if(!evidenceCollector.includes('acquireSiteSnapshot')||!evidenceCollector.includes('acquisitionProvider'))throw new Error('Evidence collector is not wired to acquisition provenance.');
  if(!monitoringEngine.includes('acquireSiteSnapshot')||!monitoringEngine.includes('currentAcquisitionProvider'))throw new Error('Monitoring engine acquisition provenance missing.');
  if(!monitoringRunner.includes('acquisition_provider'))throw new Error('Monitoring persistence acquisition provenance missing.');
  if(!migration.includes('acquisition_provider')||!migration.includes("'direct','apify'"))throw new Error('Apify provenance migration missing.');
  if(!envExample.includes('APIFY_TOKEN=')||!envExample.includes('APIFY_MODE=fallback'))throw new Error('Apify environment contract missing.');

  console.log('APIFY_SMOKE_OK',JSON.stringify({actorId:config.actorId,mode:config.mode,maxPages:input['maxCrawlPages'],summarize:input['summarize'],privateTargetRejected:privateRejected}));
}finally{
  globalThis.fetch=originalFetch;
  if(originalToken===undefined)delete process.env['APIFY_TOKEN'];else process.env['APIFY_TOKEN']=originalToken;
  if(originalMode===undefined)delete process.env['APIFY_MODE'];else process.env['APIFY_MODE']=originalMode;
  if(originalActor===undefined)delete process.env['APIFY_ACTOR_ID'];else process.env['APIFY_ACTOR_ID']=originalActor;
  if(originalTimeout===undefined)delete process.env['APIFY_TIMEOUT_SECONDS'];else process.env['APIFY_TIMEOUT_SECONDS']=originalTimeout;
}
