# Plan: Margin Offer Engine

**Branch:** `feature/margin-offer-engine`  
**Status:** implemented  
**Depends on:** Identity claim merged to `dev` (`reclaimai.identity.unmasked.v1`)  
**Primary ownership:** `apps/margin-offer-engine/**`

## Goal

Consume `identity.unmasked` → load order + tenant discount policy → compute margin-safe discount ceiling (deterministic, not LLM) → persist `offers.offers` → publish `reclaimai.offer.ready.v1`.

## Worker steps

- [x] **W0** Schema + migrate script; confirm offer.ready contracts; Python TypedDicts
- [x] **W1** Consumer + margin engine + persist + publish `offer.ready`
- [x] **W2** `GET/PUT /v1/tenants/{tenant_id}/settings/discount-policy` (dev-open, no Auth0)
- [x] **W3** Unit + `RUN_INTEGRATION=1` tests
- [x] **W4** AGENTS.md + tracker update

## Acceptance criteria

1. Valid `identity.unmasked` → exactly one `offers.offers` row (`status=pending`)
2. `offer.ready` matches schema (pct, rupees, favorite dish, scheduled_for)
3. Null `food_cost` uses policy fallback and stays margin-safe under defaults
4. Caps never exceeded
5. Duplicate event / same order → no second offer / no duplicate Kafka
6. `consent_whatsapp=false` → no offer
7. Policy GET/PUT works for demo tenant
8. Unit tests pass; integration passes with docker up

## Out of scope

Decay/habit windows, LLM copy, WhatsApp, Auth0 on policy API, Petpooja inventory cost sync, RazorpayX cashback, historical offer ranking.

## Local migrate

```powershell
Get-Content scripts/migrate-margin.sql | docker exec -i reclaimai-postgres psql -U reclaimai -d reclaimai
```
