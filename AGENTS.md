# ReclaimAI — Agent guide

## Stack

- Monorepo: Turborepo + npm workspaces (Node), independent Python `pyproject.toml` apps
- NestJS: B2B / integration / WhatsApp / audit services
- FastAPI: identity, margin, decay, LLM, analytics
- Next.js: `dashboard-web`, `claim-web`
- Local infra: Postgres/Timescale, Redis, Redpanda (`docker-compose.dev.yml`)

## Commands

```bash
npm install
cp .env.example .env
npm run docker:up
npm run build --workspace=@reclaimai/shared-types
npm run build --workspace=@reclaimai/shared-auth
```

## Ports

| Service | Port |
|---|---|
| dashboard-web | 3100 |
| claim-web | 3101 |
| tenant-auth-service | 3001 |
| pos-integration-service | 3002 |
| whatsapp-dispatch-service | 3003 |
| notification-audit-service | 3004 |
| identity-resolution-service | 8001 |
| margin-offer-engine | 8002 |
| decay-prediction-service | 8003 |
| copy-llm-orchestrator | 8004 |
| analytics-service | 8005 |
| Postgres | 5432 |
| Redis | 6379 |
| Redpanda Kafka | 19092 |

## Orchestration

- Plans: `docs/plans/`
- Tracker: `docs/plans/_tracker.md`
- ADRs: `docs/adr/`
- Kafka contracts: `libs/kafka-contracts/`

Workers must follow the active plan file and must not change shared contracts unless the plan assigns that step.

## Error envelope

```json
{
  "error": {
    "code": "CODE",
    "message": "human readable",
    "trace_id": "uuid",
    "retryable": false
  }
}
```
