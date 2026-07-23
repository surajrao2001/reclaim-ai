# ReclaimAI build tracker

Last updated: 2026-07-23

## Active

| Milestone | Branch | Status | Notes |
|---|---|---|---|
| Cashback payout (RazorpayX) | `feature/cashback-payout` | implemented | Mock payout + claim-web UPI step; ready to commit |

## Queue

| Milestone | Depends on | Notes |
|---|---|---|
| Owner dashboard + Auth0 | Tenant auth | Later Phase 0 / B2B |
| Terraform / EKS | Infra | Defer until MVP path is solid |

## Completed

| Milestone | Branch | Notes |
|---|---|---|
| Orchestrator scaffolding | `feature/pos-order-ingest` | plans, AGENTS, cursor rules |
| POS order ingest | `feature/pos-order-ingest` | webhook → Postgres → Kafka |
| Identity claim + OTP | `feature/identity-claim-otp` | claim-web + identity + Kafka unmasked |
| Margin offer engine | `feature/margin-offer-engine` | identity.unmasked → offer.ready |
| Copy + Decay (parallel) | `feature/copy-llm-orchestrator` | Template copy + habit profiles → message.generated |
| WhatsApp dispatch | `feature/whatsapp-dispatch` | Meta + Gupshup → whatsapp.delivered (PR #5) |
