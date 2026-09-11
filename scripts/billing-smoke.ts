import { readFile } from 'node:fs/promises';
import { BILLING_PLANS, billingAccessMode, effectivePlan } from '../src/lib/billing-policy.server.ts';

if (BILLING_PLANS.trial.paid) throw new Error('Trial must not be marked paid.');
if (BILLING_PLANS.free.publicPriceUsdMonthly !== 0) throw new Error('Free plan must remain zero-priced.');
if (BILLING_PLANS.starter.publicPriceUsdMonthly !== null || BILLING_PLANS.pro.publicPriceUsdMonthly !== null) throw new Error('Paid prices must not be invented before commercial validation.');
if (effectivePlan('pro', 'canceled') !== 'free') throw new Error('Canceled paid subscription must fall back to free access.');
if (effectivePlan('trial', 'trialing', '2020-01-01T00:00:00.000Z', new Date('2026-09-11T00:00:00.000Z')) !== 'free') throw new Error('Expired trial must fall back to free access.');
const active = billingAccessMode('starter', 'active');
if (active.mode !== 'paid' || active.paymentAttentionRequired) throw new Error('Active paid access classification failed.');
const pastDue = billingAccessMode('starter', 'past_due');
if (!pastDue.paymentAttentionRequired || pastDue.plan !== 'starter') throw new Error('Past-due access must be explicit without silently deleting the subscription.');

const migration = await readFile(new URL('../migrations/20260911054500_billing_state.sql', import.meta.url), 'utf8');
if (!migration.includes('billing_accounts') || !migration.includes('billing_events')) throw new Error('Billing persistence tables missing.');
if (!migration.includes('unique (provider, provider_event_id)')) throw new Error('Billing event idempotency missing.');

const service = await readFile(new URL('../src/lib/billing.server.ts', import.meta.url), 'utf8');
if (!service.includes('applyNormalizedBillingEvent')) throw new Error('Normalized provider event boundary missing.');
if (!service.includes("upsert({ user_id: event.userId")) throw new Error('Billing account projection missing.');
if (service.includes('STRIPE_SECRET') || service.includes('PAYPAL_SECRET')) throw new Error('Billing core must remain provider-neutral.');

const pricing = await readFile(new URL('../src/routes/pricing.tsx', import.meta.url), 'utf8');
if (!pricing.includes('السعر عند الإطلاق')) throw new Error('Pricing page must not fabricate paid pricing.');
if (!pricing.includes('/auth')) throw new Error('Pricing page must offer validation-stage onboarding.');

console.log('BILLING_SMOKE_OK');
