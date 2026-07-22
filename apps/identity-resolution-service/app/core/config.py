from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "identity-resolution-service"
    environment: str = "development"
    port: int = 8001
    database_url: str = "postgresql+psycopg://reclaimai:reclaimai_dev@localhost:5432/reclaimai"
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:19092"


settings = Settings()
