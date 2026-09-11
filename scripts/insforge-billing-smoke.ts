import { readFile } from 'node:fs/promises';

const baseUrl=(process.env.INSFORGE_URL??'').trim().replace(/\/$/,'');
const apiKey=(process.env.INSFORGE_API_KEY??'').trim();
const version='20260911054500';
if(!baseUrl||!apiKey)throw new Error('InsForge configuration required for billing persistence smoke.');

async function request(path:string,init:RequestInit={}){
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${apiKey}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})}});
  const text=await response.text();let body:unknown=text;try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`${init.method??'GET'} ${path} failed (${response.status}): ${typeof body==='string'?body.slice(0,500):JSON.stringify(body).slice(0,500)}`);
  return body;
}

const migrations=await request('/api/database/migrations') as {migrations?:Array<{version?:string}>};
if(!(migrations.migrations??[]).some(item=>item.version===version)){
  const sql=await readFile(new URL('../migrations/20260911054500_billing_state.sql',import.meta.url),'utf8');
  await request('/api/database/migrations',{method:'POST',body:JSON.stringify({version,name:'billing-state',sql})});
  console.log(`INSFORGE_SCHEMA_APPLIED:${version}`);
}else console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${version}`);

async function waitForTable(table:string){
  let last:unknown;
  for(let attempt=0;attempt<12;attempt+=1){
    try{return await request(`/api/database/records/${table}?select=*&limit=1`)}catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,250));}
  }
  throw last instanceof Error?last:new Error(`${table} did not become queryable.`);
}
await waitForTable('billing_accounts');await waitForTable('billing_events');

const tenantId=`ci-billing-${Date.now()}`;
const eventId=`evt-ci-${Date.now()}`;
try{
  const account=await request('/api/database/records/billing_accounts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,plan_key:'trial',status:'trialing',trial_started_at:new Date().toISOString()}])}) as Array<{user_id?:string;plan_key?:string;status?:string}>;
  if(account[0]?.user_id!==tenantId||account[0]?.plan_key!=='trial'||account[0]?.status!=='trialing')throw new Error('Billing account persistence failed.');
  const event=await request('/api/database/records/billing_events',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,provider:'ci-provider',provider_event_id:eventId,event_type:'trial.started',normalized_event:{planKey:'trial',status:'trialing'},occurred_at:new Date().toISOString()}])}) as Array<{user_id?:string;provider_event_id?:string}>;
  if(event[0]?.user_id!==tenantId||event[0]?.provider_event_id!==eventId)throw new Error('Billing event persistence failed.');
  const rows=await request(`/api/database/records/billing_accounts?user_id=eq.${encodeURIComponent(tenantId)}&select=user_id,plan_key,status,provider&limit=2`) as Array<{user_id?:string;plan_key?:string;status?:string}>;
  if(rows.length!==1||rows[0]?.user_id!==tenantId||rows[0]?.plan_key!=='trial')throw new Error('Billing tenant-scoped query failed.');
  console.log('INSFORGE_BILLING_OK');
}finally{
  await request(`/api/database/records/billing_events?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/billing_accounts?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
}
