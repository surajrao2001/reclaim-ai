from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg
from fastapi import FastAPI
from redis.asyncio import Redis

from app.api.habits import router as habits_router
from app.api.health import router as health_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.services.database import Database
from app.services.kafka_consumer import IdentityUnmaskedConsumer
from app.services.redis_idempotency import RedisIdempotency
from app.workers.habit_pipeline import HabitPipeline

configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    pool = await asyncpg.create_pool(dsn=settings.asyncpg_dsn, min_size=1, max_size=5)
    redis = Redis.from_url(settings.redis_url, decode_responses=False)

    db = Database(pool)
    idempotency = RedisIdempotency(redis)
    pipeline = HabitPipeline(db, idempotency)

    consumer: IdentityUnmaskedConsumer | None = None
    if settings.kafka_enabled:
        consumer = IdentityUnmaskedConsumer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=settings.kafka_consumer_group,
            client_id=f"{settings.kafka_client_id}-consumer",
            pipeline=pipeline,
        )
        await consumer.start()

    app.state.db_pool = pool
    app.state.db = db
    app.state.redis = redis
    app.state.pipeline = pipeline
    app.state.consumer = consumer

    yield

    if consumer:
        await consumer.stop()
    await redis.aclose()
    await pool.close()


app = FastAPI(
    title="ReclaimAI Decay Prediction Service",
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(habits_router)
