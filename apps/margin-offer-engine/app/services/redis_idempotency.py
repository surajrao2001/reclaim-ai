from redis.asyncio import Redis


class RedisIdempotency:
    def __init__(self, redis: Redis, *, ttl_seconds: int = 60 * 60 * 24 * 7) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds

    def _key(self, event_id: str) -> str:
        return f"margin:event:{event_id}"

    async def already_processed(self, event_id: str) -> bool:
        return bool(await self._redis.exists(self._key(event_id)))

    async def mark_processed(self, event_id: str) -> None:
        await self._redis.set(self._key(event_id), "1", ex=self._ttl_seconds)
