import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '@/lib/auth-middleware';
import { getDatabase } from '@/lib/database.server';
import { getBusinessContext } from '@/lib/business-context.server';
import { buildCompetitiveIntelligence, type IntelligenceEvent } from '@/lib/intelligence-engine.server';
import type { Json } from '@/lib/json';

export type BusinessInsight = { id:string; title:string; summary:string; category:string; impact:string; confidence:number; evidence:Json[]; recommendation:string|null; createdAt:string };
export type BusinessMetric = { id:string; metricKey:string; metricValue:number; unit:string|null; periodStart:string|null; periodEnd:string|null; createdAt:string };

const mapInsight=(row:any):BusinessInsight=>({id:String(row.id),title:String(row.title),summary:String(row.summary),category:String(row.category),impact:String(row.impact),confidence:Number(row.confidence??0),evidence:Array.isArray(row.evidence)?(row.evidence as Json[]):[],recommendation:row.recommendation??null,createdAt:String(row.created_at)});
const mapMetric=(row:any):BusinessMetric=>({id:String(row.id),metricKey:String(row.metric_key),metricValue:Number(row.metric_value),unit:row.unit??null,periodStart:row.period_start??null,periodEnd:row.period_end??null,createdAt:String(row.created_at)});

export const listBusinessInsights=createServerFn({method:'GET'}).middleware([requireAuth]).inputValidator((input:{limit?:number})=>input??{}).handler(async({data,context})=>{
  const limit=Math.min(Math.max(data.limit??50,1),100);
  const {data:rows,error}=await getDatabase().from('business_insights').select('id,title,summary,category,impact,confidence,evidence,recommendation,created_at').eq('user_id',context.userId).order('created_at',{ascending:false}).limit(limit);
  if(error)throw new Error(error.message);return(rows??[]).map(mapInsight);
});

export const listBusinessMetrics=createServerFn({method:'GET'}).middleware([requireAuth]).inputValidator((input:{limit?:number})=>input??{}).handler(async({data,context})=>{
  const limit=Math.min(Math.max(data.limit??100,1),200);
  const {data:rows,error}=await getDatabase().from('business_metrics').select('id,metric_key,metric_value,unit,period_start,period_end,created_at').eq('user_id',context.userId).order('created_at',{ascending:false}).limit(limit);
  if(error)throw new Error(error.message);return(rows??[]).map(mapMetric);
});

export const saveBusinessInsight=createServerFn({method:'POST'}).middleware([requireAuth]).inputValidator((input:{title:string;summary:string;category:string;impact?:string;confidence?:number;evidence?:Json[];recommendation?:string;sourceAnalysisId?:string})=>input).handler(async({data,context})=>{
  const title=data.title.trim(),summary=data.summary.trim();if(!title||!summary)throw new Error('عنوان وملخص الرؤية مطلوبان');
  const confidence=Math.min(Math.max(data.confidence??0,0),1);
  const {data:row,error}=await getDatabase().from('business_insights').insert({user_id:context.userId,title,summary,category:data.category,impact:data.impact??'medium',confidence,evidence:data.evidence??[],recommendation:data.recommendation??null,source_analysis_id:data.sourceAnalysisId??null}).select('id,title,summary,category,impact,confidence,evidence,recommendation,created_at').single();
  if(error)throw new Error(error.message);return mapInsight(row);
});

export const refreshBusinessIntelligence=createServerFn({method:'POST'}).middleware([requireAuth]).handler(async({context})=>{
  const db=getDatabase();
  const now=new Date();
  const sinceDate=new Date(now.getTime()-30*24*3_600_000);
  const since=sinceDate.toISOString();
  const periodEnd=now.toISOString();
  const runKey=`30d:${now.toISOString().slice(0,10)}`;

  const [businessContext,{data:analyses,error:aError},{data:events,error:eError},{data:memory,error:mError}]=await Promise.all([
    getBusinessContext(context.userId),
    db.from('analyses').select('id,store_url,created_at,result_json').eq('user_id',context.userId).gte('created_at',since).order('created_at',{ascending:false}).limit(500),
    db.from('monitoring_events').select('id,event_type,severity,change_score,title,summary,evidence,detected_at,target_id').eq('user_id',context.userId).gte('detected_at',since).order('detected_at',{ascending:false}).limit(500),
    db.from('memory_items').select('id,kind,created_at').eq('user_id',context.userId).gte('created_at',since).limit(500),
  ]);
  if(aError)throw new Error(aError.message);if(eError)throw new Error(eError.message);if(mError)throw new Error(mError.message);

  const analysisRows=analyses??[];
  const eventRows=events??[];
  const memoryRows=memory??[];
  const decisions=memoryRows.filter((item:any)=>item.kind==='decision');
  const intelligenceEvents:IntelligenceEvent[]=eventRows.map((item:any)=>{
    const eventType=String(item.event_type);
    const persistedScore=Number(item.change_score??0);
    const legacyScore=persistedScore>0?persistedScore:eventType==='error'?100:eventType==='change'?50:45;
    return {
      id:String(item.id),
      eventType,
      severity:String(item.severity),
      changeScore:legacyScore,
      title:String(item.title??''),
      summary:String(item.summary??''),
      evidence:item.evidence??{},
      detectedAt:String(item.detected_at),
      targetId:String(item.target_id),
    };
  });
  const intelligence=buildCompetitiveIntelligence({
    events:intelligenceEvents,
    analysesCount:analysisRows.length,
    memoryItemsCount:memoryRows.length,
    decisionsCount:decisions.length,
    ...(businessContext?{businessContext:{businessName:businessContext.businessName,primaryMarket:businessContext.primaryMarket,competitiveGoals:businessContext.competitiveGoals}}:{}),
  });

  const {error:oldMetricError}=await db.from('business_metrics').delete().eq('user_id',context.userId).eq('run_key',runKey);if(oldMetricError)throw new Error(oldMetricError.message);
  const {error:oldInsightError}=await db.from('business_insights').delete().eq('user_id',context.userId).eq('run_key',runKey);if(oldInsightError)throw new Error(oldInsightError.message);
  const sourceAnalysisId=(analysisRows[0] as any)?.id??null;

  const {error:metricError}=await db.from('business_metrics').insert(intelligence.metrics.map((metric)=>({
    user_id:context.userId,
    metric_key:metric.key,
    metric_value:metric.value,
    unit:metric.unit,
    period_start:since,
    period_end:periodEnd,
    source_analysis_id:sourceAnalysisId,
    metadata:{derivedFrom:'verified-monitoring+analyses+memory',windowDays:30,engine:'coanto-intelligence-v2',businessContextUsed:Boolean(businessContext)},
    run_key:runKey,
  })));
  if(metricError)throw new Error(metricError.message);

  if(intelligence.insights.length){
    const {error:insightError}=await db.from('business_insights').insert(intelligence.insights.map((insight)=>({
      user_id:context.userId,
      title:insight.title,
      summary:insight.summary,
      category:insight.category,
      impact:insight.impact,
      confidence:insight.confidence,
      evidence:insight.evidence,
      recommendation:insight.recommendation,
      source_analysis_id:sourceAnalysisId,
      run_key:runKey,
    })));
    if(insightError)throw new Error(insightError.message);
  }

  return{
    ok:true,
    runKey,
    analyses:analysisRows.length,
    events:eventRows.length,
    changes:intelligence.meaningfulEvents.length,
    highPriority:intelligence.highPriority.length,
    patterns:intelligence.patterns.length,
    averageChangeScore:intelligence.averageChangeScore,
    errors:intelligence.errors.length,
    memoryItems:memoryRows.length,
    decisions:decisions.length,
    insights:intelligence.insights.length,
  };
});
