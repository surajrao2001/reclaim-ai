from decimal import Decimal

import pytest

from app.services.guardrails import GuardrailError, validate_copy
from app.services.template_copy import (
    LLM_MODEL_USED,
    PROMPT_VERSION,
    format_rupees,
    render_template,
)


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
