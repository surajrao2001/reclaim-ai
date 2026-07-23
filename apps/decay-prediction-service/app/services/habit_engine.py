from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


@dataclass(frozen=True)
class HabitPrediction:
    predicted_dow: int
    predicted_hour: int
    top_items: list[dict]
    avg_order_value: Decimal
    decay_score: Decimal


def ordered_at_to_ist_dow_hour(ordered_at: datetime) -> tuple[int, int]:
    """Convert ordered_at to Asia/Kolkata weekday (Mon=0) and hour (0-23)."""
    if ordered_at.tzinfo is None:
        ordered_at = ordered_at.replace(tzinfo=timezone.utc)
    local = ordered_at.astimezone(IST)
    return local.weekday(), local.hour


def rank_top_items(order_items: list[dict] | None) -> list[dict]:
    """Rank order items by revenue (quantity * price), descending."""
    if not order_items:
        return []

    ranked: list[tuple[Decimal, dict]] = []
    for item in order_items:
        name = str(item.get("name") or "").strip() or "item"
        try:
            qty = Decimal(str(item.get("quantity", 1)))
            price = Decimal(str(item.get("price", 0)))
        except Exception:
            continue
        revenue = (qty * price).quantize(Decimal("0.01"))
        ranked.append(
            (
                revenue,
                {
                    "name": name,
                    "quantity": float(qty),
                    "price": float(price),
                    "revenue": float(revenue),
                },
            )
        )

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    result: list[dict] = []
    for idx, (_, payload) in enumerate(ranked, start=1):
        result.append({**payload, "rank": idx})
    return result


def compute_avg_order_value(
    existing_avg: Decimal | None,
    gross_amount: Decimal,
) -> Decimal:
    if existing_avg is None:
        return gross_amount.quantize(Decimal("0.01"))
    return ((existing_avg + gross_amount) / Decimal("2")).quantize(Decimal("0.01"))


def compute_decay_score(
    existing_score: Decimal | None,
    *,
    days_since_update: int | None,
) -> Decimal:
    """
    First profile: 0.500.
    If existing and days since updated_at > 14: bump +0.05 capped at 0.999.
    Else: slight pull toward 0.500.
    """
    if existing_score is None:
        return Decimal("0.500")

    if days_since_update is not None and days_since_update > 14:
        bumped = existing_score + Decimal("0.05")
        return min(Decimal("0.999"), bumped).quantize(Decimal("0.001"))

    # Slight decrease/move toward baseline 0.500
    pulled = existing_score + (Decimal("0.500") - existing_score) * Decimal("0.1")
    return pulled.quantize(Decimal("0.001"))


def days_since(updated_at: datetime | None, *, now: datetime | None = None) -> int | None:
    if updated_at is None:
        return None
    now = now or datetime.now(timezone.utc)
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return max(0, (now - updated_at).days)


def build_habit_prediction(
    *,
    ordered_at: datetime,
    order_items: list[dict] | None,
    gross_amount: Decimal,
    existing_avg: Decimal | None = None,
    existing_decay: Decimal | None = None,
    existing_updated_at: datetime | None = None,
    now: datetime | None = None,
) -> HabitPrediction:
    dow, hour = ordered_at_to_ist_dow_hour(ordered_at)
    top_items = rank_top_items(order_items)
    avg = compute_avg_order_value(existing_avg, gross_amount)
    decay = compute_decay_score(
        existing_decay,
        days_since_update=days_since(existing_updated_at, now=now),
    )
    return HabitPrediction(
        predicted_dow=dow,
        predicted_hour=hour,
        top_items=top_items,
        avg_order_value=avg,
        decay_score=decay,
    )
