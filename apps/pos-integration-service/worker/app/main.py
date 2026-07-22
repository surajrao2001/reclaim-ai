"""Sidecar entrypoint — Kafka consumer for post-ingest transforms."""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


def main() -> None:
    logger.info("pos_integration_worker_started", status="idle")


if __name__ == "__main__":
    main()
