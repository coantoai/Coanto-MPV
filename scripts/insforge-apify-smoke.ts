import { readFile } from 'node:fs/promises';

const baseUrl=(process.env.INSFORGE_URL??'').trim().replace(/\/$/,'');
const apiKey=(process.env.INSFORGE_API_KEY??'').trim();
const version='20260910230000';
if(!baseUrl||!apiKey)throw new Error('InsForge configuration required for Apify persistence smoke.');

async function request(path:string,init:RequestInit={}){
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${apiKey}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})}});
  const text=await response.text();let body:unknown=text;try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`${init.method??'GET'} ${path} failed (${response.status}): ${typeof body==='string'?body.slice(0,500):JSON.stringify(body).slice(0,500)}`);
  return body;
}

const migrations=await request('/api/database/migrations') as {migrations?:Array<{version?:string}>};
if(!(migrations.migrations??[]).some(item=>item.version===version)){
  const sql=await readFile(new URL('../migrations/20260910230000_apify_acquisition.sql',import.meta.url),'utf8');
  await request('/api/database/migrations',{method:'POST',body:JSON.stringify({version,name:'apify-acquisition',sql})});
  console.log(`INSFORGE_SCHEMA_APPLIED:${version}`);
}else console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${version}`);

const tenantId=`ci-apify-${Date.now()}`;
const target=await request('/api/database/records/monitoring_targets',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,name:'Apify provenance probe',url:'https://example.com/',interval_hours:24,active:true,next_check_at:new Date().toISOString()}])}) as Array<{id?:string}>;
const targetId=target?.[0]?.id;if(!targetId)throw new Error('Apify provenance target insert failed.');
try{
  const snapshot=await request('/api/database/records/monitoring_snapshots',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,target_id:targetId,content_hash:'d'.repeat(64),title:'Apify probe',description:'Acquisition provenance',h1:['Probe'],h2:[],text_excerpt:'Public page observation',checked_at:new Date().toISOString(),acquisition_provider:'apify'}])}) as Array<{id?:string;acquisition_provider?:string}>;
  const snapshotId=snapshot?.[0]?.id;if(!snapshotId||snapshot[0]?.acquisition_provider!=='apify')throw new Error('Apify provenance snapshot persistence failed.');
  const rows=await request(`/api/database/records/monitoring_snapshots?user_id=eq.${encodeURIComponent(tenantId)}&target_id=eq.${encodeURIComponent(targetId)}&select=id,user_id,acquisition_provider&limit=2`) as Array<{user_id?:string;acquisition_provider?:string}>;
  if(rows.length!==1||rows[0]?.user_id!==tenantId||rows[0]?.acquisition_provider!=='apify')throw new Error('Apify provenance tenant query failed.');
  console.log('INSFORGE_APIFY_PROVENANCE_OK');
}finally{
  await request(`/api/database/records/monitoring_snapshots?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/monitoring_targets?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
}
