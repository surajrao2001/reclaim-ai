from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.otp import OtpService


@pytest.mark.asyncio
async def test_otp_rate_limit_allows_within_window() -> None:
    redis = MagicMock()
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock()
    redis.setex = AsyncMock()
    otp = OtpService(
        redis,
        ttl_seconds=300,
        rate_limit_max=3,
        rate_limit_window_seconds=600,
    )
    code = await otp.issue_otp("tok", "+919900000000")
    assert len(code) == 6
    redis.incr.assert_awaited()
    redis.setex.assert_awaited()


@pytest.mark.asyncio
async def test_otp_rate_limit_blocks_over_max() -> None:
    redis = MagicMock()
    redis.incr = AsyncMock(return_value=4)
    redis.expire = AsyncMock()
    redis.setex = AsyncMock()
    otp = OtpService(
        redis,
        ttl_seconds=300,
        rate_limit_max=3,
        rate_limit_window_seconds=600,
    )
    with pytest.raises(PermissionError, match="OTP rate limit exceeded"):
        await otp.issue_otp("tok", "+919900000000")
    redis.setex.assert_not_called()
