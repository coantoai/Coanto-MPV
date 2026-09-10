import { readFile } from 'node:fs/promises';

const baseUrl = (process.env.INSFORGE_URL ?? '').trim().replace(/\/$/, '');
const apiKey = (process.env.INSFORGE_API_KEY ?? '').trim();
const migrationsToApply = [
  { version: '20260909073000', name: 'coanto-evidence', file: '../migrations/20260909073000_coanto_evidence.sql' },
  { version: '20260910160500', name: 'coanto-app-data', file: '../migrations/20260910160500_coanto_app_data.sql' },
  { version: '20260910182000', name: 'business-context', file: '../migrations/20260910182000_business_context.sql' },
  { version: '20260910190000', name: 'competitor-discovery', file: '../migrations/20260910190000_competitor_discovery.sql' },
  { version: '20260910204500', name: 'analysis-evidence-links', file: '../migrations/20260910204500_analysis_evidence_links.sql' },
  { version: '20260910211000', name: 'monitoring-change-detection', file: '../migrations/20260910211000_monitoring_change_detection.sql' },
  { version: '20260910212500', name: 'monitoring-event-intelligence', file: '../migrations/20260910212500_monitoring_event_intelligence.sql' },
] as const;

if (!baseUrl) throw new Error('INSFORGE_URL is missing.');
if (!apiKey) throw new Error('INSFORGE_API_KEY is missing.');
if (!/^https?:\/\//i.test(baseUrl)) throw new Error('INSFORGE_URL must be an HTTP(S) URL.');
if (!apiKey.startsWith('ik_')) throw new Error('INSFORGE_API_KEY is not an InsForge project API key (expected ik_ prefix).');

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const text = await response.text(); let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) { const detail = typeof body === 'string' ? body : JSON.stringify(body); throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 800)}`); }
  return body;
}

async function applyMigrations() {
  const migrations = (await request('/api/database/migrations')) as { migrations?: Array<{ version?: string }> };
  const applied = new Set((migrations.migrations ?? []).map((m) => m.version));
  for (const migration of migrationsToApply) {
    if (applied.has(migration.version)) { console.log(`INSFORGE_SCHEMA_ALREADY_APPLIED:${migration.version}`); continue; }
    const sql = await readFile(new URL(migration.file, import.meta.url), 'utf8');
    await request('/api/database/migrations', { method: 'POST', body: JSON.stringify({ version: migration.version, name: migration.name, sql }) });
    console.log(`INSFORGE_SCHEMA_APPLIED:${migration.version}`);
  }
}
async function assertTable(table:string){const rows=await request(`/api/database/records/${table}?select=*&limit=1`);if(!Array.isArray(rows))throw new Error(`${table} query did not return an array.`)}

async function main() {
  await request('/api/deployments/metadata'); console.log('INSFORGE_AUTH_OK'); await applyMigrations();
  for (const table of ['coanto_evidence','coanto_claims','coanto_evidence_graph_snapshots','analysis_evidence_links','analyses','memory_items','monitoring_targets','monitoring_snapshots','monitoring_events','business_metrics','business_insights','business_contexts','competitors']) await assertTable(table);
  console.log('INSFORGE_SCHEMA_OK');

  const probeId=`insforge_probe_${Date.now()}`;
  const evidenceProbe=await request('/api/database/records/coanto_evidence',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{id:probeId,kind:'calculation',source_url:'https://example.com/insforge-probe',source_domain:'example.com',source_group:'coanto-ci-probe',observed_at:new Date().toISOString(),retrieved_at:new Date().toISOString(),content:'COANTO InsForge connectivity probe.',content_hash:'a'.repeat(64),status:'VERIFIED',metadata:{probe:true,source:'github-actions'}}])}) as Array<{id?:string}>;
  if(!Array.isArray(evidenceProbe)||!evidenceProbe.some(row=>row?.id===probeId))throw new Error('InsForge evidence persistence probe failed.');

  const tenantId=`ci-tenant-${Date.now()}`;
  const analysisProbe=await request('/api/database/records/analyses',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,store_url:'https://example.com',result_json:{probe:true}}])}) as Array<{id?:string}>;
  const analysisId=analysisProbe?.[0]?.id;if(!analysisId)throw new Error('InsForge analysis persistence probe failed.');

  const ledgerProbe=await request('/api/database/records/analysis_evidence_links',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,analysis_id:analysisId,evidence_id:probeId,role:'baseline'}])}) as Array<{user_id?:string;analysis_id?:string;evidence_id?:string}>;
  if(!Array.isArray(ledgerProbe)||ledgerProbe[0]?.user_id!==tenantId||ledgerProbe[0]?.analysis_id!==analysisId||ledgerProbe[0]?.evidence_id!==probeId)throw new Error('InsForge analysis evidence ledger probe failed.');

  const contextProbe=await request('/api/database/records/business_contexts',{method:'POST',headers:{Prefer:'return=representation,resolution=merge-duplicates'},body:JSON.stringify([{user_id:tenantId,business_name:'COANTO CI Shop',website_url:'https://example.com/',industry:'ecommerce',business_model:'ecommerce',company_stage:'growing',primary_market:'Lebanon',target_markets:['Lebanon'],target_customer:'Online shoppers',value_proposition:'Verified competitive intelligence',products_services:['Commerce'],competitive_goals:['competitor-discovery'],known_competitors:[],preferred_language:'ar',currency:'USD',onboarding_completed_at:new Date().toISOString()}])}) as Array<{user_id?:string}>;
  if(!Array.isArray(contextProbe)||contextProbe[0]?.user_id!==tenantId)throw new Error('InsForge business context persistence probe failed.');

  const competitorProbe=await request('/api/database/records/competitors',{method:'POST',headers:{Prefer:'return=representation,resolution=merge-duplicates'},body:JSON.stringify([{user_id:tenantId,domain:'competitor.example.com',name:'CI Competitor',url:'https://competitor.example.com',source_type:'direct-site',verification_status:'verified',relevance_score:88,rank:1,reason:'CI verified competitor probe',evidence:['direct-site'],last_seen_at:new Date().toISOString()}])}) as Array<{user_id?:string}>;
  if(!Array.isArray(competitorProbe)||competitorProbe[0]?.user_id!==tenantId)throw new Error('InsForge competitor persistence probe failed.');

  const targetProbe=await request('/api/database/records/monitoring_targets',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,name:'CI Monitored Competitor',url:'https://competitor.example.com/',interval_hours:24,active:true,next_check_at:new Date().toISOString()}])}) as Array<{id?:string;user_id?:string}>;
  const targetId=targetProbe?.[0]?.id;if(!targetId||targetProbe[0]?.user_id!==tenantId)throw new Error('InsForge monitoring target persistence probe failed.');
  const now=new Date().toISOString();
  const snapshotProbe=await request('/api/database/records/monitoring_snapshots',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([
    {user_id:tenantId,target_id:targetId,content_hash:'b'.repeat(64),title:'Before',description:'Old message',h1:['Products'],h2:['Shoes'],text_excerpt:'Price $100',checked_at:now},
    {user_id:tenantId,target_id:targetId,content_hash:'c'.repeat(64),title:'After',description:'New message',h1:['Products'],h2:['Shoes'],text_excerpt:'Price $120',checked_at:new Date(Date.now()+1000).toISOString()},
  ])}) as Array<{id?:string}>;
  const previousSnapshotId=snapshotProbe?.[0]?.id,currentSnapshotId=snapshotProbe?.[1]?.id;
  if(!previousSnapshotId||!currentSnapshotId)throw new Error('InsForge structured monitoring snapshot probe failed.');
  const eventProbe=await request('/api/database/records/monitoring_events',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{user_id:tenantId,target_id:targetId,event_type:'price-change',severity:'high',change_key:`${targetId}:ci-change`,change_score:95,previous_snapshot_id:previousSnapshotId,current_snapshot_id:currentSnapshotId,title:'CI price change',summary:'Price changed from $100 to $120.',evidence:{probe:true},detected_at:new Date().toISOString()}])}) as Array<{id?:string;change_score?:number;change_key?:string}>;
  if(!eventProbe?.[0]?.id||eventProbe[0]?.change_score!==95||!eventProbe[0]?.change_key)throw new Error('InsForge monitoring event intelligence probe failed.');

  const tenantRows=await request(`/api/database/records/analyses?user_id=eq.${encodeURIComponent(tenantId)}&select=id,user_id&limit=5`) as Array<{user_id?:string}>;
  if(!Array.isArray(tenantRows)||tenantRows.some(row=>row.user_id!==tenantId))throw new Error('InsForge tenant isolation query probe failed.');
  const ledgerRows=await request(`/api/database/records/analysis_evidence_links?user_id=eq.${encodeURIComponent(tenantId)}&analysis_id=eq.${encodeURIComponent(analysisId)}&select=user_id,analysis_id,evidence_id&limit=5`) as Array<{user_id?:string;evidence_id?:string}>;
  if(!Array.isArray(ledgerRows)||ledgerRows.length!==1||ledgerRows[0]?.user_id!==tenantId||ledgerRows[0]?.evidence_id!==probeId)throw new Error('InsForge evidence ledger tenant isolation probe failed.');
  const competitorRows=await request(`/api/database/records/competitors?user_id=eq.${encodeURIComponent(tenantId)}&select=user_id,domain&limit=5`) as Array<{user_id?:string}>;
  if(!Array.isArray(competitorRows)||competitorRows.length!==1||competitorRows[0]?.user_id!==tenantId)throw new Error('InsForge competitor tenant isolation probe failed.');
  const monitoringRows=await request(`/api/database/records/monitoring_events?user_id=eq.${encodeURIComponent(tenantId)}&target_id=eq.${encodeURIComponent(targetId)}&select=user_id,target_id,event_type,change_score&limit=5`) as Array<{user_id?:string;target_id?:string;event_type?:string;change_score?:number}>;
  if(!Array.isArray(monitoringRows)||monitoringRows.length!==1||monitoringRows[0]?.user_id!==tenantId||monitoringRows[0]?.change_score!==95)throw new Error('InsForge monitoring tenant isolation probe failed.');
  console.log('INSFORGE_READ_WRITE_OK');

  await request(`/api/database/records/monitoring_events?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/monitoring_snapshots?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/monitoring_targets?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/competitors?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/business_contexts?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/analysis_evidence_links?user_id=eq.${encodeURIComponent(tenantId)}`,{method:'DELETE'});
  await request(`/api/database/records/analyses?id=eq.${encodeURIComponent(analysisId)}`,{method:'DELETE'});
  await request(`/api/database/records/coanto_evidence?id=eq.${encodeURIComponent(probeId)}`,{method:'DELETE'});
  console.log('INSFORGE_DELETE_OK'); console.log('INSFORGE_INTEGRATION_OK');
}
await main();
