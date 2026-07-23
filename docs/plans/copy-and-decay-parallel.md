# Plan: Copy + Decay (combined parallel execute)

**Branch:** `feature/copy-llm-orchestrator`  
**Status:** implemented  
**Depends on:** Margin + Identity on `dev`

## Worker steps

- [x] **W0** Confirm `message.generated` + types
- [x] **W1 Copy** (parallel) — template-first, guardrails, Kafka in/out
- [x] **W2 Decay** (parallel) — habit upsert from `identity.unmasked`
- [x] **W3** Unit + integration (copy 7, decay 15)
- [x] **W4** AGENTS.md + tracker

## Acceptance (met)

### Copy
1. `offer.ready` → `message.generated` with matching discount
2. Works without Anthropic key
3. Guardrail blocks invented ₹ amounts
4. Duplicate event safe

### Decay
5. Habit profile upserted
6. top_items / dow / hour from order (IST)
7. Duplicate event safe
8. Isolated from Copy folder

## Ports

- Decay: **8003**
- Copy: **8004**

## After merge

WhatsApp dispatch (consumes `message.generated`).
