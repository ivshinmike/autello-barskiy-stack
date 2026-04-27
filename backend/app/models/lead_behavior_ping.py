from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeadBehaviorPing(Base):
    """
    Периодические снимки метрик с лендинга (без привязки к заявке).
    Хранит строки как получено — для последующей аналитики / heatmap.
    """

    __tablename__ = "lead_behavior_pings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    application_id: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    time_on_page: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    buttons_clicked: Mapped[str] = mapped_column(Text, default="", server_default="")
    cursor_positions: Mapped[str] = mapped_column(Text, default="", server_default="")
    return_frequency: Mapped[int] = mapped_column(Integer, server_default="0", default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LeadBehaviorPingCRUD:
    @staticmethod
    async def list_slice(
        session, *, skip: int = 0, limit: int = 100
    ) -> list[LeadBehaviorPing]:
        from sqlalchemy import select

        q = (
            select(LeadBehaviorPing)
            .order_by(LeadBehaviorPing.id.desc())
            .offset(skip)
            .limit(limit)
        )
        r = await session.execute(q)
        return list(r.scalars().all())
