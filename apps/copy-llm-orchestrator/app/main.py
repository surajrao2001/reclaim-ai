from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from aiokafka import AIOKafkaProducer
from fastapi import FastAPI
from redis.asyncio import Redis

from app.api.generate import router as generate_router
from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.services.database import Database
from app.services.kafka_consumer import OfferReadyConsumer
from app.services.kafka_producer import KafkaProducer
from app.services.redis_idempotency import RedisIdempotency
from app.workers.copy_pipeline import CopyPipeline

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
    kafka = KafkaProducer(kafka_raw)
    idempotency = RedisIdempotency(redis)
    pipeline = CopyPipeline(db, kafka, idempotency, settings)

    consumer: OfferReadyConsumer | None = None
    if settings.kafka_enabled:
        consumer = OfferReadyConsumer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=settings.kafka_consumer_group,
            client_id=f"{settings.kafka_client_id}-consumer",
            pipeline=pipeline,
        )
        await consumer.start()

    app.state.db_pool = pool
    app.state.db = db
    app.state.redis = redis
    app.state.kafka_producer = kafka_raw
    app.state.pipeline = pipeline
    app.state.consumer = consumer

    yield

    if consumer:
        await consumer.stop()
    await kafka_raw.stop()
    await redis.aclose()
    await pool.close()


app = FastAPI(
    title="ReclaimAI Copy/LLM Orchestrator",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(generate_router)
