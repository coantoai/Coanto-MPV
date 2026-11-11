import { createFileRoute } from '@tanstack/react-router';
import { fetchSite, validateTargetUrl, hostname, discoverCompetitors, type SiteSnapshot } from '@/lib/analyze.server';
import { discoverCompetitorsWithGemini } from '@/lib/gemini-competitor-discovery.server';
import { discoverCompetitorsWithExa } from '@/lib/exa-competitor-discovery.server';
import { filterCommercialCompetitors, assessCommercialCompetitor } from '@/lib/competitor-filter.server';

const TARGET = 'https://www.allbirds.com/';
const CACHE_MS = 10 * 60_000;
let lastRun = 0;
let cached: { savedAt: number; data: DiscoveryResponse } | null = null;
let inFlight: Promise<DiscoveryResponse> | null = null;

type ProviderName = 'gemini' | 'exa' | 'public-search';
type CandidateEntry = { snapshot: SiteSnapshot; providers: Set<ProviderName> };
type DiscoveryResponse = {
  target: { url: string; title: string; description: string; sourceType: string };
  providerStatus: string;
  providerCounts: Record<ProviderName, number>;
  candidateCount: number;
  acceptedCount: number;
  verifiedCount: number;
  competitors: Array<{
    name: string; url: string; score: number; reason: string; description: string;
    sourceType: string; evidence: string[]; sources: string[];
    providers: ProviderName[]; relationship: string; evidenceQuality: string;
    sharedProducts: string[]; sharedAttributes: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  live: boolean; checkedAt: string;
};
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
function sourceLinks(site: SiteSnapshot) {
  const links = new Set<string>();
  links.add(site.url);
  for (const evidence of site.evidence) {
    if (!evidence.startsWith('Google Search grounding source:')) continue;
    for (const match of evidence.matchAll(/https:\/\/[^\s)]+/g)) {
      const value = match[0].replace(/[.,;]+$/, '');
      try { const parsed = new URL(value); if (parsed.hostname) links.add(parsed.toString()); } catch { /* ignore malformed source */ }
    }
  }
  return [...links].slice(0,5);
}
async function collect(): Promise<DiscoveryResponse> {
  const main = await fetchSite(TARGET);
  // Independent searches: no single provider failure aborts discovery.
  const [g,e,p] = await Promise.allSettled([
    discoverCompetitorsWithGemini(main),
    discoverCompetitorsWithExa(main),
    discoverCompetitors(main),
  ]);
  const gemini = g.status === 'fulfilled' ? g.value : null;
  const exa = e.status === 'fulfilled' ? e.value : null;
  const publicResults = p.status === 'fulfilled' ? p.value : [];
  const providerCounts: Record<ProviderName, number> = {
    gemini: gemini?.candidateCount ?? 0,
    exa: exa?.candidateCount ?? 0,
    'public-search': publicResults.length,
  };
  // Exclude regional domains of the target brand (e.g. allbirds.co.uk vs allbirds.com).
  const targetBrand=hostname(main.url).split('.')[0];
  const sameBrandDomain=(host:string)=>host.split('.')[0]===targetBrand;
  const byHost = new Map<string,CandidateEntry>();
  const add = (provider:ProviderName, snapshots:SiteSnapshot[]) => {
    for(const site of snapshots) {
      const host=hostname(site.url);
      if(!host || host===hostname(main.url) || host.endsWith('.'+hostname(main.url)) || sameBrandDomain(host))continue;
      const existing=byHost.get(host);
      if(!existing){byHost.set(host,{snapshot:site,providers:new Set([provider])});continue;}
      existing.providers.add(provider);
      const current=existing.snapshot;
      const preferNew = (site.sourceType==='direct-site' && current.sourceType!=='direct-site')
        || (site.sourceType===current.sourceType && site.text.length>current.text.length);
      const chosen=preferNew?site:current;
      existing.snapshot={...chosen,evidence:[...new Set([...current.evidence,...site.evidence])]};
    }
  };
  add('gemini',gemini?.snapshots??[]);
  add('exa',exa?.snapshots??[]);
  add('public-search',publicResults);
  const accepted = filterCommercialCompetitors(main,[...byHost.values()].map(x=>x.snapshot));
  const competitors=accepted.map((site)=>{
    const assessment=assessCommercialCompetitor(main,site);
    const providers=[...(byHost.get(hostname(site.url))?.providers??new Set<ProviderName>())];
    const confidence = site.sourceType!=='direct-site'?'low'
      :assessment.sharedProducts.length>0 && providers.length>=2?'high':'medium';
    return {
      name:site.title||hostname(site.url),url:site.url,score:assessment.score,
      reason:assessment.reason,description:site.description,sourceType:site.sourceType,
      evidence:site.evidence,sources:sourceLinks(site),providers,
      relationship:assessment.relationship,evidenceQuality:assessment.evidenceQuality,
      sharedProducts:assessment.sharedProducts,sharedAttributes:assessment.sharedAttributes,
      confidence:confidence as 'high'|'medium'|'low',
    };
  });
  const providerStatus=[
    'gemini:'+(gemini?.status??'failed'),
    'exa:'+(exa?.status??'failed'),
    'public-search:'+(p.status==='rejected'?'failed':publicResults.length?'results':'empty'),
  ].join(',');
  return {
    target:{url:main.url,title:main.title,description:main.description,sourceType:main.sourceType},
    providerStatus,providerCounts,candidateCount:byHost.size,acceptedCount:competitors.length,
    verifiedCount:competitors.filter(c=>c.sourceType==='direct-site').length,
    competitors,live:true,checkedAt:new Date().toISOString(),
  };
}
export const Route = createFileRoute('/api/public-discovery')({
  server:{handlers:{
    POST: async ({request}) => {
      // Cost/SSRF controls: only one fixed public target, no arbitrary URL proxy.
      if (request.headers.get('content-length') && Number(request.headers.get('content-length'))>1024)return respond({error:'Request too large'},413);
      const origin=request.headers.get('origin');
      if(origin) {try{if(new URL(origin).host!==new URL(request.url).host)return respond({error:'Origin rejected'},403);}catch{return respond({error:'Origin rejected'},403);}}
      let submitted=TARGET;
      try {const body=await request.json() as {url?:string};submitted=body.url||TARGET;} catch{return respond({error:'Invalid JSON'},400);}
      const validation=validateTargetUrl(submitted);
      if(!validation.ok || !validation.url || !['allbirds.com','www.allbirds.com'].includes(hostname(validation.url)))return respond({error:'Pilot currently supports allbirds.com only'},400);
      if(cached && Date.now()-cached.savedAt<CACHE_MS)return respond({...cached.data,cacheHit:true});
      if(inFlight) {try{return respond(await inFlight);}catch{return respond({error:'Discovery failed; no evidence fabricated'},503);}}
      if(Date.now()-lastRun<60_000)return respond({error:'Please retry in 60 seconds',code:'RATE_LIMIT'},429);
      lastRun=Date.now();
      inFlight=collect();
      try {
        const data=await inFlight;
        cached={savedAt:Date.now(),data};
        return respond(data);
      } catch(error) {
        console.error('Public pilot unavailable',error);
        return respond({error:'Live discovery unavailable; no results were fabricated.'},503);
      } finally {inFlight=null;}
    }
  }}
});
