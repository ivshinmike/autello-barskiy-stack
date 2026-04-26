from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.admin_data import AdminData, AdminDataCRUD

router = APIRouter()


def _coerce_services(v: Any) -> Any:
    """Swagger/JSON: часто вместо [] передают {} — нормализуем; один объект — в список."""
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        return [] if not v else [v]
    return v


def _coerce_extra_ui(v: Any) -> Any:
    """[] в JSON часто путают с null/{}; пустой список → None."""
    if v is None:
        return None
    if isinstance(v, list) and len(v) == 0:
        return None
    return v


class AdminDataIn(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "services": [{"id": "audit", "title": "Аудит"}],
                    "budget_range_min": "0",
                    "budget_range_max": "500000",
                    "extra_ui": None,
                }
            ],
        },
    )
    services: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Список услуг (массив объектов), не один объект { }",
    )
    budget_range_min: str | None = None
    budget_range_max: str | None = None
    extra_ui: dict[str, Any] | None = Field(
        default=None, description="Объект или null; пустой массив [] не используйте"
    )

    @field_validator("services", mode="before")
    @classmethod
    def _services(cls, v: Any) -> Any:
        return _coerce_services(v)

    @field_validator("extra_ui", mode="before")
    @classmethod
    def _extra_ui(cls, v: Any) -> Any:
        return _coerce_extra_ui(v)


class AdminDataOut(AdminDataIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime | None = None


class AdminDataPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    services: list[dict[str, Any]] | None = None
    budget_range_min: str | None = None
    budget_range_max: str | None = None
    extra_ui: dict[str, Any] | None = None

    @field_validator("services", mode="before")
    @classmethod
    def _services_patch(cls, v: Any) -> Any:
        if v is None:
            return None
        return _coerce_services(v)

    @field_validator("extra_ui", mode="before")
    @classmethod
    def _extra_ui_patch(cls, v: Any) -> Any:
        return _coerce_extra_ui(v)


@router.post(
    "",
    response_model=AdminDataOut,
    summary="Создать или обновить запись админ-данных",
    description=(
        "**По умолчанию** каждый вызов **создаёт новую строку** в `admin_data` с новым `id` — "
        "старая строка в БД **не меняется**.\n\n"
        "Чтобы **изменить уже существующую** строку из Swagger: "
        "добавьте query-параметр **`row_id`** (id из `GET /api/admin-data`) **или** "
        "используйте **`PATCH /api/admin-data/{row_id}`**."
    ),
)
async def create_admin_data(
    data: AdminDataIn,
    response: Response,
    session: AsyncSession = Depends(get_db),
    row_id: int | None = Query(
        None,
        ge=1,
        description="Если указан — обновить строку с этим id (та же таблица). Без параметра — вставка новой строки.",
    ),
) -> AdminDataOut:
    if row_id is not None:
        row = await AdminDataCRUD.update(session, row_id, **data.model_dump())
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Строка id={row_id} не найдена. Сначала GET /api/admin-data или создайте без row_id.",
            )
        response.status_code = status.HTTP_200_OK
    else:
        row = await AdminDataCRUD.create(session, **data.model_dump())
        response.status_code = status.HTTP_201_CREATED
    # commit до валидации response_model, иначе при ошибке сериализации get_db сделает rollback
    await session.commit()
    return AdminDataOut.model_validate(row)


@router.get(
    "/{row_id}",
    response_model=AdminDataOut,
    summary="Получить по id",
)
async def get_admin_data(row_id: int, session: AsyncSession = Depends(get_db)) -> AdminData:
    row = await AdminDataCRUD.get_by_id(session, row_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.get(
    "",
    response_model=list[AdminDataOut],
    summary="Список всех записей (посмотрите id для PATCH или POST ?row_id=)",
)
async def list_admin_data(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    session: AsyncSession = Depends(get_db),
) -> list[AdminData]:
    return await AdminDataCRUD.list_all(session, offset=offset, limit=limit)


@router.patch(
    "/{row_id}",
    response_model=AdminDataOut,
    summary="Частично обновить",
)
async def patch_admin_data(
    row_id: int, data: AdminDataPatch, session: AsyncSession = Depends(get_db)
) -> AdminDataOut:
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    row = await AdminDataCRUD.update(session, row_id, **update)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
    return AdminDataOut.model_validate(row)


@router.delete(
    "/{row_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить",
)
async def delete_admin_data(row_id: int, session: AsyncSession = Depends(get_db)) -> None:
    ok = await AdminDataCRUD.delete(session, row_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
