import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { getDatabase } from "@/lib/database.server";
import { validateTargetUrl } from "@/lib/analyze.server";
import { captureMonitoringSnapshot, detectMonitoringChange, type MonitoringSnapshotInput } from "@/lib/monitoring-engine.server";
import type { Json } from "@/lib/json";

export type MonitoringTarget={id:string;name:string;url:string;intervalHours:number;active:boolean;lastCheckedAt:string|null;nextCheckAt:string|null;createdAt:string};
export type MonitoringEvent={id:string;targetId:string;eventType:string;severity:string;title:string;summary:string;evidence:Json;detectedAt:string;acknowledgedAt:string|null};
export type MonitoringCheck={changed:boolean;event:MonitoringEvent|null;checkedAt:string};
const mapTarget=(r:any):MonitoringTarget=>({id:String(r.id),name:String(r.name),url:String(r.url),intervalHours:Number(r.interval_hours),active:Boolean(r.active),lastCheckedAt:r.last_checked_at??null,nextCheckAt:r.next_check_at??null,createdAt:String(r.created_at)});
const mapEvent=(r:any):MonitoringEvent=>({id:String(r.id),targetId:String(r.target_id),eventType:String(r.event_type),severity:String(r.severity),title:String(r.title),summary:String(r.summary),evidence:r.evidence??{},detectedAt:String(r.detected_at),acknowledgedAt:r.acknowledged_at??null});
const stringArray=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const previousSnapshot=(row:any):MonitoringSnapshotInput|null=>row?{
  contentHash:String(row.content_hash),
  title:String(row.title??""),
  description:String(row.description??""),
  h1:stringArray(row.h1),
  h2:stringArray(row.h2),
  textExcerpt:String(row.text_excerpt??""),
  checkedAt:String(row.checked_at),
}:null;

export const listMonitoringTargets=createServerFn({method:"GET"}).middleware([requireAuth]).handler(async({context})=>{
  const {data,error}=await getDatabase().from("monitoring_targets").select("id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at").eq("user_id",context.userId).order("created_at",{ascending:false});
  if(error)throw new Error(error.message);return(data??[]).map(mapTarget);
});

export const createMonitoringTarget=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:{name:string;url:string;intervalHours?:number})=>i).handler(async({data,context})=>{
  const name=data.name.trim(),url=data.url.trim();if(!name||!url)throw new Error("اسم الموقع والرابط مطلوبان");
  const validation=validateTargetUrl(url);if(!validation.ok)throw new Error(validation.reason??"الرابط غير صالح.");
  const safeUrl=validation.url;if(!safeUrl)throw new Error("الرابط غير صالح.");
  const hours=Math.min(Math.max(Math.round(data.intervalHours??24),1),720);
  const {data:existing,error:existingError}=await getDatabase().from("monitoring_targets").select("id").eq("user_id",context.userId).eq("url",safeUrl).maybeSingle();
  if(existingError)throw new Error(existingError.message);if(existing)throw new Error("هذا الموقع موجود بالفعل ضمن المراقبة.");
  const {data:row,error}=await getDatabase().from("monitoring_targets").insert({user_id:context.userId,name,url:safeUrl,interval_hours:hours,active:true,next_check_at:new Date().toISOString()}).select("id,name,url,interval_hours,active,last_checked_at,next_check_at,created_at").single();
  if(error)throw new Error(error.message);return mapTarget(row);
});

export const deleteMonitoringTarget=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:{id:string})=>i).handler(async({data,context})=>{
  const db=getDatabase();
  const {error:snapshotsError}=await db.from("monitoring_snapshots").delete().eq("target_id",data.id).eq("user_id",context.userId);if(snapshotsError)throw new Error(snapshotsError.message);
  const {error:eventsError}=await db.from("monitoring_events").delete().eq("target_id",data.id).eq("user_id",context.userId);if(eventsError)throw new Error(eventsError.message);
  const {error}=await db.from("monitoring_targets").delete().eq("id",data.id).eq("user_id",context.userId);if(error)throw new Error(error.message);return{ok:true};
});

export const setMonitoringActive=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:{id:string;active:boolean})=>i).handler(async({data,context})=>{
  const patch=data.active?{active:true,next_check_at:new Date().toISOString()}:{active:false};
  const {error}=await getDatabase().from("monitoring_targets").update(patch).eq("id",data.id).eq("user_id",context.userId);if(error)throw new Error(error.message);return{ok:true};
});

export const listMonitoringEvents=createServerFn({method:"GET"}).middleware([requireAuth]).inputValidator((i:{limit?:number})=>i??{}).handler(async({data,context})=>{
  const limit=Math.min(Math.max(data.limit??50,1),100);
  const {data:rows,error}=await getDatabase().from("monitoring_events").select("id,target_id,event_type,severity,title,summary,evidence,detected_at,acknowledged_at").eq("user_id",context.userId).order("detected_at",{ascending:false}).limit(limit);
  if(error)throw new Error(error.message);return(rows??[]).map(mapEvent);
});

export const acknowledgeMonitoringEvent=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:{id:string})=>i).handler(async({data,context})=>{
  const {error}=await getDatabase().from("monitoring_events").update({acknowledged_at:new Date().toISOString()}).eq("id",data.id).eq("user_id",context.userId);if(error)throw new Error(error.message);return{ok:true};
});

export const runMonitoringCheck=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:{id:string})=>i).handler(async({data,context}):Promise<MonitoringCheck>=>{
  const db=getDatabase();
  const {data:target,error:targetError}=await db.from("monitoring_targets").select("id,name,url,interval_hours,active").eq("id",data.id).eq("user_id",context.userId).maybeSingle();
  if(targetError)throw new Error(targetError.message);if(!target)throw new Error("هدف المراقبة غير موجود.");
  const next=new Date(Date.now()+Number(target.interval_hours)*3600000).toISOString();
  try{
    const current=await captureMonitoringSnapshot(String(target.url));
    const {data:previous,error:previousError}=await db.from("monitoring_snapshots").select("content_hash,title,description,h1,h2,text_excerpt,checked_at").eq("target_id",target.id).eq("user_id",context.userId).order("checked_at",{ascending:false}).limit(1).maybeSingle();
    if(previousError)throw new Error(previousError.message);
    const change=detectMonitoringChange(previousSnapshot(previous),current);
    const {error:insertError}=await db.from("monitoring_snapshots").insert({user_id:context.userId,target_id:target.id,content_hash:current.contentHash,title:current.title,description:current.description,h1:current.h1,h2:current.h2,text_excerpt:current.textExcerpt,checked_at:current.checkedAt});
    if(insertError)throw new Error(insertError.message);
    let event:MonitoringEvent|null=null;
    if(change.changed){
      const {data:row,error}=await db.from("monitoring_events").insert({user_id:context.userId,target_id:target.id,event_type:change.eventType,severity:change.severity,title:`${change.title}: ${String(target.name)}`,summary:change.summary,evidence:{...change.evidence,url:String(target.url),trigger:"manual"}}).select("id,target_id,event_type,severity,title,summary,evidence,detected_at,acknowledged_at").single();
      if(error)throw new Error(error.message);event=mapEvent(row);
    }
    const {error:updateError}=await db.from("monitoring_targets").update({last_checked_at:current.checkedAt,next_check_at:next}).eq("id",target.id).eq("user_id",context.userId);
    if(updateError)throw new Error(updateError.message);
    return{changed:change.changed,event,checkedAt:current.checkedAt};
  }catch(error){
    const checkedAt=new Date().toISOString();const message=error instanceof Error?error.message:"فشل فحص الموقع.";
    await db.from("monitoring_events").insert({user_id:context.userId,target_id:target.id,event_type:"error",severity:"high",title:`فشل فحص ${String(target.name)}`,summary:message.slice(0,500),evidence:{url:String(target.url),trigger:"manual"},detected_at:checkedAt});
    await db.from("monitoring_targets").update({last_checked_at:checkedAt,next_check_at:next}).eq("id",target.id).eq("user_id",context.userId);
    throw new Error(`فشل فحص ${String(target.name)}: ${message}`);
  }
});
