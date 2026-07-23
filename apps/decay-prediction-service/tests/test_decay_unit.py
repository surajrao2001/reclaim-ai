from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.services.habit_engine import (
    build_habit_prediction,
    compute_avg_order_value,
    compute_decay_score,
    ordered_at_to_ist_dow_hour,
    rank_top_items,
)

IST = ZoneInfo("Asia/Kolkata")


def test_ordered_at_converts_to_ist_dow_hour() -> None:
    # 2024-01-15 18:30 UTC = 2024-01-16 00:00 IST (Tue) hour 0
    # Actually 18:30 UTC + 5:30 = 00:00 IST next day
    utc = datetime(2024, 1, 15, 18, 30, tzinfo=timezone.utc)
    dow, hour = ordered_at_to_ist_dow_hour(utc)
    local = utc.astimezone(IST)
    assert dow == local.weekday()
    assert hour == local.hour
    assert dow == 1  # Tuesday
    assert hour == 0


def test_ordered_at_naive_assumed_utc() -> None:
    naive = datetime(2024, 6, 10, 12, 0, 0)  # Monday noon UTC → 17:30 IST
    dow, hour = ordered_at_to_ist_dow_hour(naive)
    assert dow == 0  # Monday
    assert hour == 17


def test_rank_top_items_by_revenue() -> None:
    ranked = rank_top_items(
        [
            {"name": "Naan", "quantity": 2, "price": 50},
            {"name": "Biryani", "quantity": 1, "price": 350},
            {"name": "Raita", "quantity": 1, "price": 40},
        ]
    )
    assert [item["name"] for item in ranked] == ["Biryani", "Naan", "Raita"]
    assert ranked[0]["rank"] == 1
    assert ranked[0]["revenue"] == 350.0


def test_rank_top_items_empty() -> None:
    assert rank_top_items([]) == []
    assert rank_top_items(None) == []


def test_avg_order_value_first_is_gross() -> None:
    assert compute_avg_order_value(None, Decimal("550.00")) == Decimal("550.00")


def test_avg_order_value_rolling() -> None:
    assert compute_avg_order_value(Decimal("400.00"), Decimal("600.00")) == Decimal("500.00")


def test_decay_score_first_profile() -> None:
    assert compute_decay_score(None, days_since_update=None) == Decimal("0.500")


def test_decay_score_bump_after_14_days() -> None:
    score = compute_decay_score(Decimal("0.500"), days_since_update=15)
    assert score == Decimal("0.550")


def test_decay_score_capped_at_999() -> None:
    score = compute_decay_score(Decimal("0.980"), days_since_update=20)
    assert score == Decimal("0.999")


def test_decay_score_pull_toward_baseline() -> None:
    # Within 14 days: slight pull toward 0.500
    score = compute_decay_score(Decimal("0.700"), days_since_update=3)
    # 0.700 + (0.500 - 0.700) * 0.1 = 0.680
    assert score == Decimal("0.680")


def test_build_habit_prediction_first() -> None:
    ordered_at = datetime(2024, 1, 15, 10, 0, tzinfo=IST)  # Monday 10:00 IST
    pred = build_habit_prediction(
        ordered_at=ordered_at,
        order_items=[{"name": "Biryani", "quantity": 1, "price": 350}],
        gross_amount=Decimal("350.00"),
    )
    assert pred.predicted_dow == 0
    assert pred.predicted_hour == 10
    assert pred.decay_score == Decimal("0.500")
    assert pred.avg_order_value == Decimal("350.00")
    assert pred.top_items[0]["name"] == "Biryani"


def test_build_habit_prediction_stale_bump() -> None:
    ordered_at = datetime(2024, 3, 1, 20, 0, tzinfo=IST)
    now = datetime(2024, 3, 20, tzinfo=timezone.utc)
    pred = build_habit_prediction(
        ordered_at=ordered_at,
        order_items=[],
        gross_amount=Decimal("200.00"),
        existing_avg=Decimal("300.00"),
        existing_decay=Decimal("0.600"),
        existing_updated_at=now - timedelta(days=16),
        now=now,
    )
    assert pred.avg_order_value == Decimal("250.00")
    assert pred.decay_score == Decimal("0.650")
