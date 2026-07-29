from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import Settings
from app.services.anthropic_copy import (
    CLAUDE_MODEL,
    estimate_tokens_from_text,
    generate_claude_copy,
    tokens_from_usage,
)
from app.services.guardrails import GuardrailError, validate_copy
from app.services.redis_daily_budget import RedisDailyBudget
from app.services.template_copy import (
    LLM_MODEL_USED,
    PROMPT_VERSION,
    format_rupees,
    render_template,
)
from app.workers.copy_pipeline import CopyPipeline


def test_template_renders_expected_copy() -> None:
    body = render_template(
        favorite_dish_name="Chicken Dum Biryani",
        max_discount_rupees=Decimal("100.00"),
        cta_url="http://localhost:3101/o/abc",
    )
    assert body == (
        "Hi! Your Chicken Dum Biryani is waiting.\n"
        "Get ₹100 off — order here: http://localhost:3101/o/abc"
    )
    assert LLM_MODEL_USED == "template-static"
    assert PROMPT_VERSION == "template.v1"


def test_format_rupees_strips_trailing_zeros() -> None:
    assert format_rupees(Decimal("50.00")) == "50"
    assert format_rupees(Decimal("50.50")) == "50.5"


def test_guardrail_accepts_matching_discount() -> None:
    body = render_template(
        favorite_dish_name="Naan",
        max_discount_rupees=75,
        cta_url="http://localhost:3101/o/x",
    )
    validate_copy(
        message_body=body,
        selected_discount_value=75,
        max_discount_rupees=75,
    )


def test_guardrail_rejects_mismatched_selected_value() -> None:
    body = render_template(
        favorite_dish_name="Naan",
        max_discount_rupees=75,
        cta_url="http://localhost:3101/o/x",
    )
    with pytest.raises(GuardrailError, match="selected_discount_value"):
        validate_copy(
            message_body=body,
            selected_discount_value=50,
            max_discount_rupees=75,
        )


def test_guardrail_rejects_invented_rupee_amounts() -> None:
    body = (
        "Hi! Your Biryani is waiting.\n"
        "Get ₹100 off, plus extra ₹20 — order here: http://x"
    )
    with pytest.raises(GuardrailError, match="invents"):
        validate_copy(
            message_body=body,
            selected_discount_value=100,
            max_discount_rupees=100,
        )


def test_tokens_from_usage_prefers_api_fields() -> None:
    assert (
        tokens_from_usage(
            {"input_tokens": 40, "output_tokens": 20},
            prompt="x" * 100,
            response_text="y" * 100,
        )
        == 60
    )


def test_tokens_from_usage_falls_back_to_estimate() -> None:
    prompt = "hello world"
    response = "ok"
    assert tokens_from_usage(
        None, prompt=prompt, response_text=response
    ) == estimate_tokens_from_text(prompt) + estimate_tokens_from_text(response)


class _FakeRedis:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}

    async def get(self, key: str) -> bytes | None:
        value = self._store.get(key)
        if value is None:
            return None
        return str(value).encode("utf-8")

    async def incrby(self, key: str, amount: int) -> int:
        current = int(self._store.get(key, 0))
        current += amount
        self._store[key] = current
        return current

    async def expire(self, key: str, _seconds: int) -> bool:
        return key in self._store


def _pipeline(
    *,
    api_key: str | None,
    daily_budget: RedisDailyBudget | None,
) -> CopyPipeline:
    settings = Settings(
        anthropic_api_key=api_key,
        kafka_enabled=False,
    )
    return CopyPipeline(
        db=MagicMock(),
        kafka=MagicMock(),
        idempotency=MagicMock(),
        settings=settings,
        daily_budget=daily_budget,
    )


@pytest.mark.asyncio
async def test_budget_under_limit_attempts_claude(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRedis()
    budget = RedisDailyBudget(fake, daily_token_budget=1000)  # type: ignore[arg-type]
    await budget.increment(10)

    called: dict[str, bool] = {"claude": False}

    async def _fake_claude(**_kwargs: Any) -> tuple[str, str, int]:
        called["claude"] = True
        body = (
            "Hi! Your Paneer Tikka is waiting.\n"
            "Get ₹50 off — order here: http://localhost:3101/o/x"
        )
        return body, "claude.v1", 42

    monkeypatch.setattr(
        "app.workers.copy_pipeline.generate_claude_copy",
        _fake_claude,
    )

    pipeline = _pipeline(api_key="sk-test", daily_budget=budget)
    body, model, prompt_version, fallback = await pipeline._build_copy(
        favorite_dish_name="Paneer Tikka",
        max_discount_rupees=Decimal("50"),
        cta_url="http://localhost:3101/o/x",
    )

    assert called["claude"] is True
    assert model == CLAUDE_MODEL
    assert prompt_version == "claude.v1"
    assert fallback is None
    assert "₹50" in body
    assert await budget.current_usage() == 52  # 10 + 42


@pytest.mark.asyncio
async def test_budget_over_limit_uses_template_without_claude(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _FakeRedis()
    budget = RedisDailyBudget(fake, daily_token_budget=100)  # type: ignore[arg-type]
    await budget.increment(100)

    async def _should_not_run(**_kwargs: Any) -> None:
        raise AssertionError("Claude must not be called when over budget")

    monkeypatch.setattr(
        "app.workers.copy_pipeline.generate_claude_copy",
        _should_not_run,
    )

    pipeline = _pipeline(api_key="sk-test", daily_budget=budget)
    body, model, prompt_version, fallback = await pipeline._build_copy(
        favorite_dish_name="Paneer Tikka",
        max_discount_rupees=Decimal("50"),
        cta_url="http://localhost:3101/o/x",
    )

    assert model == LLM_MODEL_USED
    assert prompt_version == PROMPT_VERSION
    assert fallback == "budget_exceeded"
    assert body == render_template(
        favorite_dish_name="Paneer Tikka",
        max_discount_rupees=Decimal("50"),
        cta_url="http://localhost:3101/o/x",
    )


@pytest.mark.asyncio
async def test_generate_claude_copy_records_usage_tokens() -> None:
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "content": [
            {
                "type": "text",
                "text": (
                    "Arre Paneer Tikka miss ho rahi hai?\n"
                    "Get ₹50 off — order here: http://localhost:3101/o/x"
                ),
            }
        ],
        "usage": {"input_tokens": 33, "output_tokens": 27},
    }

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("app.services.anthropic_copy.httpx.AsyncClient", return_value=mock_client):
        result = await generate_claude_copy(
            api_key="sk-test",
            favorite_dish_name="Paneer Tikka",
            max_discount_rupees=50,
            cta_url="http://localhost:3101/o/x",
        )

    assert result is not None
    body, prompt_version, tokens = result
    assert prompt_version == "claude.v1"
    assert tokens == 60
    assert "₹50" in body
    mock_client.post.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_daily_budget_over_when_zero_cap() -> None:
    budget = RedisDailyBudget(_FakeRedis(), daily_token_budget=0)  # type: ignore[arg-type]
    assert await budget.is_over_budget() is True
