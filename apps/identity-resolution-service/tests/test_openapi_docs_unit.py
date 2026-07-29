from app.core.config import Settings


def test_expose_openapi_docs_off_in_production() -> None:
    settings = Settings(environment="production", demo_hardened=False, _env_file=None)
    assert settings.expose_openapi_docs is False


def test_expose_openapi_docs_off_when_demo_hardened() -> None:
    settings = Settings(environment="development", demo_hardened=True, _env_file=None)
    assert settings.expose_openapi_docs is False


def test_expose_openapi_docs_on_in_development() -> None:
    settings = Settings(environment="development", demo_hardened=False, _env_file=None)
    assert settings.expose_openapi_docs is True
