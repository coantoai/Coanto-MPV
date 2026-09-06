# COANTO AI Research Engine

## Principle

COANTO does not treat an LLM as the source of truth. The evidence layer is the source of truth; the model is the reasoning layer.

## Pipeline

1. **Discover** — find plausible competitors using multiple search queries and specialist competitor directories.
2. **Collect** — fetch official sites where permitted; otherwise preserve public indexed evidence and label it as indexed.
3. **Cross-check** — score candidates by independent-source frequency, directory evidence, direct-site evidence, and relevance while filtering obvious noise.
4. **Verify** — keep provenance on every source and never bypass CAPTCHAs or anti-bot protections.
5. **Reason** — the selected AI provider turns the evidence into facts, inferences, opportunities, threats, priorities, scenarios, and actions.
6. **Evidence gate** — post-process the model output so competitors must belong to the discovered evidence set and source limitations remain visible.
7. **Decide** — surface only decision-relevant signals; financial impact stays unknown unless supported by actual customer data.
8. **Learn** — future monitoring compares new evidence with historical snapshots and records outcomes.

## Provider strategy

COANTO supports three independently configurable providers:

- OpenAI Responses API + web search
- Google Gemini + Google Search grounding
- Anthropic Claude + web search

The production default is configurable with `AI_PROVIDER`; the default is OpenAI only as a temporary staging choice. The benchmark is the authority for selecting the long-term winner.

## Benchmark

`scripts/ai-benchmark.ts` runs the same competitive-intelligence task across all configured providers and reports:

- precision@5 against a reference competitor set
- recall@5
- latency
- web-source count
- raw outputs for human review

The benchmark must be repeated when model versions change materially. A provider is not promoted solely because it sounds better; it must win on grounded competitive-intelligence quality.

## Trust rules

- No claim without evidence.
- No recommendation without reasoning.
- No confidence without calibration.
- Direct-site evidence and indexed evidence are never presented as equivalent.
- Unknown is a valid result.
- The primary site is baseline/context, not automatically a competitor.
- No invented prices, revenue, market share, percentages, dates, or financial impact.
