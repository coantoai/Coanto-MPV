import { createFileRoute } from '@tanstack/react-router';
import { fetchSite, validateTargetUrl, hostname } from '@/lib/analyze.server';
import { discoverCompetitorsWithGemini } from '@/lib/gemini-competitor-discovery.server';
import { filterCommercialCompetitors, scoreCommercialCompetitor, competitorReason } from '@/lib/competitor-filter.server';

const TARGET = 'https://www.allbirds.com/';
let lastRun = 0;
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export const Route = createFileRoute('/api/public-discovery')({
  server:{handlers:{
    POST: async ({request}) => {
      // Limited single-target pilot: do not expose an arbitrary public URL fetcher or unlimited AI calls.
      if (request.headers.get('content-length') && Number(request.headers.get('content-length')) > 1024) return respond({error:'Request too large'},413);
      const origin=request.headers.get('origin');
      if (origin && new URL(origin).host !== new URL(request.url).host) return respond({error:'Origin rejected'},403);
      let submitted = TARGET;
      try {const body=await request.json() as {url?:string}; submitted=body.url||TARGET;} catch {return respond({error:'Invalid JSON'},400);}
      const validation=validateTargetUrl(submitted);
      if (!validation.ok || !validation.url || !['allbirds.com','www.allbirds.com'].includes(hostname(validation.url))) return respond({error:'Pilot currently supports allbirds.com only'},400);
      if (Date.now()-lastRun < 60000) return respond({error:'Please retry in 60 seconds',code:'RATE_LIMIT'},429);
      lastRun=Date.now();
      try {
        const main=await fetchSite(TARGET);
        const discovered=await discoverCompetitorsWithGemini(main);
        const accepted=filterCommercialCompetitors(main,discovered.snapshots);
        return respond({
          target:{url:main.url,title:main.title,description:main.description,sourceType:main.sourceType},
          providerStatus:discovered.status,candidateCount:discovered.candidateCount,
          competitors:accepted.map(c=>({name:c.title||hostname(c.url),url:c.url,score:scoreCommercialCompetitor(main,c),reason:competitorReason(main,c),description:c.description,sourceType:c.sourceType,evidence:c.evidence})),
          verifiedCount:accepted.length,live:true,checkedAt:new Date().toISOString()
        },discovered.status==='missing-key'?503:200);
      } catch (e) {console.error('Public pilot failed',e);return respond({error:'Live discovery unavailable; no results were fabricated.'},503);}
    }
  }}
});