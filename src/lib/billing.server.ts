import { getDatabase } from './database.server';
import { BILLING_PLANS, assertBillingPlanKey, assertBillingStatus, billingAccessMode, type BillingPlanKey, type BillingStatus, type NormalizedBillingEvent } from './billing-policy.server';

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
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

export async function getBillingAccount(userId: string): Promise<BillingAccount> {
  const db = getDatabase();
  const { data, error } = await db.from('billing_accounts').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Billing account read failed: ${error.message}`);
  if (data) return mapAccount(data as Record<string, unknown>);

  const now = new Date().toISOString();
  const { data: created, error: createError } = await db.from('billing_accounts').insert({
    user_id: userId,
    plan_key: 'trial',
    status: 'trialing',
    trial_started_at: now,
    updated_at: now,
  }).select('*').single();
  if (createError) {
    const { data: existing, error: retryError } = await db.from('billing_accounts').select('*').eq('user_id', userId).maybeSingle();
    if (retryError || !existing) throw new Error(`Billing account initialization failed: ${createError.message}`);
    return mapAccount(existing as Record<string, unknown>);
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

export async function applyNormalizedBillingEvent(event: NormalizedBillingEvent) {
  if (!event.provider.trim() || !event.providerEventId.trim() || !event.userId.trim()) throw new Error('Incomplete normalized billing event.');
  const db = getDatabase();
  const eventRow = {
    user_id: event.userId,
    provider: event.provider.trim().toLowerCase(),
    provider_event_id: event.providerEventId.trim(),
    event_type: event.eventType,
    normalized_event: event,
    occurred_at: event.occurredAt,
  };
  const { error: eventError } = await db.from('billing_events').insert(eventRow);
  if (eventError) {
    const { data: existing, error: existingError } = await db.from('billing_events').select('id').eq('provider', eventRow.provider).eq('provider_event_id', eventRow.provider_event_id).maybeSingle();
    if (existingError) throw new Error(`Billing event idempotency lookup failed: ${existingError.message}`);
    if (existing?.id) return { applied: false, duplicate: true };
    throw new Error(`Billing event persistence failed: ${eventError.message}`);
  }

  const patch: Record<string, unknown> = {
    plan_key: event.planKey,
    status: event.status,
    provider: eventRow.provider,
    provider_customer_id: event.customerId ?? null,
    provider_subscription_id: event.subscriptionId ?? null,
    current_period_start: event.currentPeriodStart ?? null,
    current_period_end: event.currentPeriodEnd ?? null,
    cancel_at_period_end: event.cancelAtPeriodEnd ?? false,
    updated_at: new Date().toISOString(),
  };
  if (event.eventType === 'trial.started') patch['trial_started_at'] = event.occurredAt;

  const { error: accountError } = await db.from('billing_accounts').upsert({ user_id: event.userId, ...patch }, { onConflict: 'user_id' });
  if (accountError) throw new Error(`Billing account update failed: ${accountError.message}`);
  return { applied: true, duplicate: false };
}
