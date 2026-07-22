from typing import TypedDict


class ApiError(TypedDict):
    code: str
    message: str
    trace_id: str
    retryable: bool


class ApiErrorEnvelope(TypedDict):
    error: ApiError


KAFKA_TOPICS = {
    "ORDER_CREATED": "reclaimai.order.created.v1",
    "IDENTITY_UNMASKED": "reclaimai.identity.unmasked.v1",
    "OFFER_READY": "reclaimai.offer.ready.v1",
    "MESSAGE_GENERATED": "reclaimai.message.generated.v1",
    "WHATSAPP_DELIVERED": "reclaimai.whatsapp.delivered.v1",
    "DIRECT_ORDER_COMPLETED": "reclaimai.direct_order.completed.v1",
}
