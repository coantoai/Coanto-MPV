import { createHmac } from 'node:crypto';
import { getDatabase } from './database.server';
import { getServerConfig } from './config.server';

const WINDOW_MS = 15 * 60_000;
const SUBJECT_LIMIT = 8;
const NETWORK_LIMIT = 30;

type AuthAction = 'signin' | 'signup';

function secret() {
  return process.env['AUTH_RATE_LIMIT_SECRET']?.trim() || getServerConfig().insforge.apiKey;
}

function keyedHash(value: string) {
  return createHmac('sha256', secret()).update(value, 'utf8').digest('hex');
}

function networkHint(request: Request): string | null {
  const value = request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
  if (!value) return null;
  return value.slice(0, 128);
}

function hashes(email: string, request: Request) {
  const subjectHash = keyedHash(`email:${email.trim().toLowerCase()}`);
  const network = networkHint(request);
  return {
    subjectHash,
    networkHash: network ? keyedHash(`network:${network}`) : null,
  };
}

async function countFailures(column: 'subject_hash' | 'network_hash', value: string, since: string, limit: number, action?: AuthAction) {
  let query = getDatabase().from('auth_failures').select('id').eq(column, value).gte('attempted_at', since).limit(limit);
  if (action) query = query.eq('action', action);
  const { data, error } = await query;
  if (error) throw new Error(`Auth throttle read failed: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

export async function checkAuthRateLimit(email: string, action: AuthAction, request: Request, now = new Date()) {
  const { subjectHash, networkHash } = hashes(email, request);
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  if (await countFailures('subject_hash', subjectHash, since, SUBJECT_LIMIT, action) >= SUBJECT_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }
  if (networkHash && await countFailures('network_hash', networkHash, since, NETWORK_LIMIT) >= NETWORK_LIMIT) {
    return { allowed: false as const, retryAfterSeconds: Math.ceil(WINDOW_MS / 1000) };
  }
  return { allowed: true as const, subjectHash, networkHash };
}

export async function recordAuthFailure(email: string, action: AuthAction, request: Request) {
  const { subjectHash, networkHash } = hashes(email, request);
  const { error } = await getDatabase().from('auth_failures').insert({
    subject_hash: subjectHash,
    network_hash: networkHash,
    action,
    attempted_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Auth throttle write failed: ${error.message}`);
}

export async function clearSubjectAuthFailures(email: string, request: Request) {
  const { subjectHash } = hashes(email, request);
  const { error } = await getDatabase().from('auth_failures').delete().eq('subject_hash', subjectHash);
  if (error) throw new Error(`Auth throttle cleanup failed: ${error.message}`);
}

export const AUTH_THROTTLE_POLICY = {
  windowSeconds: WINDOW_MS / 1000,
  subjectLimit: SUBJECT_LIMIT,
  networkLimit: NETWORK_LIMIT,
};
