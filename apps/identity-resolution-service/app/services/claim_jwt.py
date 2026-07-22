from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt


def sign_claim_jwt(
    *,
    secret: str,
    customer_id: UUID,
    claim_id: UUID,
    aggregator_order_id: UUID,
    ttl_seconds: int,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id),
        "claim_id": str(claim_id),
        "aggregator_order_id": str(aggregator_order_id),
        "scope": "cashback_claim",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")
