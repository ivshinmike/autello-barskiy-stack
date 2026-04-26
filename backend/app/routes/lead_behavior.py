from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.lead_behavior import LeadBehavior, LeadBehaviorCRUD

router = APIRouter()


class LeadBehaviorIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time_on_page_seconds: float = 0.0
    button_clicks: dict[str, Any] = Field(default_factory=dict)
    cursor_hover_data: Any = None
    page_return_count: int = 0
    raw_metrics: dict[str, Any] | None = None


class LeadBehaviorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    application_id: int
    time_on_page_seconds: float
    button_clicks: dict[str, Any]
    cursor_hover_data: Any
    page_return_count: int
    raw_metrics: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime | None = None


@router.post(
    "/by-application/{application_id}",
    response_model=LeadBehaviorOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать/обновить (upsert) метрики по id заявки (1:1 с warm_leads.id)",
)
async def upsert_behavior(
    application_id: int,
    data: LeadBehaviorIn,
    session: AsyncSession = Depends(get_db),
) -> LeadBehavior:
    ch = data.cursor_hover_data
    if ch is None:
        ch = {}
    row = await LeadBehaviorCRUD.upsert(
        session,
        application_id,
        time_on_page_seconds=data.time_on_page_seconds,
        button_clicks=data.button_clicks,
        cursor_hover_data=ch,
        page_return_count=data.page_return_count,
        raw_metrics=data.raw_metrics,
    )
    return row


@router.get(
    "/by-application/{application_id}",
    response_model=LeadBehaviorOut,
    summary="Получить метрики по id заявки",
)
async def get_behavior(
    application_id: int, session: AsyncSession = Depends(get_db)
) -> LeadBehavior:
    row = await LeadBehaviorCRUD.get_by_application_id(session, application_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.get(
    "",
    response_model=list[LeadBehaviorOut],
    summary="Список метрик (по application_id desc)",
)
async def list_behaviors(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
) -> list[LeadBehavior]:
    return await LeadBehaviorCRUD.list_all(session, offset=offset, limit=limit)


@router.delete(
    "/by-application/{application_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить строку метрик по id заявки",
)
async def delete_behavior(
    application_id: int, session: AsyncSession = Depends(get_db)
) -> None:
    ok = await LeadBehaviorCRUD.delete(session, application_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
