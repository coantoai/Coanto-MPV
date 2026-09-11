import { readFile } from 'node:fs/promises';
import { checkAuthRateLimit, clearSubjectAuthFailures, recordAuthFailure, AUTH_THROTTLE_POLICY } from '../src/lib/auth-rate-limit.server.ts';

const baseUrl=(process.env.INSFORGE_URL??'').trim().replace(/\/$/,'');
const apiKey=(process.env.INSFORGE_API_KEY??'').trim();
const version='20260911063500';
if(!baseUrl||!apiKey)throw new Error('InsForge configuration required for auth throttle smoke.');

async function request(path:string,init:RequestInit={}){
  const response=await fetch(`${baseUrl}${path}`,{...init,headers:{Authorization:`Bearer ${apiKey}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})}});
  const text=await response.text();let body:unknown=text;try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok)throw new Error(`${init.method??'GET'} ${path} failed (${response.status}): ${typeof body==='string'?body.slice(0,500):JSON.stringify(body).slice(0,500)}`);
  return body;
}

const migrations=await request('/api/database/migrations') as {migrations?:Array<{version?:string}>};
if(!(migrations.migrations??[]).some(item=>item.version===version)){
  const sql=await readFile(new URL('../migrations/20260911063500_auth_rate_limit.sql',import.meta.url),'utf8');
  await request('/api/database/migrations',{method:'POST',body:JSON.stringify({version,name:'auth-rate-limit',sql})});
  console.log(`INSFORGE_SCHEMA_APPLIED:${version}`);
}else console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${version}`);

let last:unknown;
for(let attempt=0;attempt<12;attempt+=1){
  try{await request('/api/database/records/auth_failures?select=id&limit=1');last=null;break}catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,250));}
}
if(last)throw last;

const email=`ci-auth-${Date.now()}@example.com`;
const authRequest=new Request('https://coanto.com/api/auth',{method:'POST',headers:{'x-real-ip':'203.0.113.42'}});
try{
  const initial=await checkAuthRateLimit(email,'signin',authRequest);
  if(!initial.allowed)throw new Error('Fresh authentication subject was unexpectedly limited.');
  for(let i=0;i<AUTH_THROTTLE_POLICY.subjectLimit;i+=1)await recordAuthFailure(email,'signin',authRequest);
  const blocked=await checkAuthRateLimit(email,'signin',authRequest);
  if(blocked.allowed||blocked.retryAfterSeconds!==AUTH_THROTTLE_POLICY.windowSeconds)throw new Error('Subject auth throttle did not activate.');
  await clearSubjectAuthFailures(email,authRequest);
  const recovered=await checkAuthRateLimit(email,'signin',authRequest);
  if(!recovered.allowed)throw new Error('Auth throttle did not clear after successful-auth cleanup.');
  console.log('INSFORGE_AUTH_THROTTLE_OK');
}finally{
  try{await clearSubjectAuthFailures(email,authRequest)}catch{}
}
