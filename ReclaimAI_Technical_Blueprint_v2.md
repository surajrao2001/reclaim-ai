# ReclaimAI — Technical Engineering Blueprint (v2)

**The Zero-Touch Revenue & Retention Engine for Cloud Kitchens & Restaurants**

Prepared for: Founding Engineering Team
Document type: System Design & Architecture Blueprint
Scale target: Millions of end-customers, tens of thousands of restaurant tenants, POS-webhook-driven, real-time WhatsApp dispatch

> **v2 changelog**: Merged three concrete details from an alternative hyperscale-oriented draft — (1) a domain-specific traffic-pattern note explaining *why* the system must handle bursty, not steady, load, (2) a concrete example Petpooja webhook payload/response, (3) a concrete example LLM system prompt — plus named the specific UPI payout and WhatsApp-failover vendors. The phased, MVP-first architecture from the original blueprint is otherwise unchanged: this is still built to start cheap and simple (managed Claude API, no self-hosted GPU inference) and to earn its way into heavier infrastructure only as tenant/message volume actually justifies it.

---

## Table of Contents

1. Overall System Architecture
2. Component Diagram
3. Data Flow Diagram
4. Database Schema
5. Folder Structure
6. API Design
7. Authentication Flow
8. AI Pipeline
9. Model Serving Strategy
10. Prompt Engineering Strategy
11. Security Best Practices
12. Logging
13. Monitoring
14. Rate Limiting
15. Scalability Strategy
16. CI/CD Pipeline
17. Docker Architecture
18. Deployment Strategy
19. Error Handling
20. Future Scaling Roadmap

---

## Recommended Tech Stack (Rationale)

Since the requirement is "millions of users" and a distributed system, the stack is chosen for **independent scalability of hot paths** (webhook ingestion, WhatsApp dispatch) versus **cold paths** (dashboards, reporting):

| Layer | Choice | Why |
|---|---|---|
| Backend — high-throughput/event services | **Python (FastAPI)** | Webhook ingestion, AI/ML orchestration, decay-prediction jobs — Python's ecosystem (pandas, scikit-learn, LangChain-style tooling) is the natural fit for the AI-heavy services |
| Backend — transactional/business services | **NestJS (Node/TypeScript)** | Restaurant onboarding, billing, campaign config, RBAC-heavy CRUD — Nest's modular DI architecture and strong typing suit multi-tenant business logic |
| Frontend | **Next.js (App Router) + React** | Owner-facing dashboard (SSR for fast TTFB on low-end devices used by restaurant owners), plus a lightweight customer-facing claim/cashback web page |
| Primary Database | **PostgreSQL 16** (managed, e.g. RDS/Cloud SQL) with logical sharding by `tenant_id` | Strong relational guarantees for billing/order/margin data; JSONB for flexible POS payloads |
| Time-series / event store | **TimescaleDB extension on Postgres** (or ClickHouse at scale) | Order decay curves, habit-window modeling, WhatsApp engagement analytics |
| Cloud | **AWS** (primary reference; GCP-equivalent noted) | Mumbai (`ap-south-1`) region for India data residency + latency |
| LLM | **Anthropic Claude (Sonnet-class) via API**, with a smaller distilled/open model (e.g. Llama-3-8B fine-tune) for high-volume, low-latency copy generation | Claude for complex reasoning (margin-safe offer design, escalation cases); cheaper model for the 90% "routine" WhatsApp copy generation. **Self-hosted inference (vLLM) is deferred to Phase 1 — see Section 20** — at MVP scale, a managed API call is cheaper and far less operational risk than standing up a GPU node before you have paying tenants. |
| Vector Database | **Pinecone** (managed) or **pgvector** (if staying inside Postgres for cost control pre-Series A) | Store embeddings of customer order history / menu items for similarity-based "next likely order" recommendations |
| Authentication | **Auth0 / Keycloak (OIDC)** for restaurant-owner dashboard SSO + custom **OTP-based auth** for end-customers claiming cashback | Split identity domains: B2B (restaurant staff) vs B2C (diners) |
| Cache | **Redis (ElastiCache)** | Session cache, rate-limit counters, hot menu/margin lookups, idempotency keys for webhooks |
| Queue / Event Bus | **Apache Kafka (MSK)** for the core event backbone; **AWS SQS** for simple task queues (e.g. WhatsApp dispatch retries) | Kafka handles the high-volume, ordered, replayable event stream (POS webhooks → identity resolution → AI scoring → dispatch); SQS handles simple point-to-point retry queues |
| Object Storage | **AWS S3** | Bill photos, thermal sticker templates, WhatsApp media assets |
| Payout Rail | **RazorpayX** (or equivalent India payout API) | Instant UPI cashback payouts triggered from the claim flow — named explicitly so onboarding/compliance work (KYC, payout limits, webhook signing) can start early rather than being a vague "some UPI provider" placeholder |
| WhatsApp Delivery | **Meta WhatsApp Cloud API** (primary) with **Gupshup** (or another Meta Business Solution Provider) as failover | If the Cloud API has an outage or a tenant hits template/rate constraints, dispatch fails over to the BSP route rather than silently dropping messages during a meal-window send |
| Container Orchestration | **Kubernetes (EKS)** | Independent autoscaling per microservice |

---

## 1. Overall System Architecture

ReclaimAI is a **polyglot, event-driven microservices system** organized around four architectural planes.

### Traffic pattern context (why the architecture is bursty-first)

Indian food-service demand is not steady-state — it's concentrated into two sharp daily peaks, and the whole ingestion → decision → dispatch pipeline has to survive both without falling behind:

```
                     TRAFFIC PATTERN PROFILE (INDIA METROS)

   Ingestion Load
     (Webhooks/s)
         ▲
    1500 ┼                                        ┌──────┐
         │                                       ┌┘      └┐
    1000 ┼                  ┌──────┐             │        │
         │                 ┌┘      └┐            │        │
     500 ┼        ┌──┐     │        │    ┌───┐   │        │
         │  ──────┘  └─────┘        └────┘   └───┘        └──────
         └────────────────────────────────────────────────────────►
           00:00    08:00    13:00    16:00    20:00    23:59 (IST)

           Lunch peak: 12:00 PM – 3:30 PM IST
           Dinner peak: 7:00 PM – 11:30 PM IST
```

This is *why* the Decay Prediction and Copy/LLM services are decoupled from the ingestion path via Kafka rather than called synchronously: a burst of webhook traffic at 1:00 PM must never block order ingestion or bill printing at the POS, even if the AI/offer pipeline is momentarily behind. It's also why GPU inference autoscaling (Section 15/20) is designed to scale toward zero *between* these windows rather than run 24/7 — the cost only needs to be paid twice a day, not continuously.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              EDGE / INGRESS PLANE                           │
│   API Gateway (Kong/AWS API GW) → WAF → Rate Limiter → Auth Middleware      │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌───────────────────┐     ┌────────────────────┐
│  B2B PLANE     │      │  INTEGRATION PLANE │     │  B2C PLANE          │
│ (Restaurant     │      │ (Petpooja Webhooks,│     │ (Customer claim web,│
│  Owner Dashboard,│      │  Aggregator Sync,  │     │  WhatsApp Business  │
│  Onboarding, RBAC)│      │  Sticker Print Svc)│     │  API, OTP Auth)     │
└───────────────┘      └───────────────────┘     └────────────────────┘
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 ▼
                  ┌───────────────────────────────┐
                  │       EVENT BACKBONE (Kafka)   │
                  │  order.created / bill.printed /│
                  │  identity.unmasked / offer.ready│
                  └───────────────┬───────────────┘
                                 ▼
                  ┌───────────────────────────────┐
                  │        AI / DECISION PLANE     │
                  │ Identity Resolution, Margin     │
                  │ Engine, Decay Predictor, LLM     │
                  │ Copy Generator, Offer Ranker     │
                  └───────────────┬───────────────┘
                                 ▼
                  ┌───────────────────────────────┐
                  │      DISPATCH PLANE             │
                  │  WhatsApp Cloud API Orchestrator │
                  │  (Gupshup BSP failover)          │
                  │  Delivery/Read receipts, Retry    │
                  └───────────────────────────────┘
```

**Key architectural principles:**

- **Event-driven core**: Every state change (a bill printing, a customer scanning a QR, an offer computed) is an immutable event on Kafka. Services are consumers/producers, never directly coupled — this is what allows independent scaling as tenant count grows into the tens of thousands.
- **Multi-tenancy by design**: Every table, cache key, and Kafka message carries a `tenant_id` (restaurant/brand). Sharding and rate limits are applied per tenant to prevent one high-volume brand from starving others.
- **CQRS for the dashboard**: Write path (POS webhooks, offer engine) is optimized for throughput; read path (owner analytics dashboard) is served from a denormalized read replica / materialized views to avoid blocking the hot write path.
- **Idempotency everywhere**: POS webhooks and WhatsApp delivery callbacks can be retried/duplicated — every consumer is idempotent via dedupe keys stored in Redis.

---

## 2. Component Diagram

```
                                   ┌──────────────────────┐
                                   │   Next.js Dashboard    │
                                   │  (Owner Web App)       │
                                   └───────────┬───────────┘
                                               │ HTTPS/REST + WS
                                   ┌───────────▼───────────┐
                                   │      API Gateway        │
                                   │ (Kong: authn, rate-limit,│
                                   │  routing, request-log)  │
                                   └───────────┬───────────┘
        ┌───────────────┬───────────────┬──────┴───────┬───────────────┬───────────────┐
        ▼               ▼               ▼              ▼               ▼               ▼
┌───────────────┐┌───────────────┐┌───────────────┐┌───────────────┐┌───────────────┐┌───────────────┐
│ Tenant/Auth     ││ POS Integration ││ Identity        ││ Margin/Offer    ││ Copy/LLM       ││ WhatsApp        │
│ Service (Nest)  ││ Service (Nest)  ││ Resolution Svc  ││ Engine (Python) ││ Orchestrator   ││ Dispatch Svc    │
│                 ││ (Petpooja       ││ (Python)        ││                 ││ (Python)       ││ (Nest)          │
│                 ││  webhooks)      ││                 ││                 ││                ││                 │
└───────┬───────┘└───────┬───────┘└───────┬───────┘└───────┬───────┘└───────┬───────┘└───────┬───────┘
        │               │               │              │               │               │
        └───────────────┴───────────────┴──────┬───────┴───────────────┴───────────────┘
                                                ▼
                                   ┌──────────────────────┐
                                   │   Kafka Event Bus       │
                                   └───────────┬───────────┘
                                               │
                   ┌───────────────────────────┼───────────────────────────┐
                   ▼                           ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
        │ Decay Prediction    │       │ Analytics/Reporting │       │ Notification/       │
        │ Service (Python,    │       │ Service (Python +   │       │ Audit Service        │
        │ scheduled jobs)     │       │ ClickHouse/Timescale)│      │ (Nest)               │
        └───────────────────┘       └───────────────────┘       └───────────────────┘

Shared infra: PostgreSQL (per-domain schemas) · Redis · Pinecone/pgvector · S3 · Secrets Manager
```

**Service inventory:**

| Service | Owns | Stack |
|---|---|---|
| Tenant/Auth Service | Restaurant accounts, RBAC, billing plan | NestJS |
| POS Integration Service | Petpooja webhook ingestion, KOT/menu/inventory sync, sticker payload generation | NestJS + Python worker |
| Identity Resolution Service | Phone-number unmasking, profile merge (aggregator order ↔ real customer) | Python |
| Margin/Offer Engine | Reads Petpooja inventory cost data, computes margin-safe discount ceiling | Python |
| Decay Prediction Service | Time-series modeling of ordering habits (day/time/item) | Python (scheduled + streaming) |
| Copy/LLM Orchestrator | Prompt construction, LLM call, guardrails, Hinglish localization | Python |
| WhatsApp Dispatch Service | Template management, send scheduling, delivery/read receipt handling, Gupshup BSP failover | NestJS |
| Analytics/Reporting Service | Owner-facing dashboards, cohort/funnel metrics | Python + ClickHouse |
| Notification/Audit Service | Internal alerts, compliance audit trail | NestJS |

---

## 3. Data Flow Diagram

```
[Zomato/Swiggy Order]
        │
        ▼
[Petpooja POS prints KOT] ──(webhook: order.created)──▶ [POS Integration Svc]
        │                                                        │
        │ (prints sticker via thermal printer plugin)            ▼
        ▼                                                 [Kafka: order.created]
[Customer scans QR sticker]                                     │
        │                                                        ▼
        ▼                                          [Identity Resolution Svc]
[Claim Web App: OTP + phone]                          consumes order.created,
        │                                             waits for identity.claimed
        ▼
[Identity Svc: OTP verify] ──(event: identity.claimed)──▶ merges profile
                                                                  │
                                                                  ▼
                                                   [Kafka: identity.unmasked]
                                                                  │
                                    ┌─────────────────────────────┼─────────────────────────────┐
                                    ▼                             ▼                             ▼
                        [Margin/Offer Engine]         [Decay Prediction Svc]          [Analytics Svc]
                        computes discount ceiling      updates habit model             updates dashboards
                                    │                             │
                                    └──────────────┬──────────────┘
                                                   ▼
                                      [Kafka: offer.ready] (scheduled ~30 min
                                       before predicted habit window)
                                                   ▼
                                        [Copy/LLM Orchestrator]
                                     generates personalized Hinglish
                                        WhatsApp message + CTA link
                                                   ▼
                                      [Kafka: message.generated]
                                                   ▼
                                       [WhatsApp Dispatch Service]
                                    sends via WhatsApp Cloud API
                                    (Gupshup BSP failover on outage),
                                    tracks delivered/read/clicked
                                                   ▼
                                   [Customer taps Direct Order Link]
                                                   ▼
                                     [Direct Order / ONDC Checkout]
                                                   ▼
                              (event: direct_order.completed → feeds back
                               into Margin Engine + Analytics for attribution)
```

---

## 4. Database Schema

Primary store: **PostgreSQL**, logically partitioned by `tenant_id` (restaurant/brand). Below is the core relational schema (simplified, illustrative — not exhaustive DDL).

```sql
-- ===================== TENANCY & AUTH =====================
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    petpooja_restaurant_id TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE staff_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
    auth0_sub TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, email)
);

-- ===================== CUSTOMER IDENTITY =====================
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    phone_number TEXT NOT NULL,          -- E.164, encrypted at rest
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    consent_whatsapp BOOLEAN DEFAULT false,
    UNIQUE(tenant_id, phone_number)
);

CREATE TABLE aggregator_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    petpooja_order_id TEXT NOT NULL,
    aggregator TEXT CHECK (aggregator IN ('zomato','swiggy','direct','ondc')), -- doubles as the order_source
                                                                               -- attribution field: this single
                                                                               -- column is what lets the dashboard
                                                                               -- compute "commission saved" per
                                                                               -- tenant directly (direct/ondc rows
                                                                               -- pay ~0% vs zomato/swiggy rows)
    masked_customer_ref TEXT,             -- aggregator's masked identifier
    customer_id UUID REFERENCES customers(id), -- NULL until unmasked
    order_items JSONB NOT NULL,           -- raw POS line items
    gross_amount NUMERIC(10,2),
    food_cost NUMERIC(10,2),              -- from Petpooja inventory
    ordered_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agg_orders_tenant_time ON aggregator_orders(tenant_id, ordered_at);

CREATE TABLE identity_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregator_order_id UUID REFERENCES aggregator_orders(id),
    customer_id UUID REFERENCES customers(id),
    otp_verified_at TIMESTAMPTZ,
    cashback_amount NUMERIC(10,2),
    upi_txn_ref TEXT,                     -- RazorpayX payout reference
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================== HABIT / DECAY MODEL =====================
CREATE TABLE customer_habit_profiles (
    customer_id UUID PRIMARY KEY REFERENCES customers(id),
    tenant_id UUID REFERENCES tenants(id),
    predicted_dow SMALLINT,               -- 0-6
    predicted_hour SMALLINT,              -- 0-23
    top_items JSONB,                      -- ranked item preferences
    avg_order_value NUMERIC(10,2),
    decay_score NUMERIC(4,3),             -- likelihood of churn to aggregator-only
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===================== OFFERS & DISPATCH =====================
CREATE TABLE offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    customer_id UUID REFERENCES customers(id),
    max_margin_safe_discount_pct NUMERIC(5,2),
    generated_copy TEXT,
    llm_model_used TEXT,
    status TEXT CHECK (status IN ('pending','sent','clicked','converted','expired')),
    scheduled_for TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id UUID REFERENCES offers(id),
    wa_message_id TEXT,
    delivery_channel TEXT CHECK (delivery_channel IN ('meta_cloud_api','gupshup_bsp')) DEFAULT 'meta_cloud_api',
    status TEXT CHECK (status IN ('queued','sent','delivered','read','failed')),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE direct_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    customer_id UUID REFERENCES customers(id),
    offer_id UUID REFERENCES offers(id),
    channel TEXT CHECK (channel IN ('direct_link','ondc')),
    amount NUMERIC(10,2),
    commission_saved NUMERIC(10,2),
    ordered_at TIMESTAMPTZ DEFAULT now()
);
```

**Time-series (TimescaleDB hypertable)** for high-cardinality event analytics:

```sql
CREATE TABLE order_events (
    time TIMESTAMPTZ NOT NULL,
    tenant_id UUID NOT NULL,
    customer_id UUID,
    event_type TEXT,
    payload JSONB
);
SELECT create_hypertable('order_events', 'time');
```

**Vector store (Pinecone / pgvector)**: `customer_id → embedding(order_history)` for similarity search used by the recommendation/copy-personalization step.

---

## 5. Folder Structure

Monorepo (Nx or Turborepo) to share types/contracts across services while keeping independent deployability:

```
reclaimai/
├── apps/
│   ├── dashboard-web/                 # Next.js owner dashboard
│   ├── claim-web/                     # Next.js customer cashback-claim micro-site
│   ├── tenant-auth-service/           # NestJS
│   ├── pos-integration-service/       # NestJS + Python sidecar worker
│   ├── identity-resolution-service/   # Python (FastAPI)
│   ├── margin-offer-engine/           # Python (FastAPI)
│   ├── decay-prediction-service/      # Python (FastAPI + scheduled jobs)
│   ├── copy-llm-orchestrator/         # Python (FastAPI)
│   ├── whatsapp-dispatch-service/     # NestJS
│   ├── analytics-service/             # Python (FastAPI) + ClickHouse
│   └── notification-audit-service/    # NestJS
├── libs/
│   ├── shared-types/                  # OpenAPI/Protobuf-generated TS + Python types
│   ├── shared-auth/                   # JWT validation middleware (both langs)
│   ├── kafka-contracts/               # Avro/JSON schemas for event topics
│   └── ui-components/                 # Shared React component library
├── infra/
│   ├── terraform/                     # VPC, EKS, RDS, MSK, ElastiCache, S3
│   ├── helm-charts/                   # Per-service Helm charts
│   └── k8s/                           # Namespaces, network policies
├── .github/workflows/                 # CI/CD pipelines
├── docker-compose.dev.yml             # Local dev stack
└── docs/
    └── adr/                           # Architecture Decision Records
```

Each service internally follows its ecosystem's convention — e.g. NestJS services use `src/modules/<domain>/{controller,service,dto,entity}.ts`; Python services use `app/{api,core,models,services,workers}/`.

---

## 6. API Design

RESTful + event-driven hybrid. External-facing APIs are REST/JSON behind the gateway; internal service-to-service communication favors **Kafka events** for anything not requiring an immediate synchronous response, and **gRPC** for low-latency internal reads (e.g., Margin Engine querying Identity Service).

**Sample external API surface** (versioned, `/v1`):

```
POST   /v1/webhooks/petpooja/order          # Petpooja → ReclaimAI (signed webhook)
GET    /v1/tenants/:tenantId/dashboard/summary
GET    /v1/tenants/:tenantId/customers
GET    /v1/tenants/:tenantId/offers?status=sent
POST   /v1/claim/otp/request                 # customer claim flow
POST   /v1/claim/otp/verify
POST   /v1/claim/cashback                    # triggers UPI payout via RazorpayX
GET    /v1/tenants/:tenantId/analytics/funnel
POST   /v1/tenants/:tenantId/settings/discount-policy
```

**Worked example — the core webhook** (concrete request/response, so a first implementation has a real shape to code against rather than just an endpoint list):

Request from Petpooja:
```json
POST /v1/webhooks/petpooja/order
Headers:
  X-Petpooja-HMAC-Signature: <SHA256_HASH>
  Content-Type: application/json

{
  "app_key": "reclaim_prod_993810a831",
  "restID": "pp_out_88219",
  "OrderInfo": {
    "Order": {
      "orderID": "PET_ZOM_8831092",
      "order_type": "Delivery",
      "order_from": "Zomato",
      "total_amount": "550.00",
      "discount_amount": "50.00",
      "preorder_date": "2026-07-21 20:15:00"
    },
    "Customer": {
      "name": "Zomato Customer",
      "phone": "9900000000",
      "address": "Masked Address Sector 4"
    },
    "OrderItem": [
      { "id": "item_101", "name": "Chicken Dum Biryani", "quantity": "1", "price": "350.00" },
      { "id": "item_102", "name": "Garlic Naan", "quantity": "2", "price": "100.00" }
    ]
  }
}
```

Response from ReclaimAI (drives what the thermal printer plugin actually prints on the packaging sticker):
```json
{
  "status": "success",
  "message": "Order ingested successfully",
  "reclaim_print_payload": {
    "print_sticker": true,
    "qr_code_url": "https://claim.reclaimai.in/c/3a8f-91a1",
    "sticker_line_1": "Claim ₹100 Instant UPI Cashback",
    "sticker_line_2": "Scan bill on WhatsApp to unlock"
  }
}
```

**Event topic naming convention** (Kafka):

```
reclaimai.order.created.v1
reclaimai.identity.unmasked.v1
reclaimai.offer.ready.v1
reclaimai.message.generated.v1
reclaimai.whatsapp.delivered.v1
reclaimai.direct_order.completed.v1
```

Each event carries a schema-registry-validated envelope:

```json
{
  "event_id": "uuid",
  "event_type": "reclaimai.offer.ready.v1",
  "tenant_id": "uuid",
  "occurred_at": "ISO-8601",
  "payload": { }
}
```

All external endpoints are documented via OpenAPI 3.1 and published to an internal developer portal; SDKs auto-generated for TS/Python.

---

## 7. Authentication Flow

Two **separate identity domains**, because restaurant staff and end-customers have entirely different trust and compliance requirements:

**A. Restaurant Owner / Staff (B2B) — OIDC via Auth0/Keycloak**

```
Owner → Dashboard (Next.js) → redirect to Auth0 → MFA (optional) →
Auth0 issues JWT (RS256) → Dashboard stores in httpOnly cookie →
API Gateway validates JWT signature + tenant claim on every request →
NestJS services use tenant_id from JWT claim to scope every DB query (row-level security)
```

- Roles: `owner`, `manager`, `staff` — enforced via RBAC middleware in each NestJS service.
- Postgres **Row-Level Security (RLS)** policies additionally enforce `tenant_id` isolation at the DB layer as defense-in-depth.

**B. End Customer (B2C) — Phone OTP, no password**

```
Customer scans QR → Claim Web App → enters phone number →
OTP Service (via SMS gateway, e.g. MSG91/Twilio) → customer enters OTP →
short-lived JWT (5 min TTL) issued scoped to that specific bill/claim only →
Cashback payout triggered via RazorpayX UPI payout API →
Longer-lived (30-day) "recognition token" stored to skip OTP on WhatsApp
direct-order clicks (device-bound, revocable)
```

- No permanent password store for customers — reduces attack surface and matches how a low-friction claim flow needs to work.
- WhatsApp opt-in is captured explicitly (DPDP Act / India data-consent compliance) at claim time.

---

## 8. AI Pipeline

```
[Aggregator Order Event]
        │
        ▼
[Feature Extraction]  — item categories, order value, time-of-day, day-of-week,
                         historical frequency, tenant menu metadata
        │
        ▼
[Decay/Habit Model]   — per-customer time-series model (e.g. Prophet / lightweight
                         gradient-boosted model per cohort) predicting next likely
                         order window + churn-to-aggregator-only risk score
        │
        ▼
[Margin Engine]       — deterministic rule engine (NOT LLM) that reads live
                         Petpooja inventory cost data and computes the maximum
                         discount that preserves a configurable minimum margin
        │
        ▼
[Offer Ranking]       — combines decay score + margin ceiling + past offer
                         response history → decides IF/WHEN/HOW MUCH to offer
        │
        ▼
[LLM Copy Generation] — Claude (complex/edge cases) or fine-tuned small model
                         (routine cases) generates Hinglish, brand-voice-matched
                         WhatsApp copy within the offer's constraints
        │
        ▼
[Guardrail/Validation Layer] — checks generated copy for: discount amount matches
                         approved ceiling, no hallucinated promises, brand-safe
                         language, WhatsApp template-policy compliance
        │
        ▼
[Dispatch]
```

**Why the margin calculation is deliberately NOT delegated to the LLM**: discount math is a financial control — it is computed by a deterministic, testable rule engine. The LLM is scoped only to **copywriting** within pre-approved numeric bounds, with a guardrail layer that rejects/regenerates any output where the LLM invents a different number.

---

## 9. Model Serving Strategy

| Workload | Serving approach |
|---|---|
| Decay/habit prediction (per-customer, scheduled) | Batch scoring via Python workers (Celery/Ray) reading from Postgres/Timescale, writing back to `customer_habit_profiles`. Runs nightly + incrementally on new order events. |
| Margin/offer ranking | Stateless rule-engine microservice, horizontally scaled, no GPU needed |
| LLM copy generation (routine volume) | Self-hosted, fine-tuned small model (e.g. Llama-3-8B via **vLLM** on GPU-backed node pool) for cost efficiency at high message volume — **introduced in Phase 1 (Growth), not at MVP** |
| LLM copy generation (complex/escalation, e.g. VIP customers, ambiguous cases) | Anthropic Claude API (managed, no self-hosting) |
| Embeddings for recommendation | Batch-computed via open embedding model, stored in Pinecone/pgvector, refreshed incrementally |

**Serving infra**: vLLM instances (once introduced in Phase 1) run in a dedicated Kubernetes node pool with GPU autoscaling (scale-to-zero during low traffic hours, since WhatsApp dispatch is naturally bursty around the lunch/dinner meal windows shown in Section 1). A request router decides Claude vs. self-hosted model based on a confidence/complexity score from the Offer Ranking step, keeping LLM API spend proportional to genuinely hard cases. At MVP, every request simply goes to the Claude API — there is no self-hosted model to route to yet, which is intentional: it avoids paying for idle GPU capacity before message volume exists to justify it.

---

## 10. Prompt Engineering Strategy

- **Structured prompts, not free text**: The Copy Orchestrator constructs prompts from a template with strict slots — customer name/nickname, top item, day/time, discount %, brand voice tone — never letting the LLM see raw PII beyond first name.
- **System prompt encodes hard constraints** — worked example:

```
SYSTEM_PROMPT_TEMPLATE = """
You are ReclaimAI's ultra-personalized conversational growth manager for {restaurant_name}.
Your goal is to write a high-converting, friendly, non-spammy WhatsApp message in natural Hinglish.

CRITICAL CONSTRAINTS:
1. DISCOUNT CAP: The offer MUST NOT exceed {max_discount_percentage}% off OR ₹{max_discount_rupees}.
2. DISH FOCUS: Must explicitly mention their favorite item: "{favorite_dish_name}".
3. CALL TO ACTION: Direct them to click the direct link to order: {direct_order_url}.
4. EMOJI & TONE: Warm, concise (under 45 words), use 2 relevant emojis max. Do not sound like a corporate ad.

CUSTOMER CONTEXT:
- Customer Name: {customer_name}
- Order Frequency: Every {order_cadence_days} days
- Time Since Last Order: {days_since_last_order} days

Generate JSON output containing "message_body" and "selected_discount_value".
"""
```

- **Output as structured JSON** (message body, CTA text, emoji usage flag) — parsed and validated against the Guardrail/Validation Layer (Section 8) before ever reaching WhatsApp, never inserted into templates as raw freeform text, to satisfy WhatsApp Business API template-approval requirements. Concretely: if `selected_discount_value` in the LLM's JSON output doesn't match `max_discount_percentage`/`max_discount_rupees` from the prompt, the guardrail rejects and regenerates rather than sending — this is the enforcement mechanism referenced in Section 8's "why margin math isn't delegated to the LLM."
- **Few-shot examples per cuisine/brand-voice cluster**, stored and versioned, so a "quick-casual burger joint" tone differs from a "family biryani restaurant" tone.
- **A/B prompt versioning**: every prompt template is versioned; offer outcomes (click/convert) are attributed back to the prompt version for continuous improvement, similar to a feature-flag system.
- **PII minimization**: full phone numbers, exact addresses, and payment details are never included in any LLM prompt.

---

## 11. Security Best Practices

- **Encryption**: TLS 1.3 in transit everywhere; AES-256 at rest for Postgres (KMS-managed keys); phone numbers stored encrypted with per-tenant keys (crypto-shredding supports "right to be forgotten").
- **Webhook signing**: All inbound Petpooja webhooks verified via HMAC signature + IP allowlist; replay protection via nonce + timestamp window.
- **Secrets management**: AWS Secrets Manager / HashiCorp Vault — no secrets in code or environment files committed to VCS.
- **Least privilege IAM**: each microservice has its own IAM role scoped only to the resources it needs (e.g., WhatsApp Dispatch service cannot read the margin/cost tables).
- **Row-Level Security** in Postgres enforcing tenant isolation as defense-in-depth beyond application-layer checks.
- **PII/DPDP Act compliance** (India): explicit consent capture for WhatsApp marketing, data retention policies, right-to-erasure workflows, data localization within `ap-south-1`.
- **Dependency scanning**: Snyk/Dependabot in CI; container images scanned (Trivy) before push to registry.
- **WAF + bot protection** on the public claim-web endpoint (high-value target for cashback fraud).
- **Fraud controls**: rate-limit OTP requests per phone/device, velocity checks on cashback claims per bill, anomaly detection on repeated UPI accounts claiming across many "different" phone numbers.

---

## 12. Logging

- **Structured JSON logging** across all services (Python: `structlog`; NestJS: `pino`), with mandatory fields: `trace_id`, `tenant_id`, `service_name`, `event_type`, `severity`.
- **Correlation IDs propagated** across the entire event chain — a single `order.created` event's `trace_id` is threaded through Kafka headers so a support engineer can trace a single order from POS webhook to WhatsApp delivery.
- **Centralized aggregation**: logs shipped via Fluent Bit → OpenSearch (or Datadog Log Management) with tenant-scoped access control for support staff.
- **PII redaction at the logging middleware layer** — phone numbers, OTPs, and payment identifiers are masked before logs leave the service process.
- **Audit logs** (separate, immutable stream) for every access to customer PII, discount policy changes, and payout approvals — required for compliance review.

---

## 13. Monitoring

- **Metrics**: Prometheus + Grafana; each service exposes `/metrics` (RED method: Rate, Errors, Duration).
- **Business KPIs dashboarded alongside infra metrics**: identity-unmask rate, offer-to-click rate, offer-to-conversion rate, commission saved per tenant, WhatsApp delivery/read rate — these are first-class SLIs, not an afterthought, since they're the product's value proposition.
- **Distributed tracing**: OpenTelemetry across NestJS + Python services, exported to Tempo/Jaeger, so cross-service latency (webhook → offer dispatch) is visible end-to-end.
- **Kafka lag monitoring**: consumer-group lag alerts (Burrow/Prometheus exporter) — critical, since a lagging Decay Prediction consumer means offers get sent too late (missed habit window).
- **Alerting**: PagerDuty/Opsgenie integration; tiered severity (P1: webhook ingestion down / WhatsApp dispatch failing; P2: model drift, elevated latency).
- **Synthetic monitoring**: scheduled probes simulating a full order→dispatch cycle in a sandbox tenant to catch silent pipeline breaks.

---

## 14. Rate Limiting

- **Gateway-level**: Kong rate-limiting plugin, tiered by tenant plan (e.g., Starter: 100 req/min; Enterprise: 2000 req/min), token-bucket algorithm backed by Redis.
- **Per-endpoint limits**: OTP request endpoint aggressively rate-limited (e.g., 3 requests per phone number per 10 minutes) to prevent SMS-bombing/fraud.
- **Webhook ingestion**: Petpooja webhook endpoint has generous but bounded limits per `petpooja_restaurant_id`, with backpressure signaled via HTTP 429 + `Retry-After`, and overflow buffered into Kafka rather than dropped.
- **LLM call budget**: per-tenant daily LLM-spend cap enforced in the Copy Orchestrator to prevent runaway cost from a misconfigured campaign.
- **WhatsApp send-rate compliance**: dispatch service respects Meta's messaging-tier limits per WhatsApp Business Account, queuing/backing off automatically as tenants graduate tiers, and fails over to the Gupshup BSP route (rather than dropping messages) if the Cloud API is degraded during a meal-window send.

---

## 15. Scalability Strategy

- **Stateless services + horizontal pod autoscaling** (HPA) on CPU/queue-depth for every service.
- **Kafka partitioning by `tenant_id`** ensures ordering guarantees per tenant while allowing massive parallelism across tenants; partition count planned for 10x current tenant count headroom.
- **Database scaling path**: start with a single Postgres primary + read replicas → introduce **Citus (Postgres sharding)** or split into tenant-range shards once a single primary approaches write-throughput ceiling → hot time-series data lives in TimescaleDB/ClickHouse from day one to keep the OLTP database lean.
- **Read/write separation (CQRS)**: dashboard reads never hit the primary write path; analytics queries run against ClickHouse materialized views refreshed via CDC (Debezium) from Postgres.
- **Cache-aside pattern** for hot lookups (tenant config, menu/margin data) in Redis, with short TTL + event-driven invalidation on POS sync updates.
- **GPU inference autoscaling** (once self-hosted models are introduced in Phase 1): self-hosted LLM node pool scales with WhatsApp dispatch queue depth, scaling toward zero outside the lunch/dinner meal-window bursts documented in Section 1 to control cost.
- **Geographic scaling**: architecture designed to add a second AWS region (for DR and/or geographic expansion beyond India) by replicating the Kafka backbone (MirrorMaker2) and running region-local dispatch services, since WhatsApp delivery latency and SMS gateways are region-sensitive.

---

## 16. CI/CD Pipeline

```
Developer push → GitHub Actions
   ├─ Lint + type-check (ESLint/mypy)
   ├─ Unit tests (Jest / pytest)
   ├─ Build Docker image
   ├─ Container security scan (Trivy)
   ├─ Push to ECR (tagged by commit SHA)
   ├─ Integration tests (docker-compose ephemeral stack incl. Kafka, Postgres)
   ├─ Deploy to staging (ArgoCD sync via GitOps)
   ├─ Automated smoke tests against staging (order→dispatch synthetic flow)
   └─ Manual approval gate → Production rollout (ArgoCD, canary via Argo Rollouts)
```

- **GitOps**: Kubernetes manifests/Helm values live in a separate `infra` repo; ArgoCD continuously reconciles cluster state — no manual `kubectl apply` in production.
- **Canary deployments**: Argo Rollouts shifts 5% → 25% → 100% traffic with automated rollback on error-rate/latency SLO breach.
- **Database migrations**: run via a dedicated migration job (Flyway/Alembic) gated before the new service version receives traffic, with backward-compatible migration discipline (expand/contract pattern) to support zero-downtime deploys.
- **Feature flags** (LaunchDarkly/Unleash) decouple deploy from release for risky changes (e.g., new LLM model rollout).

---

## 17. Docker Architecture

- **Multi-stage builds** for every service — separate `builder` stage (full toolchain) from `runtime` stage (minimal base image, e.g. `python:3.12-slim` / `node:20-alpine`) to minimize image size and attack surface.
- **One image per service**, no shared "monolith" container — each pushed independently to ECR with immutable SHA-based tags.
- **Non-root user** in every runtime image; read-only root filesystem where possible; explicit `HEALTHCHECK` directives consumed by Kubernetes readiness/liveness probes.
- **Local dev parity**: `docker-compose.dev.yml` spins up Kafka (Redpanda for lightweight local dev), Postgres, Redis, and all services with hot-reload volumes, so local dev mirrors production topology.
- **Sidecar pattern**: OpenTelemetry collector and Fluent Bit run as sidecars/daemonsets rather than baked into application images, keeping app images lean and observability tooling upgradeable independently.

---

## 18. Deployment Strategy

- **Kubernetes (EKS)** with **namespace-per-environment** (`dev`, `staging`, `prod`) and **network policies** restricting cross-namespace traffic.
- **Blue/green for stateful cutover events** (e.g., major Postgres schema changes); **canary rollouts** for standard service releases (see CI/CD section).
- **Multi-AZ** deployment within `ap-south-1` for high availability from day one; multi-region is a Phase 2 roadmap item (see Section 20).
- **Managed data stores** (RDS Multi-AZ, MSK, ElastiCache) rather than self-hosted, to minimize operational burden on a small founding team while retaining the ability to migrate to self-managed at scale if cost dictates.
- **Infrastructure as Code**: 100% Terraform-managed infra, peer-reviewed via PR, no manual console changes ("ClickOps") permitted in shared environments.
- **Disaster recovery**: automated RDS snapshots (point-in-time recovery), Kafka topic replication factor 3, documented RTO/RPO targets (e.g., RPO 5 min, RTO 30 min for the core order-to-dispatch path).

---

## 19. Error Handling

- **Circuit breakers** (e.g., via Nest interceptors / `tenacity` in Python) around all external calls: Petpooja API, WhatsApp Cloud API (with Gupshup BSP as the fallback route), RazorpayX payout API, LLM providers, SMS/OTP gateway — fail fast and fall back gracefully rather than cascading failures.
- **Dead-letter queues (DLQ)** on every Kafka consumer group — malformed or repeatedly-failing events land in a DLQ topic with full context for manual/automated replay, never silently dropped.
- **Idempotency keys**: webhook and payment-related endpoints require an idempotency key so retried requests (common with POS webhook redelivery and WhatsApp callback retries) don't double-process a cashback payout.
- **Graceful degradation**: if the LLM copy service is down, the system falls back to a pre-approved static template rather than skipping the dispatch entirely (preserves the core "don't miss the habit window" value prop).
- **Standardized error envelope** across all APIs:
```json
{
  "error": {
    "code": "MARGIN_ENGINE_UNAVAILABLE",
    "message": "Unable to compute discount ceiling",
    "trace_id": "uuid",
    "retryable": true
  }
}
```
- **Financial-operation safeguards**: any payout (UPI cashback via RazorpayX) is written to a `pending` state first, confirmed via provider webhook, and reconciled by a nightly job that flags mismatches for manual review — never a fire-and-forget payment call.

---

## 20. Future Scaling Roadmap

| Phase | Milestone | Key changes |
|---|---|---|
| **Phase 0 (MVP)** | Single Petpooja integration, 1 AWS region, small tenant set | Monolith-leaning "modular microservices" on a single EKS cluster; Claude API only (no self-hosted LLM yet) |
| **Phase 1 (Growth)** | Multi-hundred tenants, thousands of orders/day | Introduce self-hosted vLLM for cost control; split read/write DB paths (CQRS); ClickHouse for analytics |
| **Phase 2 (Scale)** | Multi-thousand tenants, additional POS integrations (beyond Petpooja) | Postgres sharding via Citus or tenant-range partitioning; POS-integration layer abstracted behind a plugin architecture to onboard non-Petpooja POS systems |
| **Phase 3 (Millions of end-customers)** | National-scale, multi-region | Kafka MirrorMaker2 cross-region replication; regional dispatch services for WhatsApp/SMS latency; dedicated ML platform team for the decay-prediction model, moving from per-customer heuristics to a proper trained embedding-based recommender |
| **Phase 4 (Platform expansion)** | Beyond retention — becomes a full "Direct Commerce OS" | Open API/marketplace for third-party loyalty/CRM add-ons; ONDC-native checkout as a first-class channel; expansion into adjacent verticals (grocery, pharmacy delivery) reusing the same identity-unmasking + decay-prediction core |

---

*End of blueprint. This document is intended as a living artifact — architecture decisions should be captured as ADRs in `docs/adr/` as the system evolves.*
