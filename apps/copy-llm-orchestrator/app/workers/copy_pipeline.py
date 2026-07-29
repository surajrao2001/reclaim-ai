from decimal import Decimal
from uuid import UUID

import structlog

from app.core.config import Settings
from app.services.anthropic_copy import CLAUDE_MODEL, generate_claude_copy
from app.services.database import Database
from app.services.guardrails import GuardrailError, validate_copy
from app.services.kafka_producer import KafkaProducer
from app.services.redis_daily_budget import RedisDailyBudget
from app.services.redis_idempotency import RedisIdempotency
from app.services.template_copy import (
    LLM_MODEL_USED as TEMPLATE_MODEL,
    PROMPT_VERSION as TEMPLATE_PROMPT_VERSION,
    render_template,
)

logger = structlog.get_logger(__name__)


class CopyPipeline:
    def __init__(
        self,
        db: Database,
        kafka: KafkaProducer,
        idempotency: RedisIdempotency,
        settings: Settings,
        daily_budget: RedisDailyBudget | None = None,
    ) -> None:
        self._db = db
        self._kafka = kafka
        self._idempotency = idempotency
        self._settings = settings
        self._daily_budget = daily_budget

    def _resolve_cta(self, payload: dict, offer_id: UUID) -> str:
        direct = payload.get("direct_order_url")
        if isinstance(direct, str) and direct.strip():
            return direct.strip()
        base = self._settings.claim_web_base_url.rstrip("/")
        return f"{base}/o/{offer_id}"

    def _template_copy(
        self,
        *,
        favorite_dish_name: str,
        max_discount_rupees: Decimal,
        cta_url: str,
        fallback_reason: str | None,
    ) -> tuple[str, str, str, str | None]:
        body = render_template(
            favorite_dish_name=favorite_dish_name,
            max_discount_rupees=max_discount_rupees,
            cta_url=cta_url,
        )
        validate_copy(
            message_body=body,
            selected_discount_value=max_discount_rupees,
            max_discount_rupees=max_discount_rupees,
        )
        return body, TEMPLATE_MODEL, TEMPLATE_PROMPT_VERSION, fallback_reason

    async def _build_copy(
        self,
        *,
        favorite_dish_name: str,
        max_discount_rupees: Decimal,
        cta_url: str,
    ) -> tuple[str, str, str, str | None]:
        """Return (message_body, llm_model_used, prompt_version, fallback_reason).

        When ANTHROPIC_API_KEY is set, Claude is the primary path. Template is used
        only on missing key, budget exceeded, API failure, or guardrail failure.
        """
        api_key = (self._settings.anthropic_api_key or "").strip()
        if not api_key:
            return self._template_copy(
                favorite_dish_name=favorite_dish_name,
                max_discount_rupees=max_discount_rupees,
                cta_url=cta_url,
                fallback_reason="no_api_key",
            )

        if self._daily_budget is not None and await self._daily_budget.is_over_budget():
            usage = await self._daily_budget.current_usage()
            logger.warning(
                "anthropic_budget_exceeded",
                fallback_reason="budget_exceeded",
                usage_tokens=usage,
                daily_token_budget=self._daily_budget.daily_token_budget,
            )
            return self._template_copy(
                favorite_dish_name=favorite_dish_name,
                max_discount_rupees=max_discount_rupees,
                cta_url=cta_url,
                fallback_reason="budget_exceeded",
            )

        claude = await generate_claude_copy(
            api_key=api_key,
            favorite_dish_name=favorite_dish_name,
            max_discount_rupees=max_discount_rupees,
            cta_url=cta_url,
        )
        if claude is not None:
            body, prompt_version, tokens_used = claude
            try:
                validate_copy(
                    message_body=body,
                    selected_discount_value=max_discount_rupees,
                    max_discount_rupees=max_discount_rupees,
                )
            except GuardrailError as exc:
                logger.warning(
                    "claude_copy_guardrail_failed",
                    error=str(exc),
                    fallback_reason="guardrail_failed",
                )
                return self._template_copy(
                    favorite_dish_name=favorite_dish_name,
                    max_discount_rupees=max_discount_rupees,
                    cta_url=cta_url,
                    fallback_reason="guardrail_failed",
                )

            if self._daily_budget is not None:
                total = await self._daily_budget.increment(tokens_used)
                logger.info(
                    "anthropic_usage_recorded",
                    tokens_used=tokens_used,
                    daily_usage_tokens=total,
                    daily_token_budget=self._daily_budget.daily_token_budget,
                )
            return body, CLAUDE_MODEL, prompt_version, None

        logger.warning(
            "claude_copy_unavailable",
            fallback_reason="api_failure",
        )
        return self._template_copy(
            favorite_dish_name=favorite_dish_name,
            max_discount_rupees=max_discount_rupees,
            cta_url=cta_url,
            fallback_reason="api_failure",
        )

    async def handle_offer_ready(self, envelope: dict) -> dict:
        event_id = str(envelope.get("event_id") or "")
        tenant_id = UUID(str(envelope["tenant_id"]))
        payload = envelope.get("payload") or {}
        offer_id = UUID(str(payload["offer_id"]))
        max_discount_rupees = Decimal(str(payload["max_discount_rupees"]))
        favorite_dish_name = str(payload.get("favorite_dish_name") or "your usual order")
        trace_id = str(envelope.get("trace_id") or event_id)

        if event_id and await self._idempotency.already_processed(event_id):
            logger.info("duplicate_event_skipped", event_id=event_id)
            return {"status": "duplicate"}

        offer = await self._db.get_offer(offer_id)
        if offer is None:
            logger.warning("offer_not_found", offer_id=str(offer_id))
            return {"status": "error", "reason": "offer_not_found"}

        if offer.tenant_id != tenant_id:
            logger.warning("tenant_mismatch", offer_id=str(offer_id))
            return {"status": "error", "reason": "tenant_mismatch"}

        if offer.generated_copy:
            if event_id:
                await self._idempotency.mark_processed(event_id)
            logger.info("copy_already_set", offer_id=str(offer_id))
            return {"status": "skipped", "reason": "generated_copy_already_set"}

        cta_url = self._resolve_cta(payload, offer_id)
        message_body, llm_model_used, prompt_version, fallback_reason = await self._build_copy(
            favorite_dish_name=favorite_dish_name,
            max_discount_rupees=max_discount_rupees,
            cta_url=cta_url,
        )

        written = await self._db.update_generated_copy(
            offer_id=offer_id,
            generated_copy=message_body,
            llm_model_used=llm_model_used,
        )
        if not written:
            if event_id:
                await self._idempotency.mark_processed(event_id)
            logger.info("copy_already_set_race", offer_id=str(offer_id))
            return {"status": "skipped", "reason": "generated_copy_already_set"}

        await self._kafka.publish_message_generated(
            tenant_id=tenant_id,
            offer_id=offer_id,
            message_body=message_body,
            selected_discount_value=max_discount_rupees,
            llm_model_used=llm_model_used,
            prompt_version=prompt_version,
            cta_url=cta_url,
            trace_id=trace_id,
        )

        if event_id:
            await self._idempotency.mark_processed(event_id)

        result = {
            "status": "ok",
            "offer_id": str(offer_id),
            "message_body": message_body,
            "selected_discount_value": float(max_discount_rupees),
            "llm_model_used": llm_model_used,
            "prompt_version": prompt_version,
            "cta_url": cta_url,
        }
        if fallback_reason:
            result["fallback_reason"] = fallback_reason
        return result

    async def generate_for_offer(self, offer_id: UUID) -> dict:
        offer = await self._db.get_offer(offer_id)
        if offer is None:
            return {"status": "error", "reason": "offer_not_found"}

        envelope = {
            "event_id": f"dev-generate-{offer_id}",
            "event_type": "reclaimai.offer.ready.v1",
            "tenant_id": str(offer.tenant_id),
            "trace_id": f"dev-generate-{offer_id}",
            "payload": {
                "offer_id": str(offer.id),
                "customer_id": str(offer.customer_id),
                "max_margin_safe_discount_pct": float(offer.max_margin_safe_discount_pct),
                "max_discount_rupees": float(offer.max_discount_rupees),
                "favorite_dish_name": offer.favorite_dish_name,
                "direct_order_url": (
                    f"{self._settings.claim_web_base_url.rstrip('/')}/o/{offer.id}"
                ),
            },
        }
        return await self.handle_offer_ready(envelope)
