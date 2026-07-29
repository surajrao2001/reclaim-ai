from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging

configure_logging()

_docs = settings.expose_openapi_docs
app = FastAPI(
    title="ReclaimAI Analytics Service",
    version="0.1.0",
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

app.include_router(health_router)
