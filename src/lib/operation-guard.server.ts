import { getDatabase } from './database.server';
import { getCostPolicy, operationKey, utcDayStart } from './cost-policy.server';

export type AnalysisReservation =
  | { kind: 'started'; runId: string; cacheExpiresAt: string }
  | { kind: 'cached'; runId: string; result: Record<string, unknown>; cacheExpiresAt: string }
  | { kind: 'in-progress'; retryAfterSeconds: number }
  | { kind: 'burst-limited'; retryAfterSeconds: number }
  | { kind: 'daily-limited'; retryAfterSeconds: number };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function countRecent(userId: string, since: string, limit: number) {
  const { data, error } = await getDatabase()
    .from('operation_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('operation', 'analysis')
    .gte('created_at', since)
    .limit(limit);
  if (error) throw new Error(`Performance budget read failed: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

export async function reserveAnalysisOperation(input: {
  userId: string;
  inputHash: string;
  now?: Date;
}): Promise<AnalysisReservation> {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const policy = getCostPolicy();
  const db = getDatabase();

  const { data: cached, error: cacheError } = await db
    .from('operation_runs')
    .select('id,result_json,expires_at')
    .eq('user_id', input.userId)
    .eq('operation', 'analysis')
    .eq('input_hash', input.inputHash)
    .eq('status', 'succeeded')
    .gte('expires_at', nowIso)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheError) throw new Error(`Analysis cache read failed: ${cacheError.message}`);
  const cachedResult = record(cached?.result_json);
  if (cached?.id && cachedResult) {
    return { kind: 'cached', runId: String(cached.id), result: cachedResult, cacheExpiresAt: String(cached.expires_at) };
  }

  const burstSince = new Date(now.getTime() - 60_000).toISOString();
  if (await countRecent(input.userId, burstSince, policy.analysisBurstLimit) >= policy.analysisBurstLimit) {
    return { kind: 'burst-limited', retryAfterSeconds: 60 };
  }

  if (await countRecent(input.userId, utcDayStart(now), policy.analysisDailyLimit) >= policy.analysisDailyLimit) {
    const tomorrow = Date.parse(utcDayStart(new Date(now.getTime() + 86_400_000)));
    return { kind: 'daily-limited', retryAfterSeconds: Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1000)) };
  }

  const key = operationKey(input.inputHash, now);
  const expiresAt = new Date(now.getTime() + policy.analysisCacheSeconds * 1000).toISOString();
  const { data: inserted, error: insertError } = await db
    .from('operation_runs')
    .insert({
      user_id: input.userId,
      operation: 'analysis',
      input_hash: input.inputHash,
      operation_key: key,
      status: 'running',
      cost_units: 1,
      expires_at: expiresAt,
      updated_at: nowIso,
    })
    .select('id')
    .single();

  if (!insertError && inserted?.id) return { kind: 'started', runId: String(inserted.id), cacheExpiresAt: expiresAt };

  const { data: existing, error: existingError } = await db
    .from('operation_runs')
    .select('id,status,result_json,expires_at')
    .eq('user_id', input.userId)
    .eq('operation', 'analysis')
    .eq('operation_key', key)
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Duplicate analysis lookup failed: ${existingError.message}`);
  if (existing?.status === 'succeeded') {
    const result = record(existing.result_json);
    if (result) return { kind: 'cached', runId: String(existing.id), result, cacheExpiresAt: String(existing.expires_at) };
  }
  if (existing?.id) return { kind: 'in-progress', retryAfterSeconds: 60 };
  throw new Error(`Analysis reservation failed: ${insertError?.message ?? 'unknown persistence error'}`);
}

export async function completeAnalysisOperation(userId: string, runId: string, result: Record<string, unknown>, now = new Date()) {
  const timestamp = now.toISOString();
  const { error } = await getDatabase()
    .from('operation_runs')
    .update({ status: 'succeeded', result_json: result, error_code: null, completed_at: timestamp, updated_at: timestamp })
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('operation', 'analysis')
    .eq('status', 'running');
  if (error) throw new Error(`Analysis cache write failed: ${error.message}`);
}

export async function failAnalysisOperation(userId: string, runId: string, errorCode: string, now = new Date()) {
  const timestamp = now.toISOString();
  const { error } = await getDatabase()
    .from('operation_runs')
    .update({ status: 'failed', error_code: errorCode.slice(0, 120), completed_at: timestamp, updated_at: timestamp })
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('operation', 'analysis')
    .eq('status', 'running');
  if (error) throw new Error(`Analysis failure ledger write failed: ${error.message}`);
}
