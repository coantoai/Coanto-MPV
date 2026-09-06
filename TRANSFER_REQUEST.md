# COANTO code transfer

Transfer the current COANTO application source into this repository on `main`. Do not commit secrets (`.env`, API keys, service-role keys). Preserve the existing application structure and functionality. After transfer, continue development from this repository.

Primary product requirement: when a user enters their website, COANTO must autonomously discover relevant competitors, verify evidence, compare competitors against the user's site as baseline, and produce decision intelligence. It must not treat the user's own site as the competitor.
