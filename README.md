# ReclaimAI

Zero-touch revenue & retention engine for cloud kitchens and restaurants.

This repository is the Phase 0 monorepo implementing
[`ReclaimAI_Technical_Blueprint_v2.md`](./ReclaimAI_Technical_Blueprint_v2.md).

## Architecture (planes)

| Plane | Apps |
|---|---|
| B2B | `dashboard-web`, `tenant-auth-service` |
| Integration | `pos-integration-service` (+ Python sidecar later) |
| B2C | `claim-web`, OTP claim APIs (identity service) |
| AI / Decision | `identity-resolution-service`, `margin-offer-engine`, `decay-prediction-service`, `copy-llm-orchestrator` |
| Dispatch | `whatsapp-dispatch-service` |
| Observability / Audit | `analytics-service`, `notification-audit-service` |

Event backbone: Kafka-compatible topics defined in `libs/kafka-contracts`.

## Prerequisites

- Node.js 20+
- Python 3.12+
- Docker Desktop (for Postgres/Timescale, Redis, Redpanda)

## Quick start

```bash
# 1. Install Node workspaces
npm install

# 2. Copy env
cp .env.example .env

# 3. Start local infra
npm run docker:up

# 4. Build shared libs
npm run build --workspace=@reclaimai/shared-types
npm run build --workspace=@reclaimai/shared-auth

# 5. Run a Nest service (example)
npm run dev --workspace=@reclaimai/pos-integration-service

# 6. Run a Python service (example)
cd apps/identity-resolution-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
```

## Local ports

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
| Redpanda Kafka API | 19092 |
| Redpanda Console | 8080 |

## Folder map

```
apps/     # Deployable services & frontends
libs/     # Shared contracts, auth, UI
infra/    # Terraform, Helm, k8s helpers, local SQL bootstrap
docs/adr/ # Architecture Decision Records
```

## Phase 0 scope

MVP path from the blueprint: Petpooja webhook → identity claim → margin-safe offer →
Claude copy → WhatsApp dispatch, Claude API only (no self-hosted LLM yet).
