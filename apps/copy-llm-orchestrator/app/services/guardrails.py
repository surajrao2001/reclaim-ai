import re
from decimal import Decimal

from app.services.template_copy import format_rupees

_RUPEE_AMOUNT_RE = re.compile(r"₹\s*([0-9]+(?:\.[0-9]+)?)")


class GuardrailError(ValueError):
    pass


def validate_copy(
    *,
    message_body: str,
    selected_discount_value: Decimal | float | int | str,
    max_discount_rupees: Decimal | float | int | str,
) -> None:
    selected = Decimal(str(selected_discount_value))
    expected = Decimal(str(max_discount_rupees))
    if selected != expected:
        raise GuardrailError(
            f"selected_discount_value {selected} != max_discount_rupees {expected}"
        )

    expected_label = format_rupees(expected)
    amounts = _RUPEE_AMOUNT_RE.findall(message_body)
    if not amounts:
        raise GuardrailError("message_body must include the discount as a ₹ amount")

    for raw in amounts:
        found = format_rupees(raw)
        if found != expected_label:
            raise GuardrailError(
                f"message invents ₹{found}; only ₹{expected_label} is allowed"
            )
