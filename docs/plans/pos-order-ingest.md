# Plan: POS Order Ingest

**Branch:** `feature/pos-order-ingest`  
**Status:** implemented (unit verified; integration pending Docker)  
**Primary ownership:** `apps/pos-integration-service/**`

## Goal

Petpooja webhook → verify HMAC on raw body → resolve tenant → idempotent persist → publish `reclaimai.order.created.v1` → return sticker print payload.

## Ownership

| Path | Owner |
|---|---|
| `apps/pos-integration-service/**` | This milestone |
| `libs/kafka-contracts/schemas/order-created.v1.json` | W0 only (confirm/tiny gaps) |
| `libs/shared-types/**` | W0 only if types drift |
| `infra/k8s/init-db.sql` | Seed tenant for local/dev only |

## Worker steps

- [x] **W0** Confirm order.created contract + shared-types align
- [x] **W1** Raw-body HMAC middleware + DTO validation + print payload
- [x] **W2** Postgres: tenant by `restID`, idempotent `commerce.aggregator_orders`
- [x] **W3** Redis idempotency key + Kafka publish
- [x] **W4** Unit tests pass; integration suite ready (`RUN_INTEGRATION=1` when Docker is up)

## Acceptance criteria

1. Missing/invalid HMAC → `401` with standard error envelope
2. Unknown `restID` → `404` `TENANT_NOT_FOUND`
3. Duplicate `(tenant_id, petpooja_order_id)` → no double row; same success payload; no duplicate Kafka event when Redis/DB idempotent hit
4. Row written to `commerce.aggregator_orders`
5. Kafka message on `reclaimai.order.created.v1` matches envelope + payload schemas
6. Unit tests pass; integration when `RUN_INTEGRATION=1` + docker-compose healthy

## Out of scope

Identity OTP, claim-web, margin, LLM, WhatsApp, Auth0, Terraform/EKS.

## Notes

- Local seed tenant: `pp_out_88219` → `11111111-1111-1111-1111-111111111111`
- If Postgres volume was created before seed SQL existed: `docker compose -f docker-compose.dev.yml down -v` then `up -d`
