import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const coreDir = join(root, 'src', 'lib');
const violations: string[] = [];

for (const name of await readdir(coreDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(coreDir, name), 'utf8');
  if (text.includes('supabase')) violations.push(`${name}: Supabase runtime coupling`);
  if (text.includes('context.supabase')) violations.push(`${name}: legacy Supabase data context`);
  if (text.includes('supabaseAdmin')) violations.push(`${name}: legacy Supabase admin persistence`);
}

const apiDir = join(root, 'src', 'routes', 'api');
for (const name of await readdir(apiDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = await readFile(join(apiDir, name), 'utf8');
  if (text.includes('supabase')) violations.push(`api/${name}: Supabase runtime coupling`);
}

const analyze = await readFile(join(apiDir, 'analyze.ts'), 'utf8');
if (!analyze.includes('@/lib/analysis-persistence.server')) violations.push('api/analyze.ts: missing persistence boundary');
if (!analyze.includes('getBusinessContext')) violations.push('api/analyze.ts: missing persisted business context');
if (!analyze.includes('ONBOARDING_REQUIRED')) violations.push('api/analyze.ts: missing onboarding completion gate');

const persistence = await readFile(join(coreDir, 'analysis-persistence.server.ts'), 'utf8');
if (!persistence.includes('@insforge/sdk')) violations.push('analysis-persistence.server.ts: InsForge adapter missing');

const auth = await readFile(join(coreDir, 'auth.server.ts'), 'utf8');
if (!auth.includes('@insforge/sdk')) violations.push('auth.server.ts: InsForge auth adapter missing');

const businessContext = await readFile(join(coreDir, 'business-context.server.ts'), 'utf8');
if (!businessContext.includes("from './database.server'")) violations.push('business-context.server.ts: missing central database boundary');
if (!businessContext.includes("from('business_contexts')")) violations.push('business-context.server.ts: missing durable business_contexts persistence');
if (!businessContext.includes('validateTargetUrl')) violations.push('business-context.server.ts: website validation missing');

const contextApi = await readFile(join(apiDir, 'business-context.ts'), 'utf8');
if (!contextApi.includes('authenticateRequest')) violations.push('api/business-context.ts: authentication boundary missing');
if (!contextApi.includes('saveBusinessContext')) violations.push('api/business-context.ts: save boundary missing');

const onboardingRoute = await readFile(join(root, 'src', 'routes', 'onboarding.tsx'), 'utf8');
if (!onboardingRoute.includes('/api/business-context')) violations.push('onboarding.tsx: business context API integration missing');

const authRoute = await readFile(join(root, 'src', 'routes', 'auth.tsx'), 'utf8');
if (!authRoute.includes('/onboarding')) violations.push('auth.tsx: onboarding routing missing');

const migration = await readFile(join(root, 'migrations', '20260910182000_business_context.sql'), 'utf8');
if (!migration.includes('business_contexts')) violations.push('business context migration missing table');
if (!migration.includes('user_id text primary key')) violations.push('business context migration missing tenant uniqueness');

const monitoringRunner = await readFile(join(coreDir, 'monitoring-runner.server.ts'), 'utf8');
if (!monitoringRunner.includes('detectMonitoringChange')) violations.push('monitoring runner: deterministic change engine missing');
if (!monitoringRunner.includes("from('monitoring_snapshots')")) violations.push('monitoring runner: durable snapshots missing');
if (!monitoringRunner.includes("from('monitoring_events')")) violations.push('monitoring runner: durable events missing');
if (!monitoringRunner.includes('change_key') || !monitoringRunner.includes('change_score')) violations.push('monitoring runner: dedupe/significance persistence missing');

const monitoringFunctions = await readFile(join(coreDir, 'monitoring.functions.ts'), 'utf8');
if (!monitoringFunctions.includes('executeMonitoringCheck')) violations.push('monitoring functions: shared monitoring runner missing');
const monitoringCron = await readFile(join(apiDir, 'monitoring-cron.ts'), 'utf8');
if (!monitoringCron.includes('executeMonitoringCheck')) violations.push('monitoring cron: shared monitoring runner missing');

const monitoringMigration = await readFile(join(root, 'migrations', '20260910212500_monitoring_event_intelligence.sql'), 'utf8');
if (!monitoringMigration.includes('change_key')) violations.push('monitoring event migration: change_key missing');
if (!monitoringMigration.includes('change_score')) violations.push('monitoring event migration: change_score missing');
if (!monitoringMigration.includes('previous_snapshot_id') || !monitoringMigration.includes('current_snapshot_id')) violations.push('monitoring event migration: snapshot lineage missing');

const intelligenceEngine = await readFile(join(coreDir, 'intelligence-engine.server.ts'), 'utf8');
if (!intelligenceEngine.includes('buildCompetitiveIntelligence')) violations.push('intelligence engine: deterministic builder missing');
if (!intelligenceEngine.includes('price-change') || !intelligenceEngine.includes('offer-change') || !intelligenceEngine.includes('product-change') || !intelligenceEngine.includes('messaging-change')) violations.push('intelligence engine: commercial signal classes missing');
if (!intelligenceEngine.includes('eventEvidence')) violations.push('intelligence engine: evidence lineage missing');
if (!intelligenceEngine.includes('buildPatterns')) violations.push('intelligence engine: cross-competitor patterns missing');
if (!intelligenceEngine.includes("'change'")) violations.push('intelligence engine: legacy monitoring compatibility missing');

const businessIntelligence = await readFile(join(coreDir, 'business-intelligence.functions.ts'), 'utf8');
if (!businessIntelligence.includes('buildCompetitiveIntelligence')) violations.push('business intelligence: shared intelligence engine missing');
if (!businessIntelligence.includes('change_score')) violations.push('business intelligence: significance score ingestion missing');
if (!businessIntelligence.includes("from('business_metrics')") || !businessIntelligence.includes("from('business_insights')")) violations.push('business intelligence: durable persistence missing');
if (!businessIntelligence.includes('getBusinessContext')) violations.push('business intelligence: business context personalization missing');

const decisionEngine = await readFile(join(coreDir, 'decision-engine.server.ts'), 'utf8');
if (!decisionEngine.includes('buildDecisions')) violations.push('decision engine: deterministic builder missing');
if (!decisionEngine.includes('missing-evidence')) violations.push('decision engine: evidence gate missing');
if (!decisionEngine.includes('low-confidence')) violations.push('decision engine: confidence gate missing');
if (!decisionEngine.includes('stableDecisionKey')) violations.push('decision engine: duplicate-safe identity missing');

const decisionFunctions = await readFile(join(coreDir, 'decision.functions.ts'), 'utf8');
if (!decisionFunctions.includes('buildDecisions')) violations.push('decision functions: shared decision engine missing');
if (!decisionFunctions.includes("from('decisions')")) violations.push('decision functions: durable decision persistence missing');
if (!decisionFunctions.includes("eq('user_id',context.userId)")) violations.push('decision functions: tenant scoping missing');
if (!decisionFunctions.includes('refreshDecisionEngine')) violations.push('decision functions: refresh boundary missing');

const decisionMigration = await readFile(join(root, 'migrations', '20260910221000_decision_engine.sql'), 'utf8');
if (!decisionMigration.includes('create table if not exists public.decisions')) violations.push('decision migration: decisions table missing');
if (!decisionMigration.includes('unique (user_id, decision_key)')) violations.push('decision migration: tenant decision uniqueness missing');
if (!decisionMigration.includes('evidence_count') || !decisionMigration.includes('evidence jsonb')) violations.push('decision migration: evidence lineage missing');

const alertsEngine = await readFile(join(coreDir, 'alerts-reports.server.ts'), 'utf8');
if (!alertsEngine.includes('buildAlertCandidates')) violations.push('alerts engine: deterministic alert builder missing');
if (!alertsEngine.includes('buildExecutiveDigest')) violations.push('reports engine: executive digest builder missing');
if (!alertsEngine.includes('evidenceCount < 1')) violations.push('alerts engine: decision evidence gate missing');
if (!alertsEngine.includes('!evidence.length')) violations.push('alerts engine: intelligence evidence gate missing');

const alertsFunctions = await readFile(join(coreDir, 'alerts-reports.functions.ts'), 'utf8');
if (!alertsFunctions.includes('requireAuth')) violations.push('alerts functions: authentication boundary missing');
if (!alertsFunctions.includes("from('alerts')") || !alertsFunctions.includes("from('executive_reports')")) violations.push('alerts/reports: durable persistence missing');
if (!alertsFunctions.includes("eq('user_id', context.userId)")) violations.push('alerts/reports: tenant scoping missing');
if (!alertsFunctions.includes('refreshAlerts') || !alertsFunctions.includes('generateExecutiveReport')) violations.push('alerts/reports: refresh or report boundary missing');

const alertsMigration = await readFile(join(root, 'migrations', '20260910224000_alerts_reports.sql'), 'utf8');
if (!alertsMigration.includes('create table if not exists public.alerts')) violations.push('alerts migration: alerts table missing');
if (!alertsMigration.includes('create table if not exists public.executive_reports')) violations.push('alerts migration: executive reports table missing');
if (!alertsMigration.includes('unique (user_id, alert_key)') || !alertsMigration.includes('unique (user_id, report_key)')) violations.push('alerts migration: tenant dedupe constraints missing');

const alertsRoute = await readFile(join(root, 'src', 'routes', 'alerts.tsx'), 'utf8');
const reportsRoute = await readFile(join(root, 'src', 'routes', 'reports.tsx'), 'utf8');
if (!alertsRoute.includes('refreshAlerts') || !alertsRoute.includes('markAlertRead')) violations.push('alerts route: operational alert controls missing');
if (!reportsRoute.includes('generateExecutiveReport')) violations.push('reports route: report generation control missing');

if (violations.length) {
  console.error('ARCHITECTURE_SMOKE_FAILED');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('ARCHITECTURE_SMOKE_OK');