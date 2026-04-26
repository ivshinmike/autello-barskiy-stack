from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения; в Docker: переменная ``DATABASE_URL`` из compose."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+asyncpg://autello:change_me@localhost:5432/autello",
        validation_alias=AliasChoices("DATABASE_URL", "database_url"),
    )
    # Для Uvicorn при локальном запуске; в Docker CMD задаёт порт/хост
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    # OpenAPI / Swagger: выключайте false в бою, если не нужен /docs
    enable_openapi: bool = Field(
        default=True,
        validation_alias=AliasChoices("ENABLE_OPENAPI", "ENABLE_DOCS", "enable_openapi"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
