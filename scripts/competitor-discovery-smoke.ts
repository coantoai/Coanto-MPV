import { competitorReason, filterCommercialCompetitors, scoreCommercialCompetitor } from '../src/lib/competitor-filter.server.ts';
import { discoverCompetitorsWithGemini } from '../src/lib/gemini-competitor-discovery.server.ts';
import type { SiteSnapshot } from '../src/lib/analyze.server.ts';

const site=(url:string,title:string,text:string,sourceType:'direct-site'|'search-index'='direct-site',evidence:string[]=[`evidence:${url}`]):SiteSnapshot=>({url,title,description:text,h1:[title],h2:[],text,sourceType,evidence});
const main=site('https://acme-shoes.com','Acme Shoes','shop shoes footwear sneakers products checkout shipping');
const real=site('https://runner.com','Runner Footwear','shop running shoes footwear sneakers products add to cart checkout shipping returns');
const editorial=site('https://example-news.com','Best Acme Competitors Review','analysis review competitors shoes market data');
const unrelated=site('https://flowers.com','Flowers','shop flowers bouquets checkout shipping products');

const accepted=filterCommercialCompetitors(main,[editorial,unrelated,real]);
if(accepted.length!==1||accepted[0]?.url!==real.url)throw new Error('Commercial competitor gate accepted an invalid candidate or rejected a valid one.');
const score=scoreCommercialCompetitor(main,real);
if(score<50||score>100)throw new Error(`Unexpected competitor relevance score: ${score}`);
const reason=competitorReason(main,real);
if(!/commercial signals/i.test(reason)||!/direct website evidence/i.test(reason))throw new Error('Competitor rationale is missing evidence explanation.');

const grounded=site(
  'https://grounded-runner.example',
  'Grounded Runner',
  'Footwear brand selling running shoes and sneakers to consumers.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Grounded Runner — sells similar footwear to similar customers',
    'Grounded category: footwear and running shoes',
    'Grounded commercial evidence: sells running shoes and sneakers through its official website',
    'Google Search grounding source: public source — https://search-source.example/evidence',
  ],
);
const groundedAccepted=filterCommercialCompetitors(main,[grounded]);
if(groundedAccepted.length!==1||groundedAccepted[0]?.url!==grounded.url)throw new Error('Google-grounded commercial competitor fallback was rejected.');

const serviceMain=site('https://northstar-advisory.example','Northstar Advisory','advisory consulting for small businesses');
const groundedService=site(
  'https://rival-advisory.example',
  'Rival Advisory',
  'Business advisory consultancy serving small and medium businesses.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Rival Advisory — provides the same business advisory service to SMEs',
    'Grounded category: business advisory consulting',
    'Grounded commercial evidence: offers paid advisory engagements to small and medium businesses',
    'Google Search grounding source: rival-advisory.example — https://search-source.example/rival',
  ],
);
if(filterCommercialCompetitors(serviceMain,[groundedService]).length!==1)throw new Error('Candidate-specific grounding should support businesses outside the lexical category taxonomy.');

const ungroundedService=site(
  'https://unverified-advisory.example',
  'Unverified Advisory',
  'Business advisory consultancy serving small and medium businesses.',
  'search-index',
  [
    'Gemini Google Search grounded competitor candidate: Unverified Advisory — alleged competitor',
    'Grounded commercial evidence: alleged similar service',
  ],
);
if(filterCommercialCompetitors(serviceMain,[ungroundedService]).length!==0)throw new Error('Grounded fallback without a candidate-specific Google source must not bypass verification.');

const originalFetch=globalThis.fetch;
const originalKey=process.env.GEMINI_API_KEY;
const originalModel=process.env.GEMINI_DISCOVERY_MODEL;
process.env.GEMINI_API_KEY='unit-test-key';
process.env.GEMINI_DISCOVERY_MODEL='gemini-3.1-flash-lite';
let geminiMode:'grounded-direct'|'grounded-fallback'|'ungrounded-direct'='grounded-direct';
function geminiPayload(name:string,url:string,groundedResult:boolean){
  const text=JSON.stringify({competitors:[{name,url,reason:'Competes for the same footwear customer with similar everyday sneakers.',category:'footwear sneakers',commercialEvidence:'Sells shoes and sneakers to consumers.'}]});
  return {
    candidates:[{
      content:{parts:[{text}]},
      groundingMetadata:groundedResult?{
        webSearchQueries:[`${name} official shoes competitor`],
        groundingChunks:[{web:{uri:`https://grounding.example/${name.toLowerCase().replace(/\s+/g,'-')}`,title:`${name} | Official Shoes`}}],
        groundingSupports:[{segment:{startIndex:0,endIndex:text.length,text:name},groundingChunkIndices:[0]}],
      }:{},
    }],
  };
}
globalThis.fetch=(async(input:RequestInfo|URL)=>{
  const url=String(input);
  if(url.includes('generativelanguage.googleapis.com')){
    if(geminiMode==='grounded-direct')return new Response(JSON.stringify(geminiPayload('Grounded Shoes','https://grounded-shoes.example/',true)),{status:200,headers:{'content-type':'application/json'}});
    if(geminiMode==='grounded-fallback')return new Response(JSON.stringify(geminiPayload('Fallback Shoes','https://fallback-shoes.example/',true)),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify(geminiPayload('Ungrounded Shoes','https://ungrounded-shoes.example/',false)),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url.startsWith('https://grounded-shoes.example/'))return new Response('<html><head><title>Grounded Shoes</title><meta name="description" content="Shop footwear sneakers and shoes"></head><body><h1>Grounded Shoes</h1><h2>Sneakers</h2>products shop add to cart checkout shipping returns footwear shoes sneakers</body></html>',{status:200,headers:{'content-type':'text/html'}});
  if(url.startsWith('https://ungrounded-shoes.example/'))return new Response('<html><head><title>Ungrounded Shoes</title><meta name="description" content="Shop footwear sneakers and shoes"></head><body><h1>Ungrounded Shoes</h1><h2>Sneakers</h2>products shop add to cart checkout shipping returns footwear shoes sneakers</body></html>',{status:200,headers:{'content-type':'text/html'}});
  if(url.startsWith('https://fallback-shoes.example/'))return new Response('blocked',{status:403,headers:{'content-type':'text/html'}});
  if(url.includes('html.duckduckgo.com'))return new Response('',{status:503,headers:{'content-type':'text/html'}});
  return new Response('not found',{status:404,headers:{'content-type':'text/html'}});
}) as typeof fetch;

try{
  const groundedDirect=await discoverCompetitorsWithGemini(main);
  if(groundedDirect.status!=='ok'||groundedDirect.candidateCount!==1||groundedDirect.searchQueries!==1||groundedDirect.snapshots.length!==1)throw new Error('Mocked grounded Gemini discovery did not return the expected direct snapshot.');
  if(!groundedDirect.snapshots[0]?.evidence.some((entry)=>entry.startsWith('Gemini Google Search grounded competitor candidate:')))throw new Error('Candidate-specific Gemini grounding was not attached to the verified direct site.');
  if(!groundedDirect.snapshots[0]?.evidence.some((entry)=>entry.startsWith('Google Search grounding source:')))throw new Error('Grounding source provenance was not preserved.');

  geminiMode='grounded-fallback';
  const groundedFallback=await discoverCompetitorsWithGemini(main);
  if(groundedFallback.snapshots.length!==1||groundedFallback.snapshots[0]?.sourceType!=='search-index')throw new Error('Grounded candidate did not survive when the official site blocked direct collection.');
  if(!groundedFallback.snapshots[0]?.evidence.some((entry)=>entry.startsWith('Google Search grounding source:')))throw new Error('Grounded fallback lost its source attribution.');

  geminiMode='ungrounded-direct';
  const ungroundedDirect=await discoverCompetitorsWithGemini(main);
  if(ungroundedDirect.snapshots.length!==1||ungroundedDirect.snapshots[0]?.sourceType!=='direct-site')throw new Error('Direct verification should still return a site when Gemini grounding metadata is absent.');
  if(ungroundedDirect.snapshots[0]?.evidence.some((entry)=>entry.startsWith('Gemini Google Search grounded competitor candidate:')))throw new Error('Ungrounded Gemini prose leaked into verified evidence fields.');
}finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=originalKey;
  if(originalModel===undefined)delete process.env.GEMINI_DISCOVERY_MODEL;else process.env.GEMINI_DISCOVERY_MODEL=originalModel;
}

console.log('COMPETITOR_DISCOVERY_SMOKE_OK');
