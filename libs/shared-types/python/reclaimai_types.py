from typing import TypedDict


class ApiError(TypedDict):
    code: str
    message: str
    trace_id: str
    retryable: bool


class ApiErrorEnvelope(TypedDict):
    error: ApiError


class ClaimContextResponse(TypedDict):
    claim_token: str
    tenant_name: str
    order_id: str
    petpooja_order_id: str
    gross_amount: float
    cashback_amount_inr: int
    already_claimed: bool


class ClaimOtpVerifyResponse(TypedDict):
    claim_jwt: str
    customer_id: str
    message: str


class IdentityUnmaskedPayload(TypedDict, total=False):
    customer_id: str
    aggregator_order_id: str
    consent_whatsapp: bool
    phone_e164_hash: str


class OfferReadyPayload(TypedDict, total=False):
    offer_id: str
    customer_id: str
    max_margin_safe_discount_pct: float
    max_discount_rupees: float
    scheduled_for: str
    favorite_dish_name: str
    decay_score: float | None
    direct_order_url: str


class EventEnvelope(TypedDict, total=False):
    event_id: str
    event_type: str
    tenant_id: str
    trace_id: str
    occurred_at: str
    payload: dict


KAFKA_TOPICS = {
    "ORDER_CREATED": "reclaimai.order.created.v1",
    "IDENTITY_UNMASKED": "reclaimai.identity.unmasked.v1",
    "OFFER_READY": "reclaimai.offer.ready.v1",
    "MESSAGE_GENERATED": "reclaimai.message.generated.v1",
    "WHATSAPP_DELIVERED": "reclaimai.whatsapp.delivered.v1",
    "DIRECT_ORDER_COMPLETED": "reclaimai.direct_order.completed.v1",
}
