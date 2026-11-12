# COANTO Gemini Agent PoC Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user approved implementation and Preview deployment; do not pause for a second plan approval.

**Goal:** Add a secure, scoped OpenAPI tool boundary around existing COANTO services and a bounded Gemini tool-calling client.
**Architecture:** Keep TanStack Start, InsForge authentication/persistence and existing engines. The adapter accepts only InsForge bearer tokens belonging to server-configured agent principals. All tool calls reserve durable tenant budgets and write audit records in InsForge before effects. Production routes are disabled.
**Tech Stack:** Existing TypeScript, Bun, Zod, Node crypto, InsForge SDK; no new dependencies or paid services.
**Spec:** User-approved integration architecture in the conversation.

## Global constraints

- Separate feature branch based on 35e7f9b. Preview only; no merge, production deployment, destructive operations, or new paid services.
- Preserve UI, existing authentication, provider fallbacks, database and business engines.
- No model-supplied tenant IDs, confidence overrides, arbitrary SQL, deletion, or unrestricted writes.
- Fail closed for missing principal configuration, database migration, audit store or budgets.

## Review focus

- Forged tenant IDs, invalid bearer tokens, missing scopes, production environment.
- Concurrent/replayed calls consuming budgets or duplicating persistence.
- Provider failure hidden by fallback; search evidence falsely promoted to direct evidence.
- Model-provided evidence/decisions bypassing existing gates; cross-tenant record references.
- Response/log secrets, oversized input and malicious source URLs.

### Task 1: Authenticated OpenAPI transport and durable admission

Files: src/lib/agent-api.server.ts, src/lib/agent-store.server.ts, src/lib/agent-openapi.ts, src/routes/api/agent.ts, migrations/20261112090000_agent_api.sql, scripts/agent-api.test.ts.

- [x] Write failing transport tests for auth, principal scopes, tenant ownership, schema rejection, limits and replay.
- [x] Implement dependency-injected HTTP handler; production kill switch; bounded JSON; bearer-only existing InsForge authentication; strict tools.
- [x] Add SQL transactional admission using a tenant advisory lock, burst/daily cost caps, immutable request hashes and idempotency. Persist audit and results; RLS enabled, public access revoked.
- [x] Run tests and typecheck; commit.

### Task 2: Existing provider and domain tools

Files: src/lib/agent-services.server.ts, src/lib/agent-search.server.ts; minimal existing Serper and Exa adapter changes; scripts/agent-services.test.ts.

- [x] Write failing tests for independent Serper/Exa, explicit errors and attribution, tenant-scoped persistence and trust refusal.
- [x] Reuse provider adapters and evidence verification; persist bounded research/evidence artifacts through agent audit store in InsForge.
- [x] Expose context, research, evidence, monitoring-derived intelligence and decisions, using existing engines and tenant-owned records. No invented monitoring events from research.
- [x] Verify source attribution, no false verification, cross-tenant rejection and tests; commit.

### Task 3: Gemini connection, documentation and Preview

Files: scripts/gemini-agent-poc.ts, docs/AGENT-POC.md, scripts/agent-preview-e2e.ts, OpenAPI contract.

- [x] Implement bounded Gemini function-call loop translating only allowlisted OpenAPI operations; credentials from environment, HTTPS Preview host only, protection header only to that host.
- [x] Document secure principal/token setup, sandbox migration, costs, permissions, rollback and live prerequisites.
- [x] Run full available suites, build, fresh code review and fix findings.
- [ ] Push feature branch, await Vercel Preview, test public contract/auth rejection and authenticated live E2E when secure prerequisites are present. Record blocked live checks honestly.

## Execution ledger

Ruling: Existing InsForge bearer authentication plus explicit server-side principal/scope bindings is the PoC tool authentication. No new identity provider or paid Google project is created. A configured Google connector or the included Gemini tool client supplies the existing tenant's bearer token.
Ruling: Research remains observations, not fabricated monitoring changes. Intelligence and decisions use persisted tenant monitoring events. Research artifacts are stored separately in the existing InsForge backend.

Task 1: complete — HTTP authorization/validation tests and real PostgreSQL concurrency, replay, tenant and unprivileged permission tests passed.
Task 2: complete — attributed provider isolation, source controls, end-to-end controlled evidence/pipeline/persistence/tenant flow and trust refusal tests passed.
Task 3: implemented; Preview deployment and live prerequisite checks pending.
Final review: fresh reviewer found artifact scope bypass, Node lookup contract, OpenAPI result shape, and legacy HTTP compatibility issues. Fixed with regressions; real Node HTTPS transport regression passes.
Ruling: No InsForge admin credentials or Gemini key are accessible locally; user reports they exist in Vercel. Do not extract them or fabricate a sandbox identity. Live migration, principal and Google registration remain explicit prerequisites.
Ruling: Existing collector gained an optional transport injection; default acquisition/fallback behavior remains unchanged. Agent collection uses strict approved-host pinned HTTPS without implicit paid-provider fallback.

Final: fixed cached artifact scope revocation as well as first-read scope checks — added failing cached replay regression, then 30/30 Bun tests passed. Production remains disabled and unconfigured principals remain denied. Real PostgreSQL admission and real Node pinned-lookup checks passed; all 24 available existing package quality/smoke checks passed. Live sandbox InsForge/Gemini integration is not inferred from these fixtures.
