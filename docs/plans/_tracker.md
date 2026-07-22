# ReclaimAI build tracker

Last updated: 2026-07-22

## Active

_None — identity claim ready for merge review._

## Queue

| Milestone | Depends on | Notes |
|---|---|---|
| Cashback payout (RazorpayX) | Identity claim merged to `dev` | UPI payout + webhook reconcile |
| Margin offer engine | `identity.unmasked` | Deterministic margin ceiling |
| Decay prediction service | `identity.unmasked` | Habit profile bootstrap |
| Copy/LLM orchestrator | `offer.ready` | Claude API |
| WhatsApp dispatch | `message.generated` | Meta + Gupshup failover |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | plans, AGENTS, cursor rules |
| POS order ingest | `feature/pos-order-ingest` | webhook → Postgres → Kafka |
| Identity claim + OTP | `feature/identity-claim-otp` | claim-web + identity service + Kafka unmasked |
