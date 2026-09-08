import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export type BusinessInsight={id:string;title:string;summary:string;category:string;impact:string;confidence:number;evidence:Json[];recommendation:string|null;createdAt:string};
export type BusinessMetric={id:string;metricKey:string;metricValue:number;unit:string|null;periodStart:string|null;periodEnd:string|null;createdAt:string};
const mapInsight=(r:any):BusinessInsight=>({id:r.id,title:r.title,summary:r.summary,category:r.category,impact:r.impact,confidence:Number(r.confidence??0),evidence:Array.isArray(r.evidence)?(r.evidence as Json[]):[],recommendation:r.recommendation??null,createdAt:r.created_at});
const mapMetric=(r:any):BusinessMetric=>({id:r.id,metricKey:r.metric_key,metricValue:Number(r.metric_value),unit:r.unit??null,periodStart:r.period_start??null,periodEnd:r.period_end??null,createdAt:r.created_at});
export const listBusinessInsights=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((i:{limit?:number})=>i??{}).handler(async({data,context})=>{const limit=Math.min(Math.max(data.limit??50,1),100);const {data:rows,error}=await context.supabase.from("business_insights").select("id,title,summary,category,impact,confidence,evidence,recommendation,created_at").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(limit);if(error)throw new Error(error.message);return(rows??[]).map(mapInsight);});
export const listBusinessMetrics=createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).inputValidator((i:{limit?:number})=>i??{}).handler(async({data,context})=>{const limit=Math.min(Math.max(data.limit??100,1),200);const {data:rows,error}=await context.supabase.from("business_metrics").select("id,metric_key,metric_value,unit,period_start,period_end,created_at").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(limit);if(error)throw new Error(error.message);return(rows??[]).map(mapMetric);});
export const saveBusinessInsight=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((i:{title:string;summary:string;category:string;impact?:string;confidence?:number;evidence?:Json[];recommendation?:string;sourceAnalysisId?:string})=>i).handler(async({data,context})=>{const title=data.title.trim(),summary=data.summary.trim();if(!title||!summary)throw new Error("عنوان وملخص الرؤية مطلوبان");const confidence=Math.min(Math.max(data.confidence??0,0),1);const {data:row,error}=await context.supabase.from("business_insights").insert({user_id:context.userId,title,summary,category:data.category,impact:data.impact??"medium",confidence,evidence:data.evidence??[],recommendation:data.recommendation??null,source_analysis_id:data.sourceAnalysisId??null}).select("id,title,summary,category,impact,confidence,evidence,recommendation,created_at").single();if(error)throw new Error(error.message);return mapInsight(row);});

export const refreshBusinessIntelligence=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const now=new Date(); const sinceDate=new Date(now.getTime()-30*24*3600000); const since=sinceDate.toISOString(); const periodEnd=now.toISOString();
  const runKey=`30d:${now.toISOString().slice(0,10)}`;
  const [{data:analyses,error:aError},{data:events,error:eError},{data:memory,error:mError}]=await Promise.all([
    context.supabase.from("analyses").select("id,store_url,created_at,result_json").eq("user_id",context.userId).gte("created_at",since).order("created_at",{ascending:false}).limit(500),
    context.supabase.from("monitoring_events").select("id,event_type,severity,title,summary,evidence,detected_at,target_id").eq("user_id",context.userId).gte("detected_at",since).order("detected_at",{ascending:false}).limit(500),
    context.supabase.from("memory_items").select("id,kind,created_at").eq("user_id",context.userId).gte("created_at",since).limit(500),
  ]);
  if(aError)throw new Error(aError.message); if(eError)throw new Error(eError.message); if(mError)throw new Error(mError.message);
  const analysisRows=analyses??[], eventRows=events??[], memoryRows=memory??[];
  const changes=eventRows.filter((e:any)=>e.event_type==="change"); const errors=eventRows.filter((e:any)=>e.event_type==="error");
  const highRisk=eventRows.filter((e:any)=>e.severity==="high"||e.severity==="critical");
  const decisions=memoryRows.filter((m:any)=>m.kind==="decision");

  const {error:oldMetricError}=await context.supabase.from("business_metrics").delete().eq("user_id",context.userId).eq("run_key",runKey);
  if(oldMetricError)throw new Error(oldMetricError.message);
  const {error:oldInsightError}=await context.supabase.from("business_insights").delete().eq("user_id",context.userId).eq("run_key",runKey);
  if(oldInsightError)throw new Error(oldInsightError.message);

  const metrics=[
    ["analyses_30d",analysisRows.length,"count"],
    ["monitoring_events_30d",eventRows.length,"count"],
    ["competitive_changes_30d",changes.length,"count"],
    ["monitoring_errors_30d",errors.length,"count"],
    ["high_risk_events_30d",highRisk.length,"count"],
    ["memory_items_30d",memoryRows.length,"count"],
    ["decisions_30d",decisions.length,"count"],
  ] as const;
  const sourceAnalysisId=analysisRows[0]?.id??null;
  const {error:metricError}=await context.supabase.from("business_metrics").insert(metrics.map(([metric_key,metric_value,unit])=>({user_id:context.userId,metric_key,metric_value,unit,period_start:since,period_end:periodEnd,source_analysis_id:sourceAnalysisId,metadata:{derivedFrom:"analyses+monitoring_events+memory_items",windowDays:30},run_key:runKey})));
  if(metricError)throw new Error(metricError.message);

  if(changes.length){
    const first=changes[0] as any;
    const {error}=await context.supabase.from("business_insights").insert({user_id:context.userId,title:"السوق التنافسي شهد تغيّرات حديثة",summary:`تم رصد ${changes.length} تغيّرًا تنافسيًا خلال آخر 30 يومًا. هذه إشارة للمراجعة وليست إثباتًا لأثر مالي.`,category:"competition",impact:highRisk.length?"high":"medium",confidence:Math.min(0.95,0.55+Math.min(changes.length,8)*0.05),evidence:[{type:"monitoring-events",count:changes.length,latest:first.title,evidence:first.evidence??{}}],recommendation:"راجع التغيّرات المؤكدة أولًا، ثم اربطها بأدلة المنتج والسعر قبل اتخاذ قرار.",source_analysis_id:sourceAnalysisId,run_key:runKey});
    if(error)throw new Error(error.message);
  } else if(analysisRows.length){
    const {error}=await context.supabase.from("business_insights").insert({user_id:context.userId,title:"بيانات COANTO جاهزة للتحليل التجاري",summary:`يوجد ${analysisRows.length} تحليلًا محفوظًا خلال آخر 30 يومًا، ولا توجد تغيّرات مراقبة مؤكدة في الفترة نفسها.`,category:"operations",impact:"low",confidence:0.75,evidence:[{type:"analysis-count",count:analysisRows.length},{type:"memory-items",count:memoryRows.length},{type:"decisions",count:decisions.length}],recommendation:"شغّل المراقبة على المنافسين الأساسيين لبناء خط زمني للتغيّرات وربط القرارات بالنتائج.",source_analysis_id:sourceAnalysisId,run_key:runKey});
    if(error)throw new Error(error.message);
  }
  return {ok:true,runKey,analyses:analysisRows.length,events:eventRows.length,changes:changes.length,errors:errors.length,memoryItems:memoryRows.length,decisions:decisions.length};
});
