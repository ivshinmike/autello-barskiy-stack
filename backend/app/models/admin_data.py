from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminData(Base):
    """
    Справочник для админки: перечень услуг, диапазон бюджета для слайдера, прочие настройки UI.

    .. rubric:: SQL (PostgreSQL)

    .. code-block:: sql

        CREATE TABLE admin_data (
            id BIGSERIAL PRIMARY KEY,
            services JSONB NOT NULL DEFAULT '[]',
            budget_range_min VARCHAR(200),
            budget_range_max VARCHAR(200),
            extra_ui JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        );
    """

    __tablename__ = "admin_data"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Список услуг, например: [ {"id": "...", "title": "...", "description": "..."} ]
    services: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=lambda: []
    )
    budget_range_min: Mapped[str | None] = mapped_column(String(200), nullable=True)
    budget_range_max: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Доп. поля для селектов/подсказок на фронте
    extra_ui: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class AdminDataCRUD:
    @staticmethod
    async def create(session, **fields) -> AdminData:
        row = AdminData(**fields)
        session.add(row)
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def get_by_id(session, row_id: int) -> AdminData | None:
        return await session.get(AdminData, row_id)

    @staticmethod
    async def list_all(
        session, offset: int = 0, limit: int = 200
    ) -> list[AdminData]:
        from sqlalchemy import select

        q = select(AdminData).order_by(AdminData.id.asc()).offset(offset).limit(limit)
        r = await session.execute(q)
        return list(r.scalars().all())

    @staticmethod
    async def update(session, row_id: int, **fields) -> AdminData | None:
        row = await AdminDataCRUD.get_by_id(session, row_id)
        if not row:
            return None
        for k, v in fields.items():
            if v is not None and hasattr(row, k):
                setattr(row, k, v)
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def delete(session, row_id: int) -> bool:
        from sqlalchemy import delete

        res = await session.execute(delete(AdminData).where(AdminData.id == row_id))
        return (res.rowcount or 0) > 0