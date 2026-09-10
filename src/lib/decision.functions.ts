import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '@/lib/auth-middleware';
import { getDatabase } from '@/lib/database.server';
import { getBusinessContext } from '@/lib/business-context.server';
import { buildDecisions, type DecisionInsightInput } from '@/lib/decision-engine.server';

type LegacyAnalysisRow = { id: string; store_url: string; created_at: string; result_json: unknown };

export type Decision = {
  id: string;
  decisionKey: string;
  sourceInsightId: string | null;
  sourceAnalysisId: string | null;
  storeUrl: string;
  createdAt: string;
  title: string;
  action: string;
  rationale: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  score: number;
  evidenceCount: number;
  evidenceBasis: string[];
  status: 'proposed' | 'accepted' | 'dismissed' | 'completed';
  intelligenceRunKey: string | null;
};

function obj(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arr(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []; }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function num(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function priorityOf(value: unknown): Decision['priority'] { const p=text(value).toLowerCase();return p==='critical'||p==='high'||p==='low'?p:'medium'; }
function confidenceLabel(value: number): Decision['confidence'] { return value >= 0.8 ? 'high' : value >= 0.6 ? 'medium' : 'low'; }
function legacyConfidence(result:Record<string,unknown>):Decision['confidence']{const metadata=obj(result['metadata']),snapshot=obj(result['snapshot']);const strength=text(metadata['evidenceStrength']||snapshot['evidenceStrength']).toLowerCase();if(strength==='high'||strength==='strong')return'high';if(strength==='low'||strength==='weak')return'low';const evidence=num(metadata['evidenceCount']||metadata['sourceCount']);return evidence>=5?'high':evidence>=2?'medium':'low';}

function evidenceLabels(evidence: Array<Record<string, unknown>>) {
  return evidence.map((item) => text(item['title']) || text(item['eventType']) || text(item['eventId']) || text(item['sourceUrl'])).filter(Boolean).slice(0, 6);
}

function mapDecisionRow(row: any, storeUrl: string): Decision {
  const evidence = arr(row.evidence);
  const confidenceScore = Math.max(0, Math.min(1, Number(row.confidence ?? 0)));
  return {
    id: String(row.id),
    decisionKey: String(row.decision_key),
    sourceInsightId: row.source_insight_id ? String(row.source_insight_id) : null,
    sourceAnalysisId: row.source_analysis_id ? String(row.source_analysis_id) : null,
    storeUrl,
    createdAt: String(row.last_seen_at ?? row.first_seen_at),
    title: String(row.title),
    action: String(row.action),
    rationale: String(row.rationale),
    category: String(row.category),
    priority: priorityOf(row.priority),
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    score: Number(row.score ?? 0),
    evidenceCount: Number(row.evidence_count ?? evidence.length),
    evidenceBasis: evidenceLabels(evidence),
    status: row.status as Decision['status'],
    intelligenceRunKey: row.intelligence_run_key ? String(row.intelligence_run_key) : null,
  };
}

/** Legacy adapter kept only so existing users retain a usable decision before the first v2 refresh. */
export function buildDecision(row:LegacyAnalysisRow):Decision{
  const result=obj(row.result_json),pulse=obj(result['decisionPulse']),pulseAction=obj(pulse['action']),actions=arr(result['actions']||result['action_plan']),first=actions[0]||{},matrix=arr(result['priorityMatrix']||result['priority_matrix']),firstMatrix=matrix[0]||{};
  const action=text(first['action']||first['title']||first['description']||pulseAction['title']||pulseAction['description']||result['next_action'])||'مراجعة الإشارات ذات التأثير الأعلى وتحديد خطوة تنفيذية.';
  const title=text(pulseAction['title']||first['title']||firstMatrix['title']||firstMatrix['action'])||'قرار تنافسي جديد';
  const rationale=text(first['rationale']||first['reason']||first['evidence']||first['detail']||pulseAction['description']||result['summary'])||'القرار مبني على آخر تحليل محفوظ والأدلة المتاحة وقت التنفيذ.';
  const priority=priorityOf(first['priority']||first['severity']||first['impact']||firstMatrix['priority']||obj(pulse['threat'])['severity']);
  const metadata=obj(result['metadata']);const evidenceCount=Math.max(0,num(metadata['evidenceCount']||metadata['sourceCount']));
  const basis=[...arr(result['trust']).map(item=>text(item['detail']||item['title'])).filter(Boolean),...arr(result['signals']).slice(0,3).map(item=>text(item['evidence']||item['detail']||item['title'])).filter(Boolean)].slice(0,5);
  const confidence=legacyConfidence(result);const confidenceScore=confidence==='high'?0.85:confidence==='medium'?0.65:0.4;
  return{id:row.id,decisionKey:`legacy:${row.id}`,sourceInsightId:null,sourceAnalysisId:row.id,storeUrl:row.store_url,createdAt:row.created_at,title,action,rationale,category:'legacy-analysis',priority,confidence,confidenceScore,score:priority==='critical'?95:priority==='high'?82:priority==='medium'?65:45,evidenceCount,evidenceBasis:basis,status:'proposed',intelligenceRunKey:null};
}

async function currentStoreUrl(userId: string) {
  const context = await getBusinessContext(userId);
  return context?.websiteUrl ?? '';
}

export const listDecisions=createServerFn({method:'GET'}).middleware([requireAuth]).inputValidator((input:{limit?:number;status?:Decision['status']})=>input??{}).handler(async({data,context}):Promise<Decision[]>=>{
  const limit=Math.min(Math.max(data.limit??50,1),100);const db=getDatabase();
  let query=db.from('decisions').select('id,decision_key,source_insight_id,source_analysis_id,category,title,action,rationale,priority,score,confidence,evidence_count,evidence,status,intelligence_run_key,first_seen_at,last_seen_at').eq('user_id',context.userId);
  if(data.status)query=query.eq('status',data.status);
  const {data:rows,error}=await query.order('score',{ascending:false}).order('last_seen_at',{ascending:false}).limit(limit);if(error)throw new Error(error.message);
  const storeUrl=await currentStoreUrl(context.userId);return(rows??[]).map((row:any)=>mapDecisionRow(row,storeUrl));
});

export const refreshDecisionEngine=createServerFn({method:'POST'}).middleware([requireAuth]).handler(async({context})=>{
  const db=getDatabase();
  const {data:allInsights,error:insightError}=await db.from('business_insights').select('id,title,summary,category,impact,confidence,evidence,recommendation,source_analysis_id,run_key,created_at').eq('user_id',context.userId).order('created_at',{ascending:false}).limit(100);
  if(insightError)throw new Error(insightError.message);
  const rows=allInsights??[];
  if(!rows.length)return{ok:true,published:0,rejected:0,runKey:null,topScore:0};
  const latestRunKey=(rows[0] as any)?.run_key?String((rows[0] as any).run_key):null;
  const currentRows=latestRunKey?rows.filter((row:any)=>String(row.run_key??'')===latestRunKey):rows.slice(0,20);
  const inputs:DecisionInsightInput[]=currentRows.map((row:any)=>({
    id:String(row.id),title:String(row.title??''),summary:String(row.summary??''),category:String(row.category??'competition'),impact:String(row.impact??'medium'),confidence:Number(row.confidence??0),evidence:Array.isArray(row.evidence)?row.evidence:[],recommendation:row.recommendation?String(row.recommendation):null,sourceAnalysisId:row.source_analysis_id?String(row.source_analysis_id):null,
  }));
  const result=buildDecisions(inputs);const now=new Date().toISOString();
  for(const decision of result.decisions){
    const {error}=await db.from('decisions').upsert({
      user_id:context.userId,decision_key:decision.decisionKey,source_insight_id:decision.sourceInsightId,source_analysis_id:decision.sourceAnalysisId,category:decision.category,title:decision.title,action:decision.action,rationale:decision.rationale,priority:decision.priority,score:decision.score,confidence:decision.confidence,evidence_count:decision.evidenceCount,evidence:decision.evidence,intelligence_run_key:latestRunKey,last_seen_at:now,updated_at:now,
    },{onConflict:'user_id,decision_key'});
    if(error)throw new Error(`Decision persistence failed: ${error.message}`);
  }
  return{ok:true,published:result.decisions.length,rejected:result.rejected.length,runKey:latestRunKey,topScore:result.decisions[0]?.score??0};
});

export const setDecisionStatus=createServerFn({method:'POST'}).middleware([requireAuth]).inputValidator((input:{id:string;status:Decision['status']})=>input).handler(async({data,context})=>{
  if(!['proposed','accepted','dismissed','completed'].includes(data.status))throw new Error('حالة القرار غير صالحة.');
  const now=new Date().toISOString();const patch:Record<string,unknown>={status:data.status,updated_at:now};
  if(data.status==='accepted')patch['accepted_at']=now;if(data.status==='completed')patch['completed_at']=now;
  const {data:row,error}=await getDatabase().from('decisions').update(patch).eq('id',data.id).eq('user_id',context.userId).select('id').maybeSingle();if(error)throw new Error(error.message);if(!row)throw new Error('القرار غير موجود.');return{ok:true};
});

export const getLatestDecision=createServerFn({method:'GET'}).middleware([requireAuth]).handler(async({context}):Promise<Decision|null>=>{
  const db=getDatabase();const storeUrl=await currentStoreUrl(context.userId);
  const {data,error}=await db.from('decisions').select('id,decision_key,source_insight_id,source_analysis_id,category,title,action,rationale,priority,score,confidence,evidence_count,evidence,status,intelligence_run_key,first_seen_at,last_seen_at').eq('user_id',context.userId).neq('status','dismissed').order('score',{ascending:false}).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(error.message);if(data)return mapDecisionRow(data,storeUrl);
  const {data:legacy,error:legacyError}=await db.from('analyses').select('id,store_url,created_at,result_json').eq('user_id',context.userId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(legacyError)throw new Error(legacyError.message);return legacy?buildDecision(legacy as LegacyAnalysisRow):null;
});
