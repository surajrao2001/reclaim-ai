# ReclaimAI plans

This folder is the durable source of truth for build work.

## Roles

| Role | Who | Responsibility |
|---|---|---|
| Orchestrator | Main chat in this repo | Plans, sequencing, spawning workers, tracker updates |
| Worker | Subagent / scoped Agent chat | One plan step, locked file ownership |

## Rules

1. Every milestone has `docs/plans/<name>.md`.
2. Status lives in `_tracker.md` — update after every worker finishes.
3. Shared libs (`libs/kafka-contracts`, `shared-types`, `shared-auth`) are serial single-owner.
4. Workers `@` the plan file; they do not invent architecture.
5. Do not parallelize product features that share unfrozen contracts.

## Operating loop

1. Plan Mode → write/approve plan
2. Agent Mode → Orchestrator executes / spawns workers
3. Review reports here
4. Commit / PR to `dev`
