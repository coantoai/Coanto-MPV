export type BillingPlanKey = 'trial' | 'free' | 'starter' | 'pro';
export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired';

export type BillingPlan = {
  key: BillingPlanKey;
  name: string;
  description: string;
  paid: boolean;
  publicPriceUsdMonthly: number | null;
  availability: 'validation' | 'coming-soon';
};

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlan> = {
  trial: {
    key: 'trial',
    name: 'تجربة COANTO',
    description: 'وصول محدود أثناء مرحلة التحقق من المنتج، مع حماية الكلفة الحالية.',
    paid: false,
    publicPriceUsdMonthly: null,
    availability: 'validation',
  },
  free: {
    key: 'free',
    name: 'Free',
    description: 'طبقة مجانية محدودة تبقى متاحة حتى بعد انتهاء أي اشتراك مدفوع.',
    paid: false,
    publicPriceUsdMonthly: 0,
    availability: 'validation',
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    description: 'للشركات التي تريد مراقبة تنافسية مستمرة وحدود استخدام أعلى.',
    paid: true,
    publicPriceUsdMonthly: null,
    availability: 'coming-soon',
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    description: 'للاستخدام المكثف، التقارير المتقدمة، وقدرات أوسع للمراقبة والذكاء.',
    paid: true,
    publicPriceUsdMonthly: null,
    availability: 'coming-soon',
  },
};

export type NormalizedBillingEvent = {
  provider: string;
  providerEventId: string;
  userId: string;
  eventType: 'trial.started' | 'subscription.activated' | 'subscription.renewed' | 'subscription.past_due' | 'subscription.paused' | 'subscription.canceled' | 'subscription.expired';
  planKey: BillingPlanKey;
  status: BillingStatus;
  customerId?: string;
  subscriptionId?: string;
  occurredAt: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
};

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function trialDurationDays(env: NodeJS.ProcessEnv = process.env) {
  return boundedInteger(env['COANTO_TRIAL_DAYS'], 14, 1, 60);
}

export function trialEndsAt(startedAt: string | Date, env: NodeJS.ProcessEnv = process.env) {
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid trial start timestamp.');
  return new Date(start.getTime() + trialDurationDays(env) * 86_400_000).toISOString();
}

export function assertBillingPlanKey(value: string): BillingPlanKey {
  if (value === 'trial' || value === 'free' || value === 'starter' || value === 'pro') return value;
  throw new Error('Unknown billing plan.');
}

export function assertBillingStatus(value: string): BillingStatus {
  if (value === 'trialing' || value === 'active' || value === 'past_due' || value === 'paused' || value === 'canceled' || value === 'expired') return value;
  throw new Error('Unknown billing status.');
}

export function effectivePlan(planKey: BillingPlanKey, status: BillingStatus, trialEndsAtValue?: string | null, now = new Date()): BillingPlanKey {
  if (planKey === 'trial' && trialEndsAtValue && Date.parse(trialEndsAtValue) <= now.getTime()) return 'free';
  if (BILLING_PLANS[planKey].paid && (status === 'canceled' || status === 'expired')) return 'free';
  return planKey;
}

export function billingAccessMode(planKey: BillingPlanKey, status: BillingStatus, trialEndsAtValue?: string | null, now = new Date()) {
  const plan = effectivePlan(planKey, status, trialEndsAtValue, now);
  return {
    plan,
    mode: plan === 'trial' ? 'trial' as const : BILLING_PLANS[plan].paid ? 'paid' as const : 'free' as const,
    paymentAttentionRequired: status === 'past_due',
  };
}
