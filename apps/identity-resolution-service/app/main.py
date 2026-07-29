from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import asyncpg
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.asyncio import Redis

from app.api.claim import router as claim_router
from app.api.claim import webhook_router
from app.api.health import router as health_router
from app.core.config import assert_live_razorpayx_credentials, settings
from app.core.logging import configure_logging
from app.services.cashback_service import CashbackService
from app.services.claim_service import ClaimService
from app.services.database import Database
from app.services.kafka_producer import KafkaProducer
from app.services.otp import OtpService
from app.services.otp_delivery import create_otp_delivery_provider
from app.services.razorpayx import RazorpayXClient

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    assert_live_razorpayx_credentials(settings)

    pool = await asyncpg.create_pool(dsn=settings.asyncpg_dsn, min_size=1, max_size=5)
    redis = Redis.from_url(settings.redis_url, decode_responses=False)
    kafka_raw = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        client_id=settings.kafka_client_id,
    )
    await kafka_raw.start()

    db = Database(pool)
    otp = OtpService(
        redis,
        ttl_seconds=settings.otp_ttl_seconds,
        rate_limit_max=settings.otp_rate_limit_max,
        rate_limit_window_seconds=settings.otp_rate_limit_window_seconds,
    )
    otp_delivery = create_otp_delivery_provider(settings)
    kafka = KafkaProducer(kafka_raw)
    razorpayx = RazorpayXClient(settings)
    claim_service = ClaimService(db, otp, otp_delivery, kafka, settings)
    cashback_service = CashbackService(db, redis, razorpayx, settings)

    app.state.settings = settings
    app.state.db_pool = pool
    app.state.redis = redis
    app.state.kafka_producer = kafka_raw
    app.state.claim_service = claim_service
    app.state.cashback_service = cashback_service

    yield

    await kafka_raw.stop()
    await redis.aclose()
    await pool.close()


app = FastAPI(
    title="ReclaimAI Identity Resolution Service",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    lifespan=lifespan,
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    detail: Any = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(detail),
                "trace_id": "",
                "retryable": False,
            }
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(claim_router)
app.include_router(webhook_router)
