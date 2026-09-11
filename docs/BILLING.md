# COANTO Billing Architecture

COANTO billing is intentionally provider-neutral.

## Current validation-stage scope

The product stores its own billing state in `billing_accounts` and an idempotent normalized event ledger in `billing_events`. The product never authorizes features by reading a payment provider object directly.

The public catalog contains `trial`, `free`, `starter`, and `pro`. Commercial prices for paid plans are deliberately unset until pricing and a payment gateway are validated. No fake checkout is exposed.

## Invariant

`payment provider event -> verified provider adapter -> NormalizedBillingEvent -> billing_events -> billing_accounts -> product access`

Provider payloads, signatures, API keys, and secrets must remain inside the future provider adapter. The core billing service accepts only normalized, already-verified events.

## Idempotency

Every external event must carry `(provider, provider_event_id)`. The database enforces uniqueness on that pair. Duplicate deliveries therefore do not duplicate state transitions.

## Failure behavior

A canceled or expired paid subscription falls back to the free product layer instead of deleting business data. `past_due` remains explicit so the UI can request payment attention without silently corrupting access state.

## Future gateway integration

When a production payment provider is selected, implement a provider-specific adapter that:

1. verifies the provider signature before parsing the event;
2. maps provider plan identifiers to COANTO plan keys;
3. maps the payload to `NormalizedBillingEvent`;
4. calls `applyNormalizedBillingEvent`;
5. never exposes provider secrets to the browser.

Changing providers must not require changing COANTO business records, competitor intelligence, evidence, monitoring history, or user identity.
