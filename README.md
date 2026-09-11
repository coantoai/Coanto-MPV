# COANTO

**Competitive Decision Intelligence — Evidence → Verification → Intelligence → Decision → Action.**

COANTO is being built as an AI-assisted competitive intelligence platform for small and medium-sized businesses. It collects competitor and market evidence, verifies and ranks it, interprets material changes, and converts them into practical decisions.

## Architecture

The production architecture and engineering invariants live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). InsForge is the target backend/persistence platform; Gemini is the current primary AI analysis provider, with provider adapters kept independent from product logic.

Production go/no-go, backup, rollback, environment, and post-deploy procedures live in [`docs/LAUNCH.md`](docs/LAUNCH.md). A green build alone is not considered launch proof.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to your local environment and configure only the providers you need. Never commit real secrets.

## Quality gates

```bash
npm run typecheck
npm run lint
npm run build
npm run test:smoke
npm run test:ai-contract
npm run test:evidence
npm run test:trust
npm run test:production-qa
npm run test:launch-readiness
```

For an actual production release, run `bun run launch:check` with production environment variables and then use the manual **COANTO Launch Gate** workflow. The launch gate also requires live provider proof, backup confirmation, rollback confirmation, and post-deploy health/readiness verification.

Live provider/integration tests require their corresponding credentials and may fail when an external provider has exhausted quota even when the application build is healthy. A public launch remains blocked until the required live dependencies pass.

## Core engineering rule

AI output is not automatically evidence. Material claims must remain traceable to evidence or explicit sources, and provider output must pass COANTO's validation/trust contracts before it can become decision intelligence.
