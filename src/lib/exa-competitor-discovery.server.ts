import { fetchSite, hostname, type SiteSnapshot } from './analyze.server';

type ExaResult = { url?: string; title?: string; text?: string; highlights?: string[] };
export type ExaDiscovery = { status: 'ok' | 'missing-key' | 'provider-error' | 'empty'; snapshots: SiteSnapshot[]; candidateCount: number };
const excluded = ['linkedin.com','facebook.com','instagram.com','youtube.com','reddit.com','wikipedia.org','crunchbase.com'];
export async function discoverCompetitorsWithExa(main: SiteSnapshot): Promise<ExaDiscovery> {
  const key = process.env['EXA_API_KEY']?.trim();
  if (!key) return {status:'missing-key',snapshots:[],candidateCount:0};
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),12000);
  try {
    const response = await fetch('https://api.exa.ai/search',{
      method:'POST',signal:controller.signal,
      headers:{'content-type':'application/json','x-api-key':key},
      body:JSON.stringify({query:`Companies selling products or services directly competing with ${hostname(main.url)} ${main.title} ${main.description.slice(0,250)} official websites`,type:'auto',numResults:12,contents:{text:{maxCharacters:350}}})
    });
    if (!response.ok) { console.error('Exa search failed',response.status); return {status:'provider-error',snapshots:[],candidateCount:0}; }
    const data = await response.json() as {results?:ExaResult[]};
    const own = hostname(main.url), seen = new Set<string>();
    const results = (data.results??[]).filter(item=>{
      if(!item.url || !/^https:\/\//.test(item.url))return false;
      const host=hostname(item.url);
      if(!host||host===own||host.endsWith('.'+own)||excluded.some(x=>host===x||host.endsWith('.'+x))||seen.has(host))return false;
      seen.add(host);return true;
    }).slice(0,8);
    const snapshots = await Promise.all(results.map(async item=>{
      try{return await fetchSite('https://'+hostname(item.url!));}catch{return null;}
    }));
    return {status:results.length?'ok':'empty',candidateCount:results.length,snapshots:snapshots.filter((s):s is SiteSnapshot=>s!==null)};
  } catch(e) {console.error('Exa discovery unavailable',e);return {status:'provider-error',snapshots:[],candidateCount:0};}
  finally {clearTimeout(timer);}
}
