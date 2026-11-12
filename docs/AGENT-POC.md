# COANTO Gemini Agent proof of concept

This additive Preview adapter keeps TanStack Start, InsForge authentication/database, existing provider fallbacks, evidence verification, Trust Threshold, intelligence and decision engines. No dependencies, Google projects, paid plans or production resources are created.

## Implemented contracts

- `GET /api/agent`: OpenAPI 3.0.3 contract. Import its URL/document into an agent connector supporting authenticated external HTTPS tools. Connector availability and entitlement must be confirmed in the Google tenant; no Enterprise/Studio registration is claimed by this code.
- `POST /api/agent`: strict `{tool,input}` JSON, maximum 16 KiB. Requires `Authorization: Bearer <existing InsForge access token>`, `Idempotency-Key: <UUID>`, a configured agent principal and the tool scope.
- Tool authentication does not accept cookies, Vercel bypass secrets or Google service-account tokens. Existing human authentication remains unchanged. The PoC uses a dedicated non-production InsForge user; token expiry/revocation is checked by the existing InsForge auth service on every call, including cached calls.
- Production (`VERCEL_ENV=production`) always returns 404. `COANTO_AGENT_ENABLED=false` also disables the adapter. No production deployment is performed.

| Tool                                                                         | Scope            | Admission units |
| ---------------------------------------------------------------------------- | ---------------- | --------------- |
| get_business_context                                                         | context:read     | 1               |
| research (Serper or Exa only; no hidden fallback)                            | research:run     | 10              |
| collect_evidence (tenant-owned research reference; up to 3 approved sources) | evidence:collect | 10              |
| get_artifact (also requires original tool scope; recursive artifacts denied) | artifacts:read   | 1               |
| run_pipeline (tenant-owned evidence reference)                               | intelligence:run | 5               |
| list_decisions                                                               | decisions:read   | 1               |

## Required secure Preview setup

1. Reuse existing Preview `INSFORGE_URL`, `INSFORGE_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`. Use a dedicated sandbox InsForge project, never an unconfirmed production database.
2. Apply `migrations/20261112090000_agent_api.sql` to that sandbox using the existing InsForge admin migration flow. This is an additive migration; deployment/build never automatically applies SQL. Ensure the existing SDK admin DB role owns or has explicit table/RPC access. End-user roles must have neither. Do not grant RPC execution or table access to `public`, `anon` or `authenticated`.
3. Configure **Preview only** `COANTO_AGENT_PRINCIPALS` as JSON, replacing the placeholder UUID with the dedicated existing InsForge test user's ID:

```json
[
  {
    "userId": "<sandbox-user-UUID>",
    "scopes": [
      "context:read",
      "research:run",
      "evidence:collect",
      "artifacts:read",
      "intelligence:run",
      "decisions:read"
    ],
    "allowedHosts": ["example.com"]
  }
]
```

`allowedHosts` is an exact administrator-approved list, not wildcards or a model argument. Add actual approved competitor hosts separately if needed, including `www` variants. Missing configuration denies every identity. A token belonging to an unlisted user is never admitted.

4. Obtain a normal short-lived InsForge access token for that sandbox user through existing authentication. Bind it securely as `COANTO_AGENT_ACCESS_TOKEN` in the test runner or connector, never in chat, source, prompts, command arguments or logs. This is not the InsForge admin key.
5. For protected Previews, supply the existing `VERCEL_AUTOMATION_BYPASS_SECRET` securely to the authorized caller. It is sent only to the exact Preview host, in `x-vercel-protection-bypass`; redirects are rejected. It is never used as COANTO authorization and never sent to search providers or source websites.
6. Set `COANTO_AGENT_BASE_URL` to the dedicated deployment URL. Production aliases and non-HTTPS destinations are rejected by the supplied runners.

Current-instance test credentials are separate from Vercel environment variables. Configuring keys only in Vercel does not expose them to local test commands.

## Evidence, persistence and intelligence

Search results preserve provider, URL, title, snippet, source type, timestamp, provider HTTP failure and missing-key status. Provider responses are bounded and errors are sanitized. Search text remains `search-index`; it is not direct evidence or a model instruction.

Agent source collection selects result indexes from an immutable same-tenant research artifact. It reuses the existing collector and verification functions with a strict transport: HTTPS only, exact host allowlist, public IPv4 resolution pinned to the TLS socket, revalidated redirects, timeout and body-size limits. It never implicitly spends on Apify or another search provider. IPv6-only sources currently fail explicitly. TLS hostname/certificate verification remains enabled.

Every admitted operation is persisted in **InsForge `agent_tool_runs`**, including tool, authenticated tenant, immutable input hash, idempotency key, units, timestamps, completion/error and bounded result. Research/evidence/pipeline results are durable tenant-owned artifacts in this table. Evidence content is capped before hashing; responses do not expose secrets. There is no in-memory production persistence or quota fallback.

`run_pipeline` recomputes existing source provenance trust. It reads actual same-tenant monitoring events for verified source hosts, then invokes `buildCompetitiveIntelligence` and `buildDecisions`. It never fabricates a monitoring change from a search snippet. No genuine changes means no actionable output. Contradictions at the exact one-third boundary refuse recommendations. Source provenance trust is **not** arbitrary semantic claim verification.

Pipeline results and proposed decision drafts are stored in the agent audit/artifact table. They do not accept, complete, delete or overwrite the existing user decision state. This PoC does not auto-publish agent drafts into `business_insights` or `decisions` tables; existing UI refresh/publish workflows remain unchanged.

## Atomic limits, cost and audits

PostgreSQL admission uses a tenant advisory transaction lock: 6 new operations per minute and 100 units per UTC day. Failures consume admitted units. A repeated same-tenant idempotency key with identical canonical input returns the immutable result without repeating execution; changed input conflicts. In-progress/failed operations cannot automatically retry under the same key. Admission or audit persistence failure blocks tool execution. A long-running/crashed call is not silently re-executed; investigate it and use a new key only when duplicate effects are safe.

The SQL migration enables RLS and revokes public table/RPC access. Tenant filters are also applied server-side. Do not expose the administrative InsForge client to callers. No arbitrary SQL, caller-selected tenant IDs, deletion, external actions, or unrestricted writes are tools.

A typical context + two provider searches + evidence + pipeline + decision read costs **37 admission units**, permitting two such uncached workflows per tenant/day under the default 100-unit cap. These are internal units, not dollars. Provider retries and reads also have budgets.

Dollar cost per run = Serper search price + Exa search/content price + existing Vercel/InsForge usage + Gemini input/output tokens if the optional model runner is enabled. Current provider tariffs/free-tier availability were not independently verified. No additional fixed service subscription is introduced; existing services may still incur usage charges. The Gemini runner requires explicit confirmation of existing free-tier access and is capped at 3 model turns, 6 tool calls and 1,500 output tokens per turn. Do not enable a paid tier without separate approval.

## Gemini connection

`scripts/gemini-agent-poc.ts` provides an actual Gemini `generateContent` function-calling client. Declarations derive from the same OpenAPI tool input schemas. Returned function calls are allowlisted/validated, then sent to the authenticated Preview adapter. Tool observations are marked untrusted; only backend scopes permit operations. No model-supplied tenant identity is accepted.

Configure `GEMINI_API_KEY`, the existing `GEMINI_MODEL`, `COANTO_AGENT_ACCESS_TOKEN`, Preview URL and optional bypass securely in the runner. Set `COANTO_GEMINI_FREE_TIER_CONFIRMED=true` only after confirming existing free-tier eligibility. Then run:

```bash
bun scripts/gemini-agent-poc.ts "Research competitors with Serper and Exa independently; cite sources and report failures."
```

No live model request is made automatically by build, deployment or normal app traffic. Native Gemini Enterprise registration/OAuth configuration requires authorized access to that Google tenant; this repository does not pretend to provision it.

## Verification commands

```bash
bun test
bun run typecheck
bun run lint
bun run build
bun run test:trust
bun run test:architecture
bun run test:security
bun run test:evidence
bun run test:evidence-collector
bun scripts/agent-preview-e2e.ts
```

The Preview runner checks the deployed contract, unauthenticated rejection, scoped context, persisted replay, tenant-override rejection, independent real provider queries, attributed direct collection, persisted artifacts, intelligence/decision gates and existing decision reads. It exits nonzero and explicitly reports missing authenticated prerequisites. Default test source is `example.com`; change `COANTO_AGENT_TEST_SOURCE_HOST` only to an approved host in the principal configuration.

For real SQL concurrency/permissions testing without touching InsForge, start a dedicated local `postgres:16-alpine` container named `coanto-agent-pg` without published ports, run `python scripts/agent-postgres-test.py coanto-agent-pg`, then remove that test container. Use a fresh container when repeating the test-role setup. Node transport regression: bundle `scripts/agent-transport-node.ts` for Node with Bun, then execute the output using Node 24. No TLS checks are disabled.

## Rollback

Disable the Preview adapter with `COANTO_AGENT_ENABLED=false`, revoke the test user's sessions or remove its principal binding, and redeploy the previous Preview commit. Preserve audit records. No production setting or existing table needs modification to disable this PoC.
