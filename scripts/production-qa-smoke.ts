import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { trialDurationDays, trialEndsAt } from '../src/lib/billing-policy.server.ts';

const root=process.cwd();
const expect=(condition:unknown,message:string):asserts condition=>{if(!condition)throw new Error(message)};
const count=(source:string,pattern:RegExp)=>(source.match(pattern)??[]).length;

async function filesUnder(directory:string):Promise<string[]>{
  const entries=await readdir(directory,{withFileTypes:true});const files:string[]=[];
  for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())files.push(...await filesUnder(path));else files.push(path)}
  return files;
}

// 1) Every TanStack server function in the application layer must cross the auth boundary.
const libDir=join(root,'src','lib');
for(const name of await readdir(libDir)){
  if(!name.endsWith('.functions.ts'))continue;
  const source=await readFile(join(libDir,name),'utf8');
  const functions=count(source,/createServerFn\s*\(/g);
  if(!functions)continue;
  const guards=count(source,/\.middleware\(\[requireAuth\]\)/g);
  expect(/import\s*\{\s*requireAuth\s*\}\s*from\s*['"][^'"]*auth-middleware['"]/.test(source),`${name}: requireAuth import missing.`);
  expect(guards===functions,`${name}: expected ${functions} authenticated server functions, found ${guards}.`);
  expect(source.includes('context.userId'),`${name}: authenticated user id is never consumed.`);
}

// 2) Critical HTTP boundaries must authenticate/authorize and reject cross-site mutation.
const apiDir=join(root,'src','routes','api');
const authApi=await readFile(join(apiDir,'auth.ts'),'utf8');
const analyzeApi=await readFile(join(apiDir,'analyze.ts'),'utf8');
const contextApi=await readFile(join(apiDir,'business-context.ts'),'utf8');
const competitorsApi=await readFile(join(apiDir,'competitors.ts'),'utf8');
const cronApi=await readFile(join(apiDir,'monitoring-cron.ts'),'utf8');
const readyApi=await readFile(join(apiDir,'ready.ts'),'utf8');
expect(authApi.includes('guardSameOriginMutation')&&authApi.includes('checkAuthRateLimit'),'Auth API mutation or brute-force boundary missing.');
expect(analyzeApi.includes('guardSameOriginMutation')&&analyzeApi.includes('getUserIdFromRequest')&&analyzeApi.includes('reserveAnalysisOperation'),'Analyze API production boundary incomplete.');
expect(contextApi.includes('authenticateRequest')&&contextApi.includes('guardSameOriginMutation'),'Business-context API auth/CSRF boundary incomplete.');
expect(competitorsApi.includes('authenticateRequest')&&competitorsApi.includes('guardSameOriginMutation'),'Competitors API auth/CSRF boundary incomplete.');
expect(cronApi.includes('timingSafeEqual')&&cronApi.includes("process.env['CRON_SECRET']")&&cronApi.includes('apiSecurityHeaders'),'Monitoring cron authorization/header boundary incomplete.');
expect(readyApi.includes("from('business_contexts')")&&readyApi.includes('503')&&readyApi.includes("insforge: 'unavailable'"),'Readiness endpoint must fail closed when persistence is unavailable.');

// 3) Expensive operations must remain single-flight across minute boundaries.
const operationGuard=await readFile(join(libDir,'operation-guard.server.ts'),'utf8');
const operationMigration=await readFile(join(root,'migrations','20260911062500_operation_running_dedupe.sql'),'utf8');
expect(operationGuard.includes('expireStaleRunning')&&operationGuard.includes('activeRunning'),'In-flight analysis dedupe/expiry guard missing.');
expect(operationMigration.includes('operation_runs_single_running_input_idx')&&operationMigration.includes("where status = 'running'"),'Database single-flight invariant missing.');

// 4) Billing must have finite trials, event idempotency, and monotonic event ordering.
expect(trialDurationDays({} as NodeJS.ProcessEnv)===14,'Default trial lifetime must be explicit and finite.');
expect(trialEndsAt('2026-09-11T00:00:00.000Z',{} as NodeJS.ProcessEnv)==='2026-09-25T00:00:00.000Z','Trial expiry calculation changed unexpectedly.');
const billingService=await readFile(join(libDir,'billing.server.ts'),'utf8');
const billingMigration=await readFile(join(root,'migrations','20260911054500_billing_state.sql'),'utf8');
const billingOrderMigration=await readFile(join(root,'migrations','20260911062000_billing_event_ordering.sql'),'utf8');
expect(billingService.includes('trial_ends_at: expiresAt')&&billingService.includes('last_event_at'),'Billing projection is missing finite-trial or ordering state.');
expect(billingMigration.includes('unique (provider, provider_event_id)'),'Billing provider-event idempotency constraint missing.');
expect(billingOrderMigration.includes('coanto_guard_billing_event_order')&&billingOrderMigration.includes('stale billing event'),'Billing monotonic event trigger missing.');

// 5) Migration versions must be unique and no browser module may hardcode local production endpoints.
const migrationNames=(await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql'));
const versions=migrationNames.map(name=>name.split('_')[0]);
expect(new Set(versions).size===versions.length,'Duplicate migration version detected.');

const browserFiles=[...await filesUnder(join(root,'src','components')),...await filesUnder(join(root,'src','routes'))].filter(path=>path.endsWith('.tsx'));
const browserViolations:string[]=[];
for(const path of browserFiles){
  const source=await readFile(path,'utf8');
  if(/https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(source))browserViolations.push(`${path}: hard-coded local URL`);
  if(source.includes('dangerouslySetInnerHTML'))browserViolations.push(`${path}: dangerouslySetInnerHTML`);
}
expect(browserViolations.length===0,`Browser production violations: ${browserViolations.join(', ')}`);

// 6) Critical product routes must exist before launch.
const routeNames=new Set(await readdir(join(root,'src','routes')));
for(const route of ['index.tsx','analysis.tsx','onboarding.tsx','competitors.tsx','monitoring.tsx','business-intelligence.tsx','decision.tsx','alerts.tsx','reports.tsx','pricing.tsx','billing.tsx','auth.tsx']){
  expect(routeNames.has(route),`Critical route missing: ${route}`);
}

console.log('PRODUCTION_QA_SMOKE_OK',JSON.stringify({
  authenticatedServerFunctionFiles:true,
  protectedApiBoundaries:true,
  singleFlightAnalysis:true,
  finiteTrials:true,
  orderedBillingEvents:true,
  uniqueMigrations:true,
  browserProductionViolations:0,
  readinessEndpoint:true,
}));
