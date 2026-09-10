# COANTO Production Architecture

## Product invariant

COANTO is a Competitive Decision Intelligence platform. The product pipeline is:

**Evidence → Verification → Intelligence → Decision → Action**

AI output is never treated as evidence by itself. Material claims must remain traceable to collected evidence or explicit external sources.

## Current architecture

```text
Browser / COANTO UI
        ↓
TanStack Start application + server routes
        ↓
Domain services
  ├─ Evidence collection
  ├─ Claim / trust engine
  ├─ Monitoring + change detection
  ├─ Competitive intelligence
  └─ Decision engine
        ↓
InsForge
  ├─ primary database / persistence
  ├─ authentication
  └─ backend platform services
        ↓
External capabilities
  ├─ Gemini / independent AI providers
  ├─ web/search sources
  └─ future acquisition providers (for example Apify)
```

## Boundaries

### UI
Routes and components render state and collect user intent. Business logic should not be embedded in presentation components.

### API / server routes
Server routes authenticate, validate input, invoke domain services, and serialize responses. Secrets and provider API keys must never be exposed to browser code.

### Domain services
Files under `src/lib` own evidence, claims, trust, monitoring, intelligence, and decisions. Provider-specific code must stay behind narrow adapters.

### Persistence
InsForge is the primary persistence platform. Application data access is server-only and tenant-scoped by authenticated `userId`. Core application data must never silently fall back to in-memory/demo persistence in production.

### Authentication
InsForge is the authentication platform. Browser code authenticates through COANTO's same-origin `/api/auth` boundary. The InsForge access token is stored in an HttpOnly, SameSite=Lax cookie and is not exposed to application JavaScript. Server routes validate the session against InsForge before trusting the user identity.

### AI
AI providers interpret supplied evidence and may perform explicitly enabled research. Their responses are untrusted input until validated against the COANTO output contract. Provider failures, quota failures, and malformed responses must fail explicitly and must not create fabricated intelligence.

## Production rules

1. No secrets in browser bundles, logs, repository files, or user-visible errors.
2. Every external request has a timeout and explicit failure path.
3. Every material intelligence claim has provenance and trust metadata.
4. Production data writes are durable and tenant-scoped.
5. Demo/sample data is isolated from production data paths.
6. Monitoring jobs are authenticated and idempotent where practical.
7. AI/model choice is configuration, not product logic.
8. CI gates typecheck, build, lint, architecture, contract, smoke, runtime, and InsForge integration checks. External AI quota exhaustion must not block unrelated platform development.
9. Database schema changes are versioned migrations; applied migrations are never rewritten as a substitute for a new migration.
10. InsForge is the single application backend source of truth; no parallel legacy backend is permitted in runtime code.

## Completed backend migration

- Central server configuration validates InsForge project configuration.
- Analysis history, memory, monitoring, scheduled monitoring, business intelligence, decisions, evidence, claims, and evidence-graph persistence use InsForge.
- Application schema is versioned under `migrations/` and exercised by the InsForge integration test.
- Tenant-sensitive reads, writes, updates, and deletes carry the authenticated `userId` boundary where applicable.
- Supabase runtime clients, generated types, environment variables, and package dependency have been retired.
- Architecture CI rejects reintroduction of Supabase runtime coupling.

## Current risks / next hardening

- Gemini live E2E can be blocked by provider quota independently of platform health.
- End-user InsForge authentication still requires production E2E coverage with a dedicated test identity before launch.
- Domain services must continue to be reviewed for provider timeouts, idempotency, data retention, and explicit failure handling as features expand.
- Any future database authorization/RLS layer must complement, not replace, server-side tenant scoping.

## Near-term order

1. Keep InsForge backend/auth/persistence and architecture checks green.
2. Harden onboarding and persisted business context.
3. Harden evidence acquisition, provenance, monitoring, and change detection.
4. Expand intelligence and decision workflows.
5. Integrate AI live E2E once quota/billing is available, without blocking unrelated platform development.

This document is the architecture source of truth. Changes that materially alter these boundaries must update this file in the same change.
