from datetime import date, datetime, timedelta, timezone

from redis.asyncio import Redis


class RedisDailyBudget:
    """Redis-backed UTC daily counter for Anthropic token usage."""

    def __init__(
        self,
        redis: Redis,
        *,
        daily_token_budget: int,
        key_prefix: str = "copy:anthropic:tokens",
    ) -> None:
        self._redis = redis
        self._daily_token_budget = max(0, int(daily_token_budget))
        self._key_prefix = key_prefix

    @property
    def daily_token_budget(self) -> int:
        return self._daily_token_budget

    def _key(self, day: date | None = None) -> str:
        day = day or datetime.now(timezone.utc).date()
        return f"{self._key_prefix}:{day.isoformat()}"

    async def current_usage(self) -> int:
        raw = await self._redis.get(self._key())
        if raw is None:
            return 0
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            return int(raw)
        except (TypeError, ValueError):
            return 0

    async def is_over_budget(self) -> bool:
        if self._daily_token_budget <= 0:
            return True
        return await self.current_usage() >= self._daily_token_budget

    async def increment(self, tokens: int) -> int:
        """Add tokens to today's counter. Returns new total. TTL ~48h."""
        amount = max(0, int(tokens))
        if amount == 0:
            return await self.current_usage()
        key = self._key()
        total = await self._redis.incrby(key, amount)
        # Keep key across UTC midnight so late increments still expire.
        await self._redis.expire(key, int(timedelta(days=2).total_seconds()))
        return int(total)
