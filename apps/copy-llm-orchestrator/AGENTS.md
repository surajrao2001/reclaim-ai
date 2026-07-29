# Copy / LLM Orchestrator

Claude-primary WhatsApp copy when `ANTHROPIC_API_KEY` is set. Template is fallback
on missing key, API failure, guardrail failure, or daily token budget exceeded.
Consumes `offer.ready`, publishes `message.generated`.

## Run

```bash
cd apps/copy-llm-orchestrator
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8004
```

## Test

```bash
pytest tests/test_copy_unit.py
$env:RUN_INTEGRATION="1"
pytest tests/test_copy_integration.py
```

## Kafka

- Consumes: `reclaimai.offer.ready.v1`
- Publishes: `reclaimai.message.generated.v1`

## Notes

- Portfolio demo: set `ANTHROPIC_API_KEY` so offers use Claude-generated copy
- `ANTHROPIC_DAILY_TOKEN_BUDGET` (default `100000`) — Redis UTC daily counter; over budget → template with `fallback_reason=budget_exceeded` (pipeline still succeeds)
- Template remains the only path when the key is empty
- Dev: `POST /v1/offers/{offer_id}/generate-copy`
