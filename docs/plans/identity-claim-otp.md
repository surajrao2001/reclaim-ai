# Identity Claim + OTP

**Branch:** `feature/identity-claim-otp`  
**Status:** implemented  
**Primary ownership:** `apps/identity-resolution-service/**`, `apps/claim-web/**`

## Goal

QR claim token → OTP verify → customer merge → `reclaimai.identity.unmasked.v1` → claim JWT.

## Worker steps

- [x] **W0** Claim API types in `libs/shared-types`
- [x] **W1** Identity service: context, OTP, DB, Kafka, JWT
- [x] **W2** claim-web `/c/[token]` UI
- [x] **W3** Unit + integration tests
- [x] **W4** Docs + tracker

## Acceptance criteria

1. Valid token loads claim context
2. Invalid token → 404 error envelope
3. OTP rate limit → 429
4. Wrong OTP → 401
5. Verify creates customer + claim rows, publishes Kafka once
6. Duplicate verify idempotent (no duplicate Kafka)
7. claim-web flow: phone → OTP → success

## Out of scope

RazorpayX cashback, production SMS, Auth0, margin/LLM/WhatsApp.
