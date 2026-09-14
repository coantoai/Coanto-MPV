# COANTO Decision Experience — isolated R1–R60 preview

## Source of truth / scope

Engineering baseline: main `33b9fa664e13d890d78986df7d4806e378ddf7ca` (13 September 2026). The owner's explicit preview instruction authorizes this bounded prototype while Point 3 stays open. It does not authorize a production UX replacement, a new backend, pricing commitments or launch.

Read: full cumulative R1–R49, R49 ledger and registers, R50–R60 continuation, latest 54-page Master Handoff, complete Research Protocol, older MVP spec, New Ideas and trust constitution. Newer research supersedes older choices. Research source claims are inherited research, not fresh vendor verification in this implementation.

## Research → product trace

| Checkpoints | Learning carried forward                                                                                  | Product expression                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| R1–R3       | Attention is scarce; non-response can be rational; matching precedes advice                               | Conclusion-first brief; sparse inbox; match and source details                                                           |
| R4–R6       | Recommendations are crowded; commercial decision owner; compare price, offer and availability             | Contextual decision event, not competitor tiles or repricer                                                              |
| R7–R10      | Portable artifact; progressive context; alternatives; strategic independence; DTC hypothesis emerged      | Copyable brief, missing-fact question, opposing case, do-not-copy logic                                                  |
| R11–R14     | Protect and grow; surprise must be consequential; no unique-feature moat; geography unproven              | Protection and bounded growth scenarios, no fabricated economic impact or market claims                                  |
| R15–R18     | External change response leads; internal data sets advice ceiling; progressive disclosure                 | External vs supplied-context mode; deeper evidence/timeline/scenarios on demand                                          |
| R19–R22     | Trading cadence; saturated category; cross-lever response; causal diagnosis needs internal outcomes       | One next step; event history; no causal attribution or predicted ROI                                                     |
| R23–R26     | Must-have kill tests; DTC favored provisionally; robustness before precision; response memory             | Conditional recommendations, reversible tests, honest prototype decision log                                             |
| R27–R29     | No conceptual novelty moat; progressive bridge; required card ontology                                    | Brief hierarchy, sources/counter-evidence, trigger, review and sharing                                                   |
| R30–R36     | Open decision loops; WATCH is a future obligation; payment and repeat behavior required                   | Interactive re-evaluation and baseline/post-decision record; no validation claims                                        |
| R37–R40     | DTC signal density is not decision density; first verticals provisional; desk saturation                  | Growth/substitute examples retained as exploration, no declared final ICP                                                |
| R41–R45     | Budget adjacency is not COANTO WTP; recurrence and buyer authority; behavioral ladder                     | Pilot rehearsal captures intended action, reason and subsequent action; no paid pilot simulation                         |
| R46–R49     | Entity state, plausible explanations, public-only advice ceiling, reopening triggers                      | Entity-context note and alternative explanations; no invented intent                                                     |
| R50–R53     | Reversal: A comparable-SKU retailers leads, C channel brands challenges, B DTC third; Decision Event      | A and C selectable workspaces; price/promo/stock convergence; concise Decision Brief                                     |
| R54–R56     | Real commitment required; advisor not autopilot; calibrated trust; minimum company context                | Accept/modify/wait/reject; no percentages; explicit user-supplied context                                                |
| R57–R60     | A-vs-C test; verified feeds before new acquisition stack; stop generic research; baseline before exposure | Pilot rehearsal hides recommendation until baseline saved; real existing pipeline reuse; no commercial validation claims |

No historical ranking is silently represented as current. A leads C provisionally; both need real field/payment evidence. B remains a possible expansion/research cohort. Allbirds and Jones Road were research illustrations, not customer pilots or evidence that payment is proven. This preview uses fictional entities to avoid presenting dated research scenarios as current live intelligence.

## Engineering inspection and gaps (recorded before implementation)

- React 19 / TanStack Start / Vite / Nitro / InsForge. Auth is same-origin `/api/auth`, HttpOnly cookies; existing client facade retained.
- `/api/analyze` checks same-origin, authentication, completed business context, URL safety, operation/budget guard, acquisition, discovery, AI validation, evidence enforcement and persistence. Retain it unchanged.
- Evidence records are content hashed and linked through tenant-scoped `analysis_evidence_links`. A new read-only facade must verify analysis ownership before reading only linked evidence. Never expose the shared evidence table directly.
- Existing decision DTO has title/action/rationale/evidence labels and proposed/accepted/dismissed/completed. It lacks a calibrated ACT/TEST/WATCH/IGNORE policy, versioned counter-evidence, unknowns, tripwire and outcome schema. Do not equate its heuristic scores with calibrated probabilities.
- Monitoring detects events with tenant scoping; it does not constitute an R60 decision-tripwire scheduler. Simulation must say so.
- Current business onboarding requires more than a URL. The preview can start instantly with labeled fixtures; real analysis reuses current onboarding and explicitly reports this gap.
- Live analysis contains model interpretations and acquisition provenance, not a fully verified new Decision Event. Present these as inference; do not synthesize unsupported ACT or substitute fixture results on failure.
- Ask has no existing grounded conversational API. Prototype answers are deterministic, event-bound and explicitly labeled; unknown questions abstain. No LLM or learned policy is claimed.
- Demo choices/context/outcomes are local browser storage under a versioned namespace, independent of live account data. This is not shared team memory, measured retention, automatic learning or a real pilot.
- No migrations, auth changes, provider changes, production route replacement or autonomous business actions.

## Preview journey

Open `/next`, choose retailer or channel brand; inspect a decision, compare supporting/opposing observations, explore history, change a guardrail and simulate a new observation. The decision can reopen, with reasons and retained previous state. Ask questions within that event. Record a response or copy a self-contained brief. Pilot rehearsal captures a baseline before revealing advice. Live workspace reads the existing account and can run the existing analysis; missing capabilities remain explicit.

## Validation still required

A vs C, final ICP/geography, willingness to pay, useful event density, comprehension in Arabic/English, missed-event risk, incremental value over incumbent feeds, context friction, voluntary return and sharing, acquisition economics and longitudinal calibration. No prototype interaction is proof of any of these.

## Verification and implementation notes — 14 September 2026

- Production build passes with the installed dependencies. The existing Vite configuration needed `resolve.tsconfigPaths: true` to resolve the repository's `@/` imports. No dependencies were added.
- TanStack regenerated its previously incomplete route map. Its real declarations made 22 old `@ts-expect-error` comments invalid; only those comments were removed from existing routes. Their executable source is unchanged.
- Typecheck passes. Lint passes with five pre-existing warnings in DashboardHome/auth/billing/competitors; the new experience has no lint warnings.
- Existing architecture, security, evidence, decision-engine, AI-contract suites and 28 smoke checks pass locally. New `test:decision-experience` covers coherent revisions, abstention, constraint arithmetic, unsafe links, demo provenance, live projection and a static tenant-read regression boundary. Added to the existing verification matrix.
- Chromium browser checks passed for Arabic and English, 1440px desktop and 390px mobile, source expansion, counter-case Ask, unsupported-question abstention, floor context, WATCH→ACT, local response persistence, baseline-before-advice rehearsal, TEST/IGNORE/INSUFFICIENT, live/demo separation, original `/demo` and `/` rendering. No uncaught browser JavaScript errors in those flows.
- Agent-browser daemon could not start in this container. Browser verification used Playwright controlling Chromium directly, against the built production server in the same runtime network context.
- Live authentication UI is wired to the existing same-origin cookie facade. No authenticated customer analysis or new evidence-ledger read was exercised with a real account here. An API response requesting login is not evidence of successful end-to-end analysis.
- No secrets added, no database migrations added, no business actions executed. The external analysis page does not display heuristic confidence scores, invent counter-evidence or silently convert legacy outputs into a verified R60 brief.
- `Ask COANTO` uses deterministic prototype replies. Decision records are local to the browser, and context is session-only. No automatic watcher, calibrated learned policy, team sharing backend or causal outcome attribution is implemented.

## Owner review / next validation step

Open `/next` on the preview deployment. Compare `/demo` on the same preview or the unchanged production deployment. Owner approval is required before merging or changing the primary production UX. Start field validation only after reviewing this proposed experience: qualified A/C companies, verified event feed, baseline decision, assisted decision and reason, actual action, repeat use, then a real commercial commitment. Do not treat acceptance of the demo as evidence of willingness to pay.
