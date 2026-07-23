"""RazorpayX payout client (contact → fund account → payout).

API refs (v1):
- POST /contacts
- POST /fund_accounts
- POST /payouts
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

import httpx
import structlog

from app.core.config import Settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class PayoutResult:
    payout_id: str
    status: str


class RazorpayXError(Exception):
    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__(message)
        self.retryable = retryable


class RazorpayXClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def create_upi_payout(
        self,
        *,
        claim_id: str,
        upi_vpa: str,
        amount_inr: Decimal,
        customer_name: str = "ReclaimAI Customer",
    ) -> PayoutResult:
        if self._settings.razorpayx_mock_enabled:
            payout_id = f"mock_pout_{uuid4().hex[:16]}"
            logger.info("razorpayx_mock_payout", claim_id=claim_id, payout_id=payout_id)
            return PayoutResult(payout_id=payout_id, status="processed")

        if (
            not self._settings.razorpayx_key_id
            or not self._settings.razorpayx_key_secret
            or not self._settings.razorpayx_account_number
        ):
            raise RazorpayXError(
                "RazorpayX credentials not configured",
                retryable=False,
            )

        amount_paise = int(amount_inr * 100)
        if amount_paise <= 0:
            raise RazorpayXError("Cashback amount must be positive", retryable=False)

        auth = (
            self._settings.razorpayx_key_id,
            self._settings.razorpayx_key_secret,
        )
        headers = {
            "Content-Type": "application/json",
            "X-Payout-Idempotency": f"claim:{claim_id}",
        }
        base = self._settings.razorpayx_base_url.rstrip("/")

        async with httpx.AsyncClient(timeout=20.0) as client:
            contact = await self._post(
                client,
                f"{base}/contacts",
                auth=auth,
                headers=headers,
                json_body={
                    "name": customer_name[:50],
                    "type": "customer",
                    "reference_id": claim_id,
                },
            )
            contact_id = str(contact.get("id") or "")
            if not contact_id:
                raise RazorpayXError("RazorpayX contact response missing id")

            fund = await self._post(
                client,
                f"{base}/fund_accounts",
                auth=auth,
                headers=headers,
                json_body={
                    "contact_id": contact_id,
                    "account_type": "vpa",
                    "vpa": {"address": upi_vpa},
                },
            )
            fund_account_id = str(fund.get("id") or "")
            if not fund_account_id:
                raise RazorpayXError("RazorpayX fund account response missing id")

            payout = await self._post(
                client,
                f"{base}/payouts",
                auth=auth,
                headers=headers,
                json_body={
                    "account_number": self._settings.razorpayx_account_number,
                    "fund_account_id": fund_account_id,
                    "amount": amount_paise,
                    "currency": "INR",
                    "mode": "UPI",
                    "purpose": "cashback",
                    "queue_if_low_balance": True,
                    "reference_id": claim_id,
                    "narration": "ReclaimAI cashback",
                },
            )
            payout_id = str(payout.get("id") or "")
            if not payout_id:
                raise RazorpayXError("RazorpayX payout response missing id")
            return PayoutResult(
                payout_id=payout_id,
                status=str(payout.get("status") or "processing"),
            )

    async def _post(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        auth: tuple[str, str],
        headers: dict[str, str],
        json_body: dict,
    ) -> dict:
        try:
            response = await client.post(url, auth=auth, headers=headers, json=json_body)
        except httpx.TimeoutException as exc:
            raise RazorpayXError("RazorpayX request timed out", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise RazorpayXError(f"RazorpayX network error: {exc}", retryable=True) from exc

        if response.status_code >= 500 or response.status_code == 429:
            raise RazorpayXError(
                f"RazorpayX error {response.status_code}",
                retryable=True,
            )
        if response.status_code >= 400:
            raise RazorpayXError(
                f"RazorpayX error {response.status_code}",
                retryable=False,
            )
        data = response.json()
        if not isinstance(data, dict):
            raise RazorpayXError("Unexpected RazorpayX response shape", retryable=True)
        return data
