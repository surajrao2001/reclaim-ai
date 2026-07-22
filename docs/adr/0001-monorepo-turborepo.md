# ADR-0001: Monorepo + Turborepo for Phase 0

- Status: Accepted
- Date: 2026-07-22
- Deciders: Founding Engineering

## Context

ReclaimAI is a polyglot system (NestJS + FastAPI + Next.js) with shared Kafka contracts
and auth helpers. Phase 0 must ship fast with a small team while preserving the
service boundaries defined in the technical blueprint.

## Decision

Use a single git monorepo managed by **Turborepo** + npm workspaces for Node packages,
with Python services as independent `pyproject.toml` packages under `apps/`.

Kafka contracts live in `libs/kafka-contracts` as versioned JSON Schema files.
Shared TypeScript types are generated/maintained in `libs/shared-types`.

## Consequences

- One PR can update contracts + producers + consumers together.
- Independent deployability is preserved via per-service Docker images (later).
- Python packages are not part of npm workspaces; CI runs them via matrix jobs.
- Nx remains an option if we outgrow Turborepo task graph needs.
