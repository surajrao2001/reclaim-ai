from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "analytics-service"
    environment: str = "development"
    demo_hardened: bool = False
    port: int = 8005
    database_url: str = "postgresql+psycopg://reclaimai:reclaimai_dev@localhost:5432/reclaimai"
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:19092"

    @property
    def expose_openapi_docs(self) -> bool:
        if self.demo_hardened:
            return False
        return self.environment.lower() != "production"


settings = Settings()
