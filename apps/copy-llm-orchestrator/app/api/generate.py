from uuid import UUID

from fastapi import APIRouter, Request

from app.core.errors import api_error
from app.workers.copy_pipeline import CopyPipeline

router = APIRouter(prefix="/v1/offers", tags=["copy"])


@router.post("/{offer_id}/generate-copy")
async def generate_copy(offer_id: UUID, request: Request) -> dict:
    pipeline: CopyPipeline = request.app.state.pipeline
    result = await pipeline.generate_for_offer(offer_id)
    if result.get("status") == "error" and result.get("reason") == "offer_not_found":
        raise api_error(404, "OFFER_NOT_FOUND", f"offer {offer_id} not found")
    if result.get("status") == "error":
        raise api_error(400, "COPY_GENERATE_FAILED", str(result.get("reason")))
    return result
