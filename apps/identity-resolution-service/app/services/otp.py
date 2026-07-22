import secrets

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)


class OtpService:
    def __init__(
        self,
        redis: Redis,
        *,
        ttl_seconds: int,
        rate_limit_max: int,
        rate_limit_window_seconds: int,
    ) -> None:
        self._redis = redis
        self._ttl_seconds = ttl_seconds
        self._rate_limit_max = rate_limit_max
        self._rate_limit_window_seconds = rate_limit_window_seconds

    def _otp_key(self, claim_token: str, phone_e164: str) -> str:
        return f"otp:claim:{claim_token}:{phone_e164}"

    def _rate_key(self, phone_e164: str) -> str:
        return f"otp:ratelimit:{phone_e164}"

    async def check_rate_limit(self, phone_e164: str) -> None:
        key = self._rate_key(phone_e164)
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, self._rate_limit_window_seconds)
        if count > self._rate_limit_max:
            raise PermissionError("OTP rate limit exceeded")

    async def issue_otp(self, claim_token: str, phone_e164: str) -> str:
        await self.check_rate_limit(phone_e164)
        otp = f"{secrets.randbelow(1_000_000):06d}"
        await self._redis.setex(
            self._otp_key(claim_token, phone_e164),
            self._ttl_seconds,
            otp,
        )
        logger.info("otp_issued", phone_suffix=phone_e164[-4:])
        return otp

    async def verify_otp(self, claim_token: str, phone_e164: str, otp: str) -> bool:
        key = self._otp_key(claim_token, phone_e164)
        stored = await self._redis.get(key)
        if stored is None:
            return False
        if stored.decode("utf-8") != otp.strip():
            return False
        await self._redis.delete(key)
        return True

    async def peek_otp(self, claim_token: str, phone_e164: str) -> str | None:
        stored = await self._redis.get(self._otp_key(claim_token, phone_e164))
        return stored.decode("utf-8") if stored else None
