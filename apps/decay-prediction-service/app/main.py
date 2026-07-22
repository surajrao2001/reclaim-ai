from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title="ReclaimAI Decay Prediction Service",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
)

app.include_router(health_router)
