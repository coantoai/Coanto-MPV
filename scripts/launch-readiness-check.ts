import { evaluateLaunchReadiness } from '../src/lib/launch-readiness.server.ts';

const report = evaluateLaunchReadiness(process.env);
for (const check of report.checks) {
  const marker = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'BLOCK';
  console.log(`${marker} ${check.id}: ${check.message}`);
}
console.log('LAUNCH_READINESS_SUMMARY', JSON.stringify({
  mode: report.mode,
  ready: report.ready,
  blockers: report.blockers,
  warnings: report.warnings,
  configuredAiProviders: report.configuredAiProviders,
  configuredSearchProviders: report.configuredSearchProviders,
}));
if (!report.ready) process.exit(1);
