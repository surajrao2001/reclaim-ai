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

    service_name: str = "identity-resolution-service"
    environment: str = "development"
    port: int = 8001
    database_url: str = "postgresql://reclaimai:reclaimai_dev@localhost:5433/reclaimai"
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:19092"
    kafka_client_id: str = "identity-resolution-service"

    claim_jwt_secret: str = "dev_claim_jwt_secret_change_me"
    claim_jwt_ttl_seconds: int = 300
    phone_hash_secret: str = "dev_phone_hash_secret_change_me"

    otp_ttl_seconds: int = 300
    otp_rate_limit_max: int = 3
    otp_rate_limit_window_seconds: int = 600

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "otp@reclaimai.local"

    # OTP delivery: smtp (local Mailhog) | email|resend (Resend) | console (tests) | whatsapp (Meta)
    otp_provider: str = "smtp"
    resend_api_key: str = ""
    otp_from_email: str = "ReclaimAI <otp@reclaimai.local>"

    # Meta Cloud API — optional OTP_PROVIDER=whatsapp (identity calls Graph API directly)
    meta_wa_token: str = ""
    meta_wa_phone_number_id: str = ""
    meta_wa_api_version: str = "v21.0"
    meta_wa_otp_template_name: str = ""
    meta_wa_otp_template_lang: str = "en"

    default_cashback_amount_inr: int = 100
    cors_origins: str = "http://localhost:3101"

    razorpayx_key_id: str = ""
    razorpayx_key_secret: str = ""
    razorpayx_account_number: str = ""
    razorpayx_webhook_secret: str = "dev_razorpayx_webhook_secret"
    razorpayx_base_url: str = "https://api.razorpay.com/v1"
    razorpayx_mock: str | None = None

    @property
    def asyncpg_dsn(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def razorpayx_mock_enabled(self) -> bool:
        if self.razorpayx_mock is not None and self.razorpayx_mock != "":
            return self.razorpayx_mock.lower() == "true"
        return len(self.razorpayx_key_id) == 0


settings = Settings()
