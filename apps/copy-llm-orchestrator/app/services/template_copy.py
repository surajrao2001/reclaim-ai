from decimal import Decimal

PROMPT_VERSION = "template.v1"
LLM_MODEL_USED = "template-static"

TEMPLATE = (
    "Hi! Your {favorite_dish_name} is waiting.\n"
    "Get ₹{max_discount_rupees} off — order here: {cta_url}"
)


def format_rupees(amount: Decimal | float | int | str) -> str:
    value = Decimal(str(amount))
    quantized = value.quantize(Decimal("0.01"))
    if quantized == quantized.to_integral_value():
        return str(int(quantized))
    return format(quantized.normalize(), "f")


def render_template(
    *,
    favorite_dish_name: str,
    max_discount_rupees: Decimal | float | int | str,
    cta_url: str,
) -> str:
    return TEMPLATE.format(
        favorite_dish_name=favorite_dish_name,
        max_discount_rupees=format_rupees(max_discount_rupees),
        cta_url=cta_url,
    )
