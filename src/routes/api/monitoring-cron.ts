import { createFileRoute } from '@tanstack/react-router';
import { timingSafeEqual } from 'node:crypto';
import { getDatabase } from '@/lib/database.server';
import { getServerConfig } from '@/lib/config.server';
import { executeMonitoringCheck } from '@/lib/monitoring-runner.server';
import { apiSecurityHeaders } from '@/lib/http-security.server';

const MAX_TARGETS_PER_RUN = 20;
const CONCURRENCY = 4;

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: apiSecurityHeaders(request, { 'content-type': 'application/json; charset=utf-8' }) });
}

function authorized(request: Request) {
  const expected = getServerConfig().monitoring.cronSecret;
  if (!expected) return false;
  const provided = request.headers.get('x-cron-secret')?.trim() || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function runMonitoringCron(request: Request) {
  if (!authorized(request)) return json(request, { error: 'Unauthorized' }, 401);
  const db = getDatabase();
  const now = new Date().toISOString();
  const { data: targets, error } = await db.from('monitoring_targets').select('id,user_id,name,url,interval_hours').eq('active', true).or(`next_check_at.is.null,next_check_at.lte.${now}`).order('next_check_at', { ascending: true, nullsFirst: true }).limit(MAX_TARGETS_PER_RUN);
  if (error) return json(request, { error: 'Monitoring target selection failed.' }, 500);

  const rows = (targets ?? []).map((raw: any) => ({
    id: String(raw.id),
    userId: String(raw.user_id),
    name: String(raw.name),
    url: String(raw.url),
    intervalHours: Number(raw.interval_hours),
  }));

  const results = [];
  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    results.push(...await Promise.all(rows.slice(index, index + CONCURRENCY).map((target) => executeMonitoringCheck(target, 'scheduled'))));
  }

  return json(request, {
    ok: true,
    checkedAt: new Date().toISOString(),
    selected: results.length,
    changed: results.filter((item) => item.changed).length,
    alertsCreated: results.filter((item) => item.alertCreated).length,
    duplicatesSuppressed: results.filter((item) => item.suppressedDuplicate).length,
    failed: results.filter((item) => !item.ok).length,
    highSeverity: results.filter((item) => item.severity === 'high').length,
    results: results.map(({ event, ...item }) => ({ ...item, eventId: event?.id ?? null })),
  });
}

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route = createFileRoute('/api/monitoring-cron')({
  server: {
    handlers: {
      GET: async ({ request }) => runMonitoringCron(request),
      POST: async ({ request }) => runMonitoringCron(request),
    },
  },
});
