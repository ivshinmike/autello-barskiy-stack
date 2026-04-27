from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.security import hash_password
from app.models.admin_user import AdminUser, AdminUserCRUD

router = APIRouter(dependencies=[Depends(get_current_admin)])


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    created_at: datetime
    updated_at: datetime | None = None


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username", "password", mode="before")
    @classmethod
    def _strip_create(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class AdminUserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str | None = Field(default=None, min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=8, max_length=200)

    @field_validator("username", "password", mode="before")
    @classmethod
    def _strip_patch(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip()
        return v


@router.post(
    "",
    response_model=AdminUserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать администратора (только для уже вошедшего админа)",
)
async def create_admin_user(
    data: AdminUserCreate, session: AsyncSession = Depends(get_db)
) -> AdminUser:
    if await AdminUserCRUD.get_by_username(session, data.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Такой логин уже занят",
        )
    row = await AdminUserCRUD.create(
        session,
        username=data.username,
        password_hash=hash_password(data.password),
    )
    await session.commit()
    return row


@router.get(
    "",
    response_model=list[AdminUserOut],
    summary="Список администраторов",
)
async def list_admin_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    session: AsyncSession = Depends(get_db),
) -> list[AdminUser]:
    return await AdminUserCRUD.list_all(session, offset=offset, limit=limit)


@router.get(
    "/{row_id}",
    response_model=AdminUserOut,
    summary="Получить администратора по id",
)
async def get_admin_user(row_id: int, session: AsyncSession = Depends(get_db)) -> AdminUser:
    row = await AdminUserCRUD.get_by_id(session, row_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.patch(
    "/{row_id}",
    response_model=AdminUserOut,
    summary="Обновить логин и/или пароль",
)
async def patch_admin_user(
    row_id: int, data: AdminUserPatch, session: AsyncSession = Depends(get_db)
) -> AdminUserOut:
    username = data.username
    if username is not None:
        existing = await AdminUserCRUD.get_by_username(session, username)
        if existing is not None and existing.id != row_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Такой логин уже занят",
            )
    pwd = data.password
    password_hash = hash_password(pwd) if pwd else None
    row = await AdminUserCRUD.update(
        session,
        row_id,
        username=username,
        password_hash=password_hash,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
    return AdminUserOut.model_validate(row)


@router.delete(
    "/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить администратора",
)
async def delete_admin_user(row_id: int, session: AsyncSession = Depends(get_db)) -> None:
    ok = await AdminUserCRUD.delete(session, row_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
