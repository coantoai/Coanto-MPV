import { getDatabase } from './database.server';
import { BILLING_PLANS, assertBillingPlanKey, assertBillingStatus, billingAccessMode, trialEndsAt, type BillingPlanKey, type BillingStatus, type NormalizedBillingEvent } from './billing-policy.server';

export type BillingAccount = {
  userId: string;
  planKey: BillingPlanKey;
  status: BillingStatus;
  provider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapAccount(row: Record<string, unknown>): BillingAccount {
  return {
    userId: String(row['user_id']),
    planKey: assertBillingPlanKey(String(row['plan_key'])),
    status: assertBillingStatus(String(row['status'])),
    provider: typeof row['provider'] === 'string' ? row['provider'] : null,
    providerCustomerId: typeof row['provider_customer_id'] === 'string' ? row['provider_customer_id'] : null,
    providerSubscriptionId: typeof row['provider_subscription_id'] === 'string' ? row['provider_subscription_id'] : null,
    trialStartedAt: typeof row['trial_started_at'] === 'string' ? row['trial_started_at'] : null,
    trialEndsAt: typeof row['trial_ends_at'] === 'string' ? row['trial_ends_at'] : null,
    currentPeriodStart: typeof row['current_period_start'] === 'string' ? row['current_period_start'] : null,
    currentPeriodEnd: typeof row['current_period_end'] === 'string' ? row['current_period_end'] : null,
    cancelAtPeriodEnd: Boolean(row['cancel_at_period_end']),
    lastEventAt: typeof row['last_event_at'] === 'string' ? row['last_event_at'] : null,
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

async function ensureFiniteTrial(account: BillingAccount): Promise<BillingAccount> {
  if (account.planKey !== 'trial' || account.trialEndsAt) return account;
  const start = account.trialStartedAt || account.createdAt;
  const expiresAt = trialEndsAt(start);
  const { error } = await getDatabase()
    .from('billing_accounts')
    .update({ trial_ends_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', account.userId)
    .is('trial_ends_at', null);
  if (error) throw new Error(`Billing trial backfill failed: ${error.message}`);
  return { ...account, trialEndsAt: expiresAt };
}

export async function getBillingAccount(userId: string): Promise<BillingAccount> {
  const db = getDatabase();
  const { data, error } = await db.from('billing_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Billing account read failed: ${error.message}`);
  if (data) return ensureFiniteTrial(mapAccount(data as Record<string, unknown>));

  const now = new Date().toISOString();
  const expiresAt = trialEndsAt(now);
  const { data: created, error: createError } = await db.from('billing_accounts').insert({
    user_id: userId,
    plan_key: 'trial',
    status: 'trialing',
    trial_started_at: now,
    trial_ends_at: expiresAt,
    updated_at: now,
  }).select('*').single();
  if (createError) {
    const { data: existing, error: retryError } = await db.from('billing_accounts').select('*').eq('user_id', userId).maybeSingle();
    if (retryError || !existing) throw new Error(`Billing account initialization failed: ${createError.message}`);
    return ensureFiniteTrial(mapAccount(existing as Record<string, unknown>));
  }
  return mapAccount(created as Record<string, unknown>);
}

export async function getBillingOverview(userId: string) {
  const account = await getBillingAccount(userId);
  const access = billingAccessMode(account.planKey, account.status, account.trialEndsAt);
  return {
    account,
    effectivePlan: access.plan,
    accessMode: access.mode,
    paymentAttentionRequired: access.paymentAttentionRequired,
    plan: BILLING_PLANS[access.plan],
    catalog: Object.values(BILLING_PLANS),
    gatewayConfigured: Boolean(account.provider),
  };
}

function validTimestamp(value: string) {
  return Number.isFinite(Date.parse(value));
}

export async function applyNormalizedBillingEvent(event: NormalizedBillingEvent) {
  if (!event.provider.trim() || !event.providerEventId.trim() || !event.userId.trim()) throw new Error('Incomplete normalized billing event.');
  if (!validTimestamp(event.occurredAt)) throw new Error('Invalid billing event timestamp.');
  if (event.currentPeriodStart && !validTimestamp(event.currentPeriodStart)) throw new Error('Invalid billing period start.');
  if (event.currentPeriodEnd && !validTimestamp(event.currentPeriodEnd)) throw new Error('Invalid billing period end.');

  const db = getDatabase();
  const eventRow = {
    user_id: event.userId,
    provider: event.provider.trim().toLowerCase(),
    provider_event_id: event.providerEventId.trim(),
    event_type: event.eventType,
    normalized_event: event,
    occurred_at: event.occurredAt,
  };

  let duplicate = false;
  const { error: eventError } = await db.from('billing_events').insert(eventRow);
  if (eventError) {
    const { data: existing, error: existingError } = await db.from('billing_events').select('id').eq('provider', eventRow.provider).eq('provider_event_id', eventRow.provider_event_id).maybeSingle();
    if (existingError) throw new Error(`Billing event idempotency lookup failed: ${existingError.message}`);
    if (!existing?.id) throw new Error(`Billing event persistence failed: ${eventError.message}`);
    duplicate = true;
  }

  const { data: current, error: currentError } = await db.from('billing_accounts').select('last_event_at').eq('user_id', event.userId).maybeSingle();
  if (currentError) throw new Error(`Billing projection read failed: ${currentError.message}`);
  const currentEventAt = typeof current?.last_event_at === 'string' ? Date.parse(current.last_event_at) : Number.NaN;
  const incomingEventAt = Date.parse(event.occurredAt);
  if (Number.isFinite(currentEventAt) && currentEventAt > incomingEventAt) return { applied: false, duplicate, stale: true };
  if (duplicate && Number.isFinite(currentEventAt) && currentEventAt === incomingEventAt) return { applied: false, duplicate: true, stale: false };

  const patch: Record<string, unknown> = {
    plan_key: event.planKey,
    status: event.status,
    provider: eventRow.provider,
    provider_customer_id: event.customerId ?? null,
    provider_subscription_id: event.subscriptionId ?? null,
    current_period_start: event.currentPeriodStart ?? null,
    current_period_end: event.currentPeriodEnd ?? null,
    cancel_at_period_end: event.cancelAtPeriodEnd ?? false,
    last_event_at: event.occurredAt,
    updated_at: new Date().toISOString(),
  };
  if (event.eventType === 'trial.started') {
    patch['trial_started_at'] = event.occurredAt;
    patch['trial_ends_at'] = event.currentPeriodEnd ?? trialEndsAt(event.occurredAt);
  }

  const { error: accountError } = await db.from('billing_accounts').upsert({ user_id: event.userId, ...patch }, { onConflict: 'user_id' });
  if (accountError) {
    if (accountError.message.toLowerCase().includes('stale billing event')) return { applied: false, duplicate, stale: true };
    throw new Error(`Billing account update failed: ${accountError.message}`);
  }
  return { applied: true, duplicate, stale: false };
}
