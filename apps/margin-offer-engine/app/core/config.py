from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[4]
_SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _discover_env_files() -> tuple[str, ...]:
    candidates = (Path(".env"), _SERVICE_ROOT / ".env", _REPO_ROOT / ".env")
    found = tuple(str(path) for path in candidates if path.is_file())
    return found or (str(_REPO_ROOT / ".env.example"),)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_discover_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "margin-offer-engine"
    environment: str = "development"
    demo_hardened: bool = False
    port: int = 8002
    database_url: str = "postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai"
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:19092"
    kafka_client_id: str = "margin-offer-engine"
    kafka_consumer_group: str = "margin-offer-engine"
    kafka_enabled: bool = True
    offer_schedule_delay_hours: int = 24
    claim_web_base_url: str = "http://localhost:3101"

    @property
    def asyncpg_dsn(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")

    @property
    def expose_openapi_docs(self) -> bool:
        if self.demo_hardened:
            return False
        return self.environment.lower() != "production"


settings = Settings()
