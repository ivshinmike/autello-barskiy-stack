from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.models.base import Base

_settings = get_settings()

engine: AsyncEngine = create_async_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,
)
async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Создаёт таблицы по MetaData (для среды без миграций; в prod предпочтительны миграции)."""
    import app.models  # noqa: F401  — регистрация ORM-таблиц в Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_db() -> bool:
    """Проверка, что пул к PostgreSQL жизнеспособен."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 — healthcheck
        return False


async def get_db() -> AsyncIterator[AsyncSession]:
    """
    FastAPI-зависимость. Коммит выполняет вызывающий код (CRUD) или роут; здесь — открытая сессия.
    После обработчика — rollback при незакоммиченных транзакциях и close.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
