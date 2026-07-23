# ReclaimAI build tracker

Last updated: 2026-07-23

## Active

| Milestone | Branch | Status | Notes |
|---|---|---|---|
| Copy + Decay (parallel) | `feature/copy-llm-orchestrator` | implemented | Template copy + habit profiles; ready to commit |

## Queue

| Milestone | Depends on | Notes |
|---|---|---|
| WhatsApp dispatch | `message.generated` | Meta Cloud API + Gupshup failover |
| Cashback payout (RazorpayX) | Identity on `dev` | Can run later |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | plans, AGENTS, cursor rules |
| POS order ingest | `feature/pos-order-ingest` | webhook → Postgres → Kafka |
| Identity claim + OTP | `feature/identity-claim-otp` | claim-web + identity + Kafka unmasked |
| Margin offer engine | `feature/margin-offer-engine` | identity.unmasked → offer.ready |
