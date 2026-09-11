import { readFile } from 'node:fs/promises';

const baseUrl=(process.env.INSFORGE_URL??'').trim().replace(/\/$/,'');
const apiKey=(process.env.INSFORGE_API_KEY??'').trim();
if(!baseUrl||!apiKey)throw new Error('InsForge configuration required for billing persistence smoke.');

async function request(path:string,init:RequestInit={}){
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${apiKey}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})}});
  const text=await response.text();let body:unknown=text;try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`${init.method??'GET'} ${path} failed (${response.status}): ${typeof body==='string'?body.slice(0,500):JSON.stringify(body).slice(0,500)}`);
  return body;
}

const requiredMigrations=[
  {version:'20260911054500',name:'billing-state',file:'../migrations/20260911054500_billing_state.sql'},
  {version:'20260911062000',name:'billing-event-ordering',file:'../migrations/20260911062000_billing_event_ordering.sql'},
];
for(const migration of requiredMigrations){
  const migrations=await request('/api/database/migrations') as {migrations?:Array<{version?:string}>};
  if(!(migrations.migrations??[]).some(item=>item.version===migration.version)){
    const sql=await readFile(new URL(migration.file,import.meta.url),'utf8');
    await request('/api/database/migrations',{method:'POST',body:JSON.stringify({version:migration.version,name:migration.name,sql})});
    console.log(`INSFORGE_SCHEMA_APPLIED:${migration.version}`);
  }else console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${migration.version}`);
}

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
const newer='2026-09-11T10:00:00.000Z';
const older='2026-09-11T09:00:00.000Z';
try{
  const account=await request('/api/database/records/billing_accounts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,plan_key:'starter',status:'active',provider:'ci-provider',last_event_at:newer,current_period_end:'2026-10-11T10:00:00.000Z'}])}) as Array<{user_id?:string;plan_key?:string;status?:string;last_event_at?:string}>;
  if(account[0]?.user_id!==tenantId||account[0]?.plan_key!=='starter'||account[0]?.status!=='active'||!account[0]?.last_event_at)throw new Error('Billing account persistence failed.');

  let staleRejected=false;
  try{
    await request(`/api/database/records/billing_accounts?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'PATCH',body:JSON.stringify({plan_key:'free',status:'expired',last_event_at:older})});
  }catch{staleRejected=true;}
  if(!staleRejected)throw new Error('Older billing event was allowed to regress account state.');

  const event=await request('/api/database/records/billing_events',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,provider:'ci-provider',provider_event_id:eventId,event_type:'subscription.activated',normalized_event:{planKey:'starter',status:'active'},occurred_at:newer}])}) as Array<{user_id?:string;provider_event_id?:string}>;
  if(event[0]?.user_id!==tenantId||event[0]?.provider_event_id!==eventId)throw new Error('Billing event persistence failed.');

  let duplicateRejected=false;
  try{
    await request('/api/database/records/billing_events',{method:'POST',body:JSON.stringify([{user_id:tenantId,provider:'ci-provider',provider_event_id:eventId,event_type:'subscription.activated',normalized_event:{planKey:'starter',status:'active'},occurred_at:newer}])});
  }catch{duplicateRejected=true;}
  if(!duplicateRejected)throw new Error('Duplicate provider billing event was not rejected.');

  const rows=await request(`/api/database/records/billing_accounts?user_id=eq.${encodeURIComponent(tenantId)}&select=user_id,plan_key,status,provider,last_event_at&limit=2`) as Array<{user_id?:string;plan_key?:string;status?:string;last_event_at?:string}>;
  if(rows.length!==1||rows[0]?.user_id!==tenantId||rows[0]?.plan_key!=='starter'||rows[0]?.status!=='active'||!rows[0]?.last_event_at)throw new Error('Billing tenant state or event ordering failed.');
  console.log('INSFORGE_BILLING_OK');
}finally{
  await request(`/api/database/records/billing_events?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/billing_accounts?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
}
