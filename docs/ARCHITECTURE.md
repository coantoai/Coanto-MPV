# COANTO Production Architecture

## Product invariant

COANTO is a Competitive Decision Intelligence platform. The product pipeline is:

**Evidence → Verification → Intelligence → Decision → Action**

AI output is never treated as evidence by itself. Material claims must remain traceable to collected evidence or explicit external sources.

## Target architecture

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
  ├─ authentication target
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
InsForge is the primary persistence target. Persistence access must go through server-only modules. The application must not silently fall back to in-memory/demo persistence in production.

### Authentication
InsForge is the target authentication platform. Existing Supabase authentication code is transitional technical debt and must not expand. It will be replaced in the dedicated InsForge/auth migration step after the application boundary is stabilized.

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
8. CI gates typecheck, build, lint, contract tests, smoke tests, and integration tests that are not blocked by unrelated external quota exhaustion.
9. Database schema changes are versioned migrations.
10. Architectural transitions are explicit; two backends must not become permanent parallel sources of truth.

## Current transition risks

- Supabase authentication remains in the codebase while InsForge is the target backend/auth platform.
- Gemini live tests can be blocked by external free-tier quota even when application code is healthy.
- Several domain services predate the final persistence architecture and must be reviewed for demo/in-memory fallbacks before production launch.
- Provider and environment configuration has historically drifted from runtime defaults; `.env.example` and code must remain synchronized.

## Near-term migration order

1. Stabilize configuration, repository documentation, and server boundaries.
2. Complete InsForge persistence and tenant-safe schema.
3. Move authentication to InsForge and retire Supabase code/dependency.
4. Harden onboarding and business-context persistence.
5. Harden evidence acquisition, provenance, monitoring, and change detection.
6. Integrate AI live E2E once quota/billing is available, without blocking unrelated platform development.

This document is the architecture source of truth. Changes that materially alter these boundaries should update this file in the same change.