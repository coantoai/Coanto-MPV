import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/lib/database.server";
import { getServerConfig } from "@/lib/config.server";
import { captureMonitoringSnapshot, detectMonitoringChange, type MonitoringSnapshotInput } from "@/lib/monitoring-engine.server";

const MAX_TARGETS_PER_RUN = 20;
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
function authorized(request:Request){const expected=getServerConfig().monitoring.cronSecret;if(!expected)return false;const provided=request.headers.get("x-cron-secret")?.trim()||request.headers.get("authorization")?.replace(/^Bearer\s+/i,"").trim()||"";if(!provided)return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
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

async function checkTarget(target:{id:string;user_id:string;name:string;url:string;interval_hours:number}){
  const db=getDatabase();
  const nextCheckAt=new Date(Date.now()+Number(target.interval_hours)*3600000).toISOString();
  try{
    const current=await captureMonitoringSnapshot(target.url);
    const {data:previous,error:previousError}=await db.from("monitoring_snapshots").select("content_hash,title,description,h1,h2,text_excerpt,checked_at").eq("target_id",target.id).eq("user_id",target.user_id).order("checked_at",{ascending:false}).limit(1).maybeSingle();
    if(previousError)throw new Error(previousError.message);
    const change=detectMonitoringChange(previousSnapshot(previous),current);
    const {error:snapshotError}=await db.from("monitoring_snapshots").insert({user_id:target.user_id,target_id:target.id,content_hash:current.contentHash,title:current.title,description:current.description,h1:current.h1,h2:current.h2,text_excerpt:current.textExcerpt,checked_at:current.checkedAt});
    if(snapshotError)throw new Error(snapshotError.message);
    if(change.changed){
      const {error:eventError}=await db.from("monitoring_events").insert({user_id:target.user_id,target_id:target.id,event_type:change.eventType,severity:change.severity,title:`${change.title}: ${target.name}`,summary:change.summary,evidence:{...change.evidence,url:target.url,trigger:"scheduled"},detected_at:current.checkedAt});
      if(eventError)throw new Error(eventError.message);
    }
    const {error:updateError}=await db.from("monitoring_targets").update({last_checked_at:current.checkedAt,next_check_at:nextCheckAt}).eq("id",target.id).eq("user_id",target.user_id);
    if(updateError)throw new Error(updateError.message);
    return{id:target.id,ok:true,changed:change.changed,eventType:change.eventType,severity:change.severity,checkedAt:current.checkedAt};
  }catch(error){
    const checkedAt=new Date().toISOString();const message=error instanceof Error?error.message:"فشل الفحص الآلي.";
    await db.from("monitoring_events").insert({user_id:target.user_id,target_id:target.id,event_type:"error",severity:"high",title:`فشل فحص ${target.name}`,summary:message.slice(0,500),evidence:{url:target.url,trigger:"scheduled"},detected_at:checkedAt});
    await db.from("monitoring_targets").update({last_checked_at:checkedAt,next_check_at:nextCheckAt}).eq("id",target.id).eq("user_id",target.user_id);
    return{id:target.id,ok:false,changed:false,eventType:"error",severity:"high",checkedAt,error:message.slice(0,500)};
  }
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route=createFileRoute("/api/monitoring-cron")({server:{handlers:{GET:async({request})=>{
  if(!authorized(request))return json({error:"Unauthorized"},401);
  const db=getDatabase();const now=new Date().toISOString();
  const {data:targets,error}=await db.from("monitoring_targets").select("id,user_id,name,url,interval_hours").eq("active",true).or(`next_check_at.is.null,next_check_at.lte.${now}`).order("next_check_at",{ascending:true,nullsFirst:true}).limit(MAX_TARGETS_PER_RUN);
  if(error)return json({error:error.message},500);
  const rows=(targets??[]).map((raw:any)=>({id:String(raw.id),user_id:String(raw.user_id),name:String(raw.name),url:String(raw.url),interval_hours:Number(raw.interval_hours)}));
  const results=[];for(let i=0;i<rows.length;i+=4){results.push(...await Promise.all(rows.slice(i,i+4).map(checkTarget)));}
  return json({ok:true,checkedAt:new Date().toISOString(),selected:results.length,changed:results.filter(item=>item.changed).length,failed:results.filter(item=>!item.ok).length,highSeverity:results.filter(item=>item.severity==="high").length,results});
}}}});
