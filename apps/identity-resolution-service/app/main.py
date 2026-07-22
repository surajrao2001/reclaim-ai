from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api.claim import router as claim_router
from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.services.claim_service import ClaimService
from app.services.database import Database
from app.services.kafka_producer import KafkaProducer
from app.services.otp import OtpService
from app.services.sms import SmsService

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
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
    sms = SmsService(
        host=settings.smtp_host,
        port=settings.smtp_port,
        sender=settings.smtp_from,
    )
    kafka = KafkaProducer(kafka_raw)
    claim_service = ClaimService(db, otp, sms, kafka, settings)

    app.state.db_pool = pool
    app.state.redis = redis
    app.state.kafka_producer = kafka_raw
    app.state.claim_service = claim_service

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(claim_router)
