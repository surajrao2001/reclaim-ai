from decimal import Decimal

from app.services.margin_engine import (
    DiscountPolicy,
    compute_margin_ceiling,
    pick_favorite_dish,
)


DEFAULT_POLICY = DiscountPolicy(
    min_margin_pct=Decimal("25"),
    max_discount_pct=Decimal("20"),
    max_discount_rupees=Decimal("100"),
    food_cost_pct_of_gross=Decimal("35"),
)


def test_null_food_cost_uses_fallback() -> None:
    # gross 550, food 35% = 192.5, min margin 25% = 137.5
    # raw = 550 - 192.5 - 137.5 = 220 → capped by 100 and 20% (110) → 100
    result = compute_margin_ceiling(
        gross_amount=Decimal("550"),
        food_cost=None,
        policy=DEFAULT_POLICY,
    )
    assert not result.skipped
    assert result.max_discount_rupees == Decimal("100.00")
    assert result.max_margin_safe_discount_pct == Decimal("18.18")


def test_pct_cap_binds() -> None:
    policy = DiscountPolicy(
        min_margin_pct=Decimal("10"),
        max_discount_pct=Decimal("5"),
        max_discount_rupees=Decimal("500"),
        food_cost_pct_of_gross=Decimal("20"),
    )
    result = compute_margin_ceiling(
        gross_amount=Decimal("1000"),
        food_cost=Decimal("200"),
        policy=policy,
    )
    # raw = 1000-200-100=700; pct cap=50; rupees cap=500 → 50
    assert result.max_discount_rupees == Decimal("50.00")
    assert result.max_margin_safe_discount_pct == Decimal("5.00")


def test_min_margin_eats_all() -> None:
    policy = DiscountPolicy(
        min_margin_pct=Decimal("60"),
        max_discount_pct=Decimal("20"),
        max_discount_rupees=Decimal("100"),
        food_cost_pct_of_gross=Decimal("35"),
    )
    result = compute_margin_ceiling(
        gross_amount=Decimal("100"),
        food_cost=Decimal("40"),
        policy=policy,
    )
    # raw = 100-40-60 = 0 → skipped
    assert result.skipped
    assert result.skip_reason == "discount_below_minimum"


def test_zero_gross_skipped() -> None:
    result = compute_margin_ceiling(
        gross_amount=Decimal("0"),
        food_cost=None,
        policy=DEFAULT_POLICY,
    )
    assert result.skipped


def test_favorite_dish_highest_revenue() -> None:
    name = pick_favorite_dish(
        [
            {"name": "Naan", "quantity": 2, "price": 50},
            {"name": "Biryani", "quantity": 1, "price": 350},
        ]
    )
    assert name == "Biryani"


def test_favorite_dish_empty() -> None:
    assert pick_favorite_dish([]) == "your usual order"
