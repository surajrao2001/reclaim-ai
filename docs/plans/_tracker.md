# ReclaimAI build tracker

Last updated: 2026-07-23

## Active

| Milestone | Branch | Status | Notes |
|---|---|---|---|
| WhatsApp dispatch | `feature/whatsapp-dispatch` | implemented | Meta + Gupshup; unit+integration green; ready to commit |

## Queue

| Milestone | Depends on | Notes |
|---|---|---|
| Cashback payout (RazorpayX) | Identity on `dev` | Can run later |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | plans, AGENTS, cursor rules |
| POS order ingest | `feature/pos-order-ingest` | webhook → Postgres → Kafka |
| Identity claim + OTP | `feature/identity-claim-otp` | claim-web + identity + Kafka unmasked |
| Margin offer engine | `feature/margin-offer-engine` | identity.unmasked → offer.ready |
| Copy + Decay (parallel) | `feature/copy-llm-orchestrator` | Template copy + habit profiles → message.generated |
