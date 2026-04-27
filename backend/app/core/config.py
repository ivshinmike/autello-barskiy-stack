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
    jwt_secret: str = Field(
        default="change_me_jwt_dev_only",
        validation_alias=AliasChoices("JWT_SECRET", "jwt_secret"),
    )
    jwt_algorithm: str = Field(
        default="HS256",
        validation_alias=AliasChoices("JWT_ALGORITHM", "jwt_algorithm"),
    )
    jwt_expire_minutes: int = Field(
        default=60 * 24,
        ge=5,
        le=60 * 24 * 30,
        validation_alias=AliasChoices("JWT_EXPIRE_MINUTES", "jwt_expire_minutes"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
