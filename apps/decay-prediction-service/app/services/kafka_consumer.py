import asyncio
import json

import structlog
from aiokafka import AIOKafkaConsumer

from app.workers.habit_pipeline import HabitPipeline

logger = structlog.get_logger(__name__)

IDENTITY_UNMASKED_TOPIC = "reclaimai.identity.unmasked.v1"


class IdentityUnmaskedConsumer:
    def __init__(
        self,
        *,
        bootstrap_servers: str,
        group_id: str,
        client_id: str,
        pipeline: HabitPipeline,
    ) -> None:
        self._bootstrap_servers = bootstrap_servers
        self._group_id = group_id
        self._client_id = client_id
        self._pipeline = pipeline
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task | None = None
        self._stopped = asyncio.Event()

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            IDENTITY_UNMASKED_TOPIC,
            bootstrap_servers=self._bootstrap_servers,
            group_id=self._group_id,
            client_id=self._client_id,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
        )
        await self._consumer.start()
        self._stopped.clear()
        self._task = asyncio.create_task(self._run(), name="identity-unmasked-consumer")
        logger.info("kafka_consumer_started", topic=IDENTITY_UNMASKED_TOPIC)

    async def stop(self) -> None:
        self._stopped.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._consumer:
            await self._consumer.stop()
        logger.info("kafka_consumer_stopped")

    async def _run(self) -> None:
        assert self._consumer is not None
        try:
            async for message in self._consumer:
                if self._stopped.is_set():
                    break
                try:
                    envelope = json.loads(message.value.decode("utf-8"))
                    await self._pipeline.handle_identity_unmasked(envelope)
                    await self._consumer.commit()
                except Exception as exc:
                    logger.exception("consumer_handler_failed", error=str(exc))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("consumer_loop_failed", error=str(exc))
