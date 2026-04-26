from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeadBehavior(Base):
    """
    Поведенческие/технические метрики по заявке; связь 1:1 с ``warm_leads`` по тому же id.

    .. rubric:: SQL (PostgreSQL)

    .. code-block:: sql

        CREATE TABLE lead_behaviors (
            application_id BIGINT PRIMARY KEY
                REFERENCES warm_leads (id) ON DELETE CASCADE,
            time_on_page_seconds REAL NOT NULL DEFAULT 0,
            button_clicks JSONB NOT NULL DEFAULT '{}',
            cursor_hover_data JSONB NOT NULL DEFAULT '{}',
            page_return_count INTEGER NOT NULL DEFAULT 0,
            raw_metrics JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        );
    """

    __tablename__ = "lead_behaviors"

    application_id: Mapped[int] = mapped_column(
        ForeignKey("warm_leads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    time_on_page_seconds: Mapped[float] = mapped_column(
        Float, server_default="0", default=0.0
    )
    # какие кнопки нажимал: например { "button_id": count, ... }
    button_clicks: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=lambda: {}
    )
    # зоны/события курсора
    cursor_hover_data: Mapped[dict[str, Any] | list[Any]] = mapped_column(
        JSONB, default=lambda: {}
    )
    page_return_count: Mapped[int] = mapped_column(
        Integer, server_default="0", default=0
    )
    # полный пакет сырых метрик с фронта (сессии, тайминги и т.д.)
    raw_metrics: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class LeadBehaviorCRUD:
    @staticmethod
    async def create(session, application_id: int, **fields) -> LeadBehavior:
        row = LeadBehavior(application_id=application_id, **fields)
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def get_by_application_id(
        session, application_id: int
    ) -> LeadBehavior | None:
        return await session.get(LeadBehavior, application_id)

    @staticmethod
    async def upsert(
        session,
        application_id: int,
        *,
        time_on_page_seconds: float | None = None,
        button_clicks: dict[str, Any] | None = None,
        cursor_hover_data: dict[str, Any] | list | None = None,
        page_return_count: int | None = None,
        raw_metrics: dict[str, Any] | None = None,
    ) -> LeadBehavior:
        row = await LeadBehaviorCRUD.get_by_application_id(session, application_id)
        if row is None:
            return await LeadBehaviorCRUD.create(
                session,
                application_id=application_id,
                time_on_page_seconds=time_on_page_seconds or 0.0,
                button_clicks=button_clicks or {},
                cursor_hover_data=cursor_hover_data or {},
                page_return_count=page_return_count or 0,
                raw_metrics=raw_metrics,
            )
        if time_on_page_seconds is not None:
            row.time_on_page_seconds = time_on_page_seconds
        if button_clicks is not None:
            row.button_clicks = button_clicks
        if cursor_hover_data is not None:
            row.cursor_hover_data = cursor_hover_data
        if page_return_count is not None:
            row.page_return_count = page_return_count
        if raw_metrics is not None:
            row.raw_metrics = raw_metrics
        await session.flush()
        return row

    @staticmethod
    async def update(session, application_id: int, **fields) -> LeadBehavior | None:
        row = await LeadBehaviorCRUD.get_by_application_id(session, application_id)
        if not row:
            return None
        for k, v in fields.items():
            if v is not None and hasattr(row, k):
                setattr(row, k, v)
        await session.flush()
        return row

    @staticmethod
    async def delete(session, application_id: int) -> bool:
        from sqlalchemy import delete

        res = await session.execute(
            delete(LeadBehavior).where(LeadBehavior.application_id == application_id)
        )
        return (res.rowcount or 0) > 0

    @staticmethod
    async def list_all(
        session, offset: int = 0, limit: int = 100
    ) -> list[LeadBehavior]:
        from sqlalchemy import select

        q = (
            select(LeadBehavior)
            .order_by(LeadBehavior.application_id.desc())
            .offset(offset)
            .limit(limit)
        )
        r = await session.execute(q)
        return list(r.scalars().all())
