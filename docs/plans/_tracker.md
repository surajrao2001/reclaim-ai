# ReclaimAI build tracker

Last updated: 2026-07-22

## Active

| Milestone | Branch | Status | Notes |
|---|---|---|---|
| Margin offer engine | `feature/margin-offer-engine` | implemented | Unit verified; run migrate + integration with docker |

## Queue

| Milestone | Depends on | Notes |
|---|---|---|
| Cashback payout (RazorpayX) | Identity on `dev` | Can run later |
| Decay prediction service | `identity.unmasked` | Parallel after margin merges |
| Copy/LLM orchestrator | `offer.ready` | Claude API |
| WhatsApp dispatch | `message.generated` | Meta + Gupshup failover |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | plans, AGENTS, cursor rules |
| POS order ingest | `feature/pos-order-ingest` | webhook → Postgres → Kafka |
| Identity claim + OTP | `feature/identity-claim-otp` | claim-web + identity + Kafka unmasked |
