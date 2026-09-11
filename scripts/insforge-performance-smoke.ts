import { readFile } from 'node:fs/promises';

const baseUrl=(process.env.INSFORGE_URL??'').trim().replace(/\/$/,'');
const apiKey=(process.env.INSFORGE_API_KEY??'').trim();
const version='20260911031500';
if(!baseUrl||!apiKey)throw new Error('InsForge configuration required for performance persistence smoke.');

async function request(path:string,init:RequestInit={}){
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${apiKey}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})}});
  const text=await response.text();let body:unknown=text;try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`${init.method??'GET'} ${path} failed (${response.status}): ${typeof body==='string'?body.slice(0,500):JSON.stringify(body).slice(0,500)}`);
  return body;
}

const migrations=await request('/api/database/migrations') as {migrations?:Array<{version?:string}>};
if(!(migrations.migrations??[]).some(item=>item.version===version)){
  const sql=await readFile(new URL('../migrations/20260911031500_performance_cost_controls.sql',import.meta.url),'utf8');
  await request('/api/database/migrations',{method:'POST',body:JSON.stringify({version,name:'performance-cost-controls',sql})});
  console.log(`INSFORGE_SCHEMA_APPLIED:${version}`);
}else console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${version}`);

const tenantId=`ci-perf-${Date.now()}`;
const inputHash='e'.repeat(64);
const operationKey='f'.repeat(64);
try{
  const inserted=await request('/api/database/records/operation_runs',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{
    user_id:tenantId,
    operation:'analysis',
    input_hash:inputHash,
    operation_key:operationKey,
    status:'running',
    cost_units:1,
    expires_at:new Date(Date.now()+600000).toISOString(),
  }])}) as Array<{id?:string;user_id?:string;status?:string}>;
  const runId=inserted?.[0]?.id;
  if(!runId||inserted[0]?.user_id!==tenantId||inserted[0]?.status!=='running')throw new Error('Operation run insert failed.');

  let duplicateRejected=false;
  try{
    await request('/api/database/records/operation_runs',{method:'POST',body:JSON.stringify([{
      user_id:tenantId,
      operation:'analysis',
      input_hash:inputHash,
      operation_key:operationKey,
      status:'running',
      cost_units:1,
      expires_at:new Date(Date.now()+600000).toISOString(),
    }])});
  }catch{duplicateRejected=true;}
  if(!duplicateRejected)throw new Error('Duplicate operation key was not rejected.');

  await request(`/api/database/records/operation_runs?id=eq.${encodeURIComponent(runId)}&user_id=eq.${encodeURIComponent(tenantId)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'succeeded',result_json:{probe:true},completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  const rows=await request(`/api/database/records/operation_runs?user_id=eq.${encodeURIComponent(tenantId)}&operation=eq.analysis&input_hash=eq.${inputHash}&select=id,user_id,status,result_json,cost_units&limit=3`) as Array<{user_id?:string;status?:string;result_json?:{probe?:boolean};cost_units?:number}>;
  if(rows.length!==1||rows[0]?.user_id!==tenantId||rows[0]?.status!=='succeeded'||rows[0]?.result_json?.probe!==true||rows[0]?.cost_units!==1)throw new Error('Operation cache persistence or tenant query failed.');
  console.log('INSFORGE_PERFORMANCE_COST_OK');
}finally{
  await request(`/api/database/records/operation_runs?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
}
