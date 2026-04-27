from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.core.security import (
    create_access_token,
    hash_password,
    normalize_credential,
    verify_password,
)
from app.models.admin_user import AdminUser, AdminUserCRUD

router = APIRouter()


class RegistrationOpenOut(BaseModel):
    open: bool = Field(description="True, если в БД ещё нет ни одного администратора")


class RegisterIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username", "password", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("username", "password", mode="before")
    @classmethod
    def _strip_login(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminMeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str


@router.get(
    "/registration-open",
    response_model=RegistrationOpenOut,
    summary="Доступна ли первичная регистрация",
)
async def registration_open(session: AsyncSession = Depends(get_db)) -> RegistrationOpenOut:
    n = await AdminUserCRUD.count_all(session)
    return RegistrationOpenOut(open=n == 0)


@router.post(
    "/register",
    response_model=TokenOut,
    summary="Первичная регистрация первого администратора",
)
async def register(data: RegisterIn, session: AsyncSession = Depends(get_db)) -> TokenOut:
    if await AdminUserCRUD.count_all(session) > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Регистрация закрыта: в системе уже есть администратор",
        )
    if await AdminUserCRUD.get_by_username(session, normalize_credential(data.username)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Такой логин уже занят",
        )
    user = await AdminUserCRUD.create(
        session,
        username=normalize_credential(data.username),
        password_hash=hash_password(data.password),
    )
    await session.commit()
    token = create_access_token(subject=str(user.id), username=user.username)
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut, summary="Вход")
async def login(data: LoginIn, session: AsyncSession = Depends(get_db)) -> TokenOut:
    user = await AdminUserCRUD.get_by_username(
        session, normalize_credential(data.username)
    )
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    token = create_access_token(subject=str(user.id), username=user.username)
    return TokenOut(access_token=token)


@router.get("/me", response_model=AdminMeOut, summary="Текущий пользователь по JWT")
async def me(admin: AdminUser = Depends(get_current_admin)) -> AdminUser:
    return admin
