from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WarmLead(Base):
    """
    Тёплый лид: заявка с контактами, бизнес-полями и предпочтениями.

    .. rubric:: SQL (PostgreSQL)

    .. code-block:: sql

        CREATE TABLE warm_leads (
            id BIGSERIAL PRIMARY KEY,
            first_name VARCHAR(500) NOT NULL,
            last_name VARCHAR(500) NOT NULL,
            middle_name VARCHAR(500),
            business_info TEXT,
            business_niche TEXT,
            company_size TEXT,
            task_volume TEXT,
            role_type TEXT,
            business_size TEXT,
            need_volume TEXT,
            result_deadline TEXT,
            task_type TEXT,
            product_interest TEXT,
            budget TEXT,
            contact_method TEXT,
            preferred_time TEXT,
            comments TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        );
    """

    __tablename__ = "warm_leads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    first_name: Mapped[str] = mapped_column(String(500))
    last_name: Mapped[str] = mapped_column(String(500))
    middle_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    business_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_niche: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_size: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_volume: Mapped[str | None] = mapped_column(Text, nullable=True)
    role_type: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # сотрудник / руководитель
    business_size: Mapped[str | None] = mapped_column(Text, nullable=True)
    need_volume: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_deadline: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # срок, к когда нужен результат
    task_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_interest: Mapped[str | None] = mapped_column(Text, nullable=True)
    budget: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # значение в виде строки; на фронте — ползунок
    contact_method: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # удобный/предпочтительный способ связи
    preferred_time: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # удобное время
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class WarmLeadCRUD:
    @staticmethod
    async def create(session, **fields) -> WarmLead:
        row = WarmLead(**fields)
        session.add(row)
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def get_by_id(session, lead_id: int) -> WarmLead | None:
        return await session.get(WarmLead, lead_id)

    @staticmethod
    async def list_all(
        session, offset: int = 0, limit: int = 100
    ) -> list[WarmLead]:
        from sqlalchemy import select

        q = select(WarmLead).order_by(WarmLead.id.desc()).offset(offset).limit(limit)
        r = await session.execute(q)
        return list(r.scalars().all())

    @staticmethod
    async def list_all_unbounded(session) -> list[WarmLead]:
        """Все заявки (для админ-скоринга и агрегированной статистики)."""
        from sqlalchemy import select

        q = select(WarmLead)
        r = await session.execute(q)
        return list(r.scalars().all())

    @staticmethod
    async def update(session, lead_id: int, **fields) -> WarmLead | None:
        row = await WarmLeadCRUD.get_by_id(session, lead_id)
        if not row:
            return None
        for k, v in fields.items():
            if v is not None and hasattr(row, k):
                setattr(row, k, v)
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def delete(session, lead_id: int) -> bool:
        from sqlalchemy import delete

        res = await session.execute(delete(WarmLead).where(WarmLead.id == lead_id))
        return (res.rowcount or 0) > 0
