from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.core.errors import api_error


@dataclass(frozen=True)
class ClaimJwtClaims:
    customer_id: UUID
    claim_id: UUID
    aggregator_order_id: UUID


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


def verify_claim_jwt(*, secret: str, token: str) -> ClaimJwtClaims:
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise api_error(401, "CLAIM_JWT_INVALID", "Claim token is invalid or expired") from exc

    if payload.get("scope") != "cashback_claim":
        raise api_error(401, "CLAIM_JWT_INVALID", "Claim token scope is invalid")

    try:
        return ClaimJwtClaims(
            customer_id=UUID(str(payload["sub"])),
            claim_id=UUID(str(payload["claim_id"])),
            aggregator_order_id=UUID(str(payload["aggregator_order_id"])),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise api_error(401, "CLAIM_JWT_INVALID", "Claim token claims are invalid") from exc
