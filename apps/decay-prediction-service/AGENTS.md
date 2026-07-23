# Decay Prediction Service

Phase 0 habit-profile heuristics. Consumes `identity.unmasked`, upserts `offers.customer_habit_profiles`.

## Run

```bash
cd apps/decay-prediction-service
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8003
```

Windows needs `tzdata` (listed in dependencies) for `Asia/Kolkata`.

## Test

```bash
pytest tests/test_decay_unit.py
$env:RUN_INTEGRATION="1"
pytest tests/test_decay_integration.py
```

## Kafka

- Consumes: `reclaimai.identity.unmasked.v1`
- Publishes: none (Phase 0)

## API

`POST /v1/customers/{customer_id}/recompute-habit`
