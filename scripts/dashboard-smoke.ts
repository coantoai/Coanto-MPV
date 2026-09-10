import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const dashboardFunctions=await readFile(join(root,'src','lib','dashboard.functions.ts'),'utf8');
const dashboardUi=await readFile(join(root,'src','components','DashboardHome.tsx'),'utf8');
const indexRoute=await readFile(join(root,'src','routes','index.tsx'),'utf8');
const analysisRoute=await readFile(join(root,'src','routes','analysis.tsx'),'utf8');
const violations:string[]=[];

if(!dashboardFunctions.includes('requireAuth'))violations.push('dashboard data must require authentication');
if(!dashboardFunctions.includes("eq('user_id', context.userId)"))violations.push('dashboard queries must remain tenant scoped');
for(const table of ['competitors','monitoring_targets','monitoring_events','business_insights','decisions','analyses','analysis_evidence_links','business_metrics']){
  if(!dashboardFunctions.includes(`from('${table}')`))violations.push(`dashboard missing ${table} aggregation`);
}
if(!dashboardFunctions.includes('getBusinessContext'))violations.push('dashboard missing persisted business context');
if(!dashboardUi.includes('topDecision'))violations.push('dashboard missing top decision');
if(!dashboardUi.includes('changes'))violations.push('dashboard missing change feed');
if(!dashboardUi.includes('insights'))violations.push('dashboard missing intelligence feed');
if(!dashboardUi.includes('verifiedEvidenceLinks'))violations.push('dashboard missing evidence coverage');
if(!dashboardUi.includes('patterns30d'))violations.push('dashboard missing cross-competitor patterns');
if(!dashboardUi.includes("to:'/analysis'"))violations.push('dashboard missing analysis action');
if(!indexRoute.includes('DashboardHome'))violations.push('root route is not the command center');
if(!analysisRoute.includes('CoantoApp'))violations.push('full analysis workspace was not preserved');

if(violations.length){console.error('DASHBOARD_SMOKE_FAILED');for(const violation of violations)console.error(`- ${violation}`);process.exit(1);}
console.log('DASHBOARD_SMOKE_OK');
