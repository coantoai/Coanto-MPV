import { getDatabase } from './database.server';
import { getBusinessContext } from './business-context.server';
import { discoverCompetitors, getMainSnapshot, hostname, validateTargetUrl, type SiteSnapshot } from './analyze.server';
import { competitorReason, filterCommercialCompetitors, scoreCommercialCompetitor } from './competitor-filter.server';

export type DiscoveredCompetitor = {
  id?: string;
  domain: string;
  name: string;
  url: string;
  sourceType: 'direct-site' | 'search-index' | 'user-lead';
  verificationStatus: 'verified' | 'indexed' | 'lead';
  relevanceScore: number;
  rank: number;
  reason: string;
  evidence: string[];
  lastSeenAt: string;
};

function displayName(site: SiteSnapshot) {
  const raw=(site.title||hostname(site.url)).split(/[|–—-]/)[0]?.trim();
  return raw || hostname(site.url);
}
function mapRow(row:any):DiscoveredCompetitor{return{id:String(row.id),domain:String(row.domain),name:String(row.name),url:String(row.url),sourceType:row.source_type,verificationStatus:row.verification_status,relevanceScore:Number(row.relevance_score)||0,rank:Number(row.rank)||0,reason:String(row.reason||''),evidence:Array.isArray(row.evidence)?row.evidence.map(String):[],lastSeenAt:String(row.last_seen_at)}}

export async function listDiscoveredCompetitors(userId:string):Promise<DiscoveredCompetitor[]>{
  const {data,error}=await getDatabase().from('competitors').select('*').eq('user_id',userId).order('rank',{ascending:true}).order('relevance_score',{ascending:false});
  if(error)throw new Error(`Competitor read failed: ${error.message}`);
  return (data??[]).map(mapRow);
}

export async function runCompetitorDiscovery(userId:string):Promise<DiscoveredCompetitor[]>{
  const context=await getBusinessContext(userId);
  if(!context)throw new Error('ONBOARDING_REQUIRED');
  const validation=validateTargetUrl(context.websiteUrl);
  if(!validation.ok||!validation.url)throw new Error('BUSINESS_URL_INVALID');
  const main=await getMainSnapshot(validation.url);
  const explicit=context.knownCompetitors.filter((value)=>validateTargetUrl(value).ok);
  const candidates=await discoverCompetitors(main,explicit);
  const accepted=filterCommercialCompetitors(main,candidates,explicit);
  if(!accepted.length)throw new Error('NO_VERIFIED_COMPETITORS');
  const now=new Date().toISOString();
  const rows=accepted.map((site,index)=>({
    user_id:userId,
    domain:hostname(site.url),
    name:displayName(site),
    url:site.url,
    source_type:site.sourceType,
    verification_status:site.sourceType==='direct-site'?'verified':'indexed',
    relevance_score:scoreCommercialCompetitor(main,site),
    rank:index+1,
    reason:competitorReason(main,site),
    evidence:site.evidence,
    last_seen_at:now,
    updated_at:now,
  }));
  for(const row of rows){
    const {error}=await getDatabase().from('competitors').upsert(row,{onConflict:'user_id,domain'});
    if(error)throw new Error(`Competitor persistence failed: ${error.message}`);
  }
  const domains=rows.map((r)=>r.domain);
  const existing=await listDiscoveredCompetitors(userId);
  return existing.filter((item)=>domains.includes(item.domain));
}
