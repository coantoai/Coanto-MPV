import { readFile } from 'node:fs/promises';
import { BILLING_PLANS, billingAccessMode, effectivePlan, trialDurationDays, trialEndsAt } from '../src/lib/billing-policy.server.ts';

if (BILLING_PLANS.trial.paid) throw new Error('Trial must not be marked paid.');
if (BILLING_PLANS.free.publicPriceUsdMonthly !== 0) throw new Error('Free plan must remain zero-priced.');
if (BILLING_PLANS.starter.publicPriceUsdMonthly !== null || BILLING_PLANS.pro.publicPriceUsdMonthly !== null) throw new Error('Paid prices must not be invented before commercial validation.');
if (effectivePlan('pro', 'canceled') !== 'free') throw new Error('Canceled paid subscription must fall back to free access.');
if (effectivePlan('trial', 'trialing', '2020-01-01T00:00:00.000Z', new Date('2026-09-11T00:00:00.000Z')) !== 'free') throw new Error('Expired trial must fall back to free access.');
if (trialDurationDays({} as NodeJS.ProcessEnv) !== 14) throw new Error('Default trial duration must be explicit and finite.');
const trialEnd = trialEndsAt('2026-09-11T00:00:00.000Z', {} as NodeJS.ProcessEnv);
if (trialEnd !== '2026-09-25T00:00:00.000Z') throw new Error('Trial expiry calculation failed.');
const active = billingAccessMode('starter', 'active');
if (active.mode !== 'paid' || active.paymentAttentionRequired) throw new Error('Active paid access classification failed.');
const pastDue = billingAccessMode('starter', 'past_due');
if (!pastDue.paymentAttentionRequired || pastDue.plan !== 'starter') throw new Error('Past-due access must be explicit without silently deleting the subscription.');

const migration = await readFile(new URL('../migrations/20260911054500_billing_state.sql', import.meta.url), 'utf8');
if (!migration.includes('billing_accounts') || !migration.includes('billing_events')) throw new Error('Billing persistence tables missing.');
if (!migration.includes('unique (provider, provider_event_id)')) throw new Error('Billing event idempotency missing.');
const orderingMigration = await readFile(new URL('../migrations/20260911062000_billing_event_ordering.sql', import.meta.url), 'utf8');
if (!orderingMigration.includes('last_event_at') || !orderingMigration.includes('stale billing event')) throw new Error('Billing event ordering guard missing.');

const service = await readFile(new URL('../src/lib/billing.server.ts', import.meta.url), 'utf8');
if (!service.includes('applyNormalizedBillingEvent')) throw new Error('Normalized provider event boundary missing.');
if (!service.includes("upsert({ user_id: event.userId")) throw new Error('Billing account projection missing.');
if (!service.includes('duplicate = true') || !service.includes('last_event_at')) throw new Error('Billing duplicate repair or stale-event protection missing.');
if (!service.includes('trial_ends_at: expiresAt')) throw new Error('New trials must persist an expiry.');
if (service.includes('STRIPE_SECRET') || service.includes('PAYPAL_SECRET')) throw new Error('Billing core must remain provider-neutral.');

const pricing = await readFile(new URL('../src/routes/pricing.tsx', import.meta.url), 'utf8');
if (!pricing.includes('السعر عند الإطلاق')) throw new Error('Pricing page must not fabricate paid pricing.');
if (!pricing.includes('/auth')) throw new Error('Pricing page must offer validation-stage onboarding.');
const billingRoute = await readFile(new URL('../src/routes/billing.tsx', import.meta.url), 'utf8');
if (!billingRoute.includes('clientAuth.getSession') || !billingRoute.includes("to:'/auth'")) throw new Error('Billing route must redirect unauthenticated users.');

console.log('BILLING_SMOKE_OK');
