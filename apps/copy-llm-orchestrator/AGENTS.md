# Copy / LLM Orchestrator

Template-first WhatsApp copy. Consumes `offer.ready`, publishes `message.generated`.

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

- No Anthropic key required (static Hinglish template)
- Optional `ANTHROPIC_API_KEY` — Claude used only if set and guardrails pass
- Dev: `POST /v1/offers/{offer_id}/generate-copy`
