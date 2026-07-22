# ReclaimAI build tracker

Last updated: 2026-07-22

## Active

| Milestone | Branch | Status | Notes |
|---|---|---|---|
| POS order ingest | `feature/pos-order-ingest` | implemented | Unit tests green; run integration after Docker Desktop is up |

## Queue (do not start yet)

| Milestone | Depends on | Notes |
|---|---|---|
| Identity claim + OTP | POS order ingest merged to `dev` | B2C claim flow |
| Margin offer engine | Identity unmasked events | Deterministic margin ceiling |
| Copy/LLM orchestrator | Offer ready events | Claude API only (Phase 0) |
| WhatsApp dispatch | Message generated events | Meta Cloud API + Gupshup failover |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | `docs/plans`, `AGENTS.md`, `.cursor/rules` |
