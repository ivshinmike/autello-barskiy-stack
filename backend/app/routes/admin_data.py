from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.admin_data import AdminData, AdminDataCRUD
from app.models.admin_user import AdminUser

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


class ServiceItemIn(BaseModel):
    """Элемент массива services в admin_data (доп. поля разрешены)."""

    model_config = ConfigDict(extra="allow")
    id: str | None = None
    title: str | None = None
    description: str | None = None

    @field_validator("id", "title", "description", mode="before")
    @classmethod
    def _scalar_to_str(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, (dict, list)):
            raise ValueError("поле должно быть строкой или скаляром")
        return str(v) if not isinstance(v, str) else v


def _services_as_dicts(items: list[ServiceItemIn]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, s in enumerate(items):
        d = s.model_dump(mode="python", exclude_none=False)
        tid = d.get("id")
        if tid is None or (isinstance(tid, str) and not tid.strip()):
            d["id"] = f"svc_{i + 1}"
        else:
            d["id"] = str(tid).strip()
        d["title"] = "" if d.get("title") is None else str(d["title"])
        d["description"] = "" if d.get("description") is None else str(d["description"])
        out.append(d)
    return out


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
    services: list[ServiceItemIn] = Field(
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

    @field_validator("services", mode="before")
    @classmethod
    def _services_out(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, list):
            return [
                ServiceItemIn.model_validate(x) if not isinstance(x, ServiceItemIn) else x
                for x in v
            ]
        return v


class AdminDataPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    services: list[ServiceItemIn] | None = None
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
    _admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
    row_id: int | None = Query(
        None,
        ge=1,
        description="Если указан — обновить строку с этим id (та же таблица). Без параметра — вставка новой строки.",
    ),
) -> AdminDataOut:
    payload = data.model_dump()
    payload["services"] = _services_as_dicts(data.services)
    if row_id is not None:
        row = await AdminDataCRUD.update(session, row_id, **payload)
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Строка id={row_id} не найдена. Сначала GET /api/admin-data или создайте без row_id.",
            )
        response.status_code = status.HTTP_200_OK
    else:
        row = await AdminDataCRUD.create(session, **payload)
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
    row_id: int,
    data: AdminDataPatch,
    _admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminDataOut:
    dumped = data.model_dump(exclude_unset=True)
    update: dict[str, Any] = {}
    for k, v in dumped.items():
        if v is None:
            continue
        if k == "services" and data.services is not None:
            update[k] = _services_as_dicts(data.services)
        else:
            update[k] = v
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
async def delete_admin_data(
    row_id: int,
    _admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    ok = await AdminDataCRUD.delete(session, row_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
