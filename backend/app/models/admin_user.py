from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminUser(Base):
    """
    Учётная запись администратора (логин + хеш пароля).

    .. rubric:: SQL (PostgreSQL)

    .. code-block:: sql

        CREATE TABLE admin_user (
            id BIGSERIAL PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        );
    """

    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class AdminUserCRUD:
    @staticmethod
    async def count_all(session) -> int:
        from sqlalchemy import func as sa_func
        from sqlalchemy import select

        q = select(sa_func.count()).select_from(AdminUser)
        r = await session.execute(q)
        return int(r.scalar_one() or 0)

    @staticmethod
    async def create(session, *, username: str, password_hash: str) -> AdminUser:
        row = AdminUser(username=username, password_hash=password_hash)
        session.add(row)
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def get_by_id(session, row_id: int) -> AdminUser | None:
        return await session.get(AdminUser, row_id)

    @staticmethod
    async def get_by_username(session, username: str) -> AdminUser | None:
        from sqlalchemy import select

        q = select(AdminUser).where(AdminUser.username == username).limit(1)
        r = await session.execute(q)
        return r.scalar_one_or_none()

    @staticmethod
    async def list_all(
        session, offset: int = 0, limit: int = 200
    ) -> list[AdminUser]:
        from sqlalchemy import select

        q = (
            select(AdminUser)
            .order_by(AdminUser.id.asc())
            .offset(offset)
            .limit(limit)
        )
        r = await session.execute(q)
        return list(r.scalars().all())

    @staticmethod
    async def update(
        session,
        row_id: int,
        *,
        username: str | None = None,
        password_hash: str | None = None,
    ) -> AdminUser | None:
        row = await AdminUserCRUD.get_by_id(session, row_id)
        if not row:
            return None
        if username is not None:
            row.username = username
        if password_hash is not None:
            row.password_hash = password_hash
        await session.flush()
        await session.refresh(row)
        return row

    @staticmethod
    async def delete(session, row_id: int) -> bool:
        from sqlalchemy import delete

        res = await session.execute(delete(AdminUser).where(AdminUser.id == row_id))
        return (res.rowcount or 0) > 0
