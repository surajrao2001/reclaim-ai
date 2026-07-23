"""Optional Claude copy generation. Template path is primary; this is best-effort."""

from decimal import Decimal

import httpx
import structlog

from app.services.template_copy import format_rupees

logger = structlog.get_logger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-20250514"
PROMPT_VERSION = "claude.v1"


async def generate_claude_copy(
    *,
    api_key: str,
    favorite_dish_name: str,
    max_discount_rupees: Decimal | float | int | str,
    cta_url: str,
) -> tuple[str, str] | None:
    """Return (message_body, prompt_version) or None on missing key / failure."""
    if not api_key:
        return None

    discount = format_rupees(max_discount_rupees)
    prompt = (
        "Write a short Hinglish WhatsApp offer message. "
        f"Dish: {favorite_dish_name}. Discount exactly ₹{discount}. "
        f"CTA URL: {cta_url}. "
        "Do not invent any other rupee amounts. Max 2 short lines."
    )
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 256,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()
            parts = data.get("content") or []
            text = "".join(
                block.get("text", "") for block in parts if block.get("type") == "text"
            ).strip()
            if not text:
                return None
            return text, PROMPT_VERSION
    except Exception as exc:
        logger.warning("anthropic_copy_failed", error=str(exc))
        return None
