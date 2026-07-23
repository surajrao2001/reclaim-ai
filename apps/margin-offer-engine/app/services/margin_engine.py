from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class DiscountPolicy:
    min_margin_pct: Decimal
    max_discount_pct: Decimal
    max_discount_rupees: Decimal
    food_cost_pct_of_gross: Decimal


@dataclass(frozen=True)
class MarginResult:
    max_discount_rupees: Decimal
    max_margin_safe_discount_pct: Decimal
    food_cost_used: Decimal
    skipped: bool
    skip_reason: str | None = None


def compute_margin_ceiling(
    *,
    gross_amount: Decimal,
    food_cost: Decimal | None,
    policy: DiscountPolicy,
) -> MarginResult:
    if gross_amount <= 0:
        return MarginResult(
            max_discount_rupees=Decimal("0"),
            max_margin_safe_discount_pct=Decimal("0"),
            food_cost_used=Decimal("0"),
            skipped=True,
            skip_reason="non_positive_gross",
        )

    resolved_food_cost = (
        food_cost
        if food_cost is not None
        else (gross_amount * policy.food_cost_pct_of_gross / Decimal("100")).quantize(
            Decimal("0.01")
        )
    )
    min_margin_rupees = (gross_amount * policy.min_margin_pct / Decimal("100")).quantize(
        Decimal("0.01")
    )
    raw_ceiling = gross_amount - resolved_food_cost - min_margin_rupees
    pct_cap = (gross_amount * policy.max_discount_pct / Decimal("100")).quantize(Decimal("0.01"))

    max_discount_rupees = min(raw_ceiling, policy.max_discount_rupees, pct_cap)
    if max_discount_rupees < Decimal("1"):
        return MarginResult(
            max_discount_rupees=Decimal("0"),
            max_margin_safe_discount_pct=Decimal("0"),
            food_cost_used=resolved_food_cost,
            skipped=True,
            skip_reason="discount_below_minimum",
        )

    max_discount_rupees = max_discount_rupees.quantize(Decimal("0.01"))
    pct = (max_discount_rupees / gross_amount * Decimal("100")).quantize(Decimal("0.01"))
    return MarginResult(
        max_discount_rupees=max_discount_rupees,
        max_margin_safe_discount_pct=pct,
        food_cost_used=resolved_food_cost,
        skipped=False,
    )


def pick_favorite_dish(order_items: list[dict] | None) -> str:
    if not order_items:
        return "your usual order"

    best_name = "your usual order"
    best_revenue = Decimal("-1")
    for item in order_items:
        name = str(item.get("name") or "").strip() or "item"
        try:
            qty = Decimal(str(item.get("quantity", 1)))
            price = Decimal(str(item.get("price", 0)))
        except Exception:
            continue
        revenue = qty * price
        if revenue > best_revenue:
            best_revenue = revenue
            best_name = name
    return best_name
