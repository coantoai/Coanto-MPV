# COANTO Launch Runbook

COANTO launch is gated by evidence, not by a green build alone. A release is launchable only when code gates, production configuration, live dependencies, recovery preparation, and post-deploy checks all pass.

## Launch profiles

### Validation launch

Use `COANTO_LAUNCH_MODE=validation` for an invite/beta release. The product can expose the real intelligence workflow, but paid checkout remains intentionally unavailable. This profile is allowed only when the live AI provider, discovery provider, InsForge, monitoring secret, auth-throttle secret, domain/TLS, backup confirmation, and rollback confirmation are ready.

### Commercial launch

Use `COANTO_LAUNCH_MODE=commercial` only after a real payment-provider adapter exists in code, verifies signed provider events, maps them to `NormalizedBillingEvent`, and passes its production integration tests. The current launch policy deliberately blocks this profile; setting an environment variable cannot bypass that code-level requirement.

## Production environment contract

Required for validation launch:

- `COANTO_SITE_URL`: public HTTPS origin, normally `https://coanto.com`.
- `INSFORGE_URL`: public HTTPS backend origin.
- `INSFORGE_API_KEY`: server-only InsForge project key.
- `AUTH_RATE_LIMIT_SECRET`: independent random secret, at least 32 characters. Do not reuse the InsForge key.
- `CRON_SECRET`: random secret, at least 32 characters.
- `AI_PROVIDER` plus the matching provider key. At least one working AI provider is required.
- At least one of `BRAVE_SEARCH_API_KEY` or `BING_SEARCH_V7_KEY` for competitor discovery.
- `COANTO_RELEASE_SHA` should identify the deployed commit when the platform does not automatically expose a commit SHA.

Apify is optional in validation mode. Without it, direct acquisition still runs, but difficult JavaScript-heavy pages can have reduced coverage. If `APIFY_MODE=preferred`, `APIFY_TOKEN` is mandatory.

Never put server secrets in browser variables or commit local `.env` files. `.gitignore` protects local environment files, but secret rotation is still required if a secret is ever committed or printed.

## Pre-launch gate

Before a public release:

1. Main branch CI must be green, including production QA, build, security, runtime smoke, and real InsForge integration.
2. Run `bun run launch:check` with the actual production environment. It must report zero blockers.
3. Run the manual **COANTO Launch Gate** workflow for the exact release SHA. It requires explicit backup and rollback confirmations.
4. The live AI E2E must pass against a real provider. A configured key is not enough; quota and model availability must be proven at launch time.
5. Verify at least one discovery provider works with the production key.
6. Verify `https://coanto.com/api/health` returns `ok:true` and the expected release SHA.
7. Verify `https://coanto.com/api/ready` returns `ready:true` and `insforge:ready`.
8. Verify an unauthenticated protected API returns 401 and the monitoring cron rejects a request without its secret.

## Backup / recovery gate

The repository cannot prove that a restorable production backup exists. Before launch, create or verify a fresh restorable backend backup/export using the recovery mechanism available for the production InsForge project. Record when it was taken and who verified restoration/recovery. If a restorable recovery path is unavailable, do not public-launch data you cannot recover.

The launch gate therefore requires an explicit `backup_confirmed=true` acknowledgement. This is an operational assertion, not an automated substitute for a real backup.

## Rollback

Before deployment, record the previous known-good production commit SHA and deployment identifier. The launch gate requires a non-empty rollback SHA that is different from the candidate release.

If post-deploy checks fail:

1. stop rollout/traffic changes;
2. redeploy the previous known-good commit or use the hosting provider's immutable deployment rollback;
3. verify `/api/health` reports the expected rollback SHA;
4. verify `/api/ready` is healthy;
5. do not reverse database migrations blindly—prefer forward fixes unless the migration has a tested reversible procedure;
6. preserve failing request IDs and provider diagnostics for incident review.

## Observability minimum

`/api/health` and `/api/ready` expose non-secret release identity (`sha`, short SHA, environment) so an incident can be mapped to a deployed commit. API responses already carry request IDs. Production logs must preserve those request IDs and must never log provider tokens, auth cookies, raw passwords, or API keys.

## Known external launch blockers

These are not fixed by compiling the repository:

- **Live AI quota/availability:** the selected provider must pass the live E2E at launch time. If Gemini is quota-blocked, validation launch remains blocked unless another configured provider passes the same contract.
- **Payment gateway:** commercial launch is blocked until the signed provider adapter is implemented and tested. Validation launch can proceed without fake checkout.
- **Domain/TLS/deployment:** `coanto.com` must point to the intended production deployment and serve valid HTTPS.
- **Backup confirmation:** must be performed against the real production backend.

## Go / no-go rule

A validation launch is **GO** only when CI is green, `launch:check` has no blockers, the manual launch gate passes, live AI works, production health/readiness checks pass, and backup + rollback are confirmed.

A commercial launch is **NO-GO** until the payment gateway adapter is implemented and its launch policy check is changed by code review after real integration testing.
