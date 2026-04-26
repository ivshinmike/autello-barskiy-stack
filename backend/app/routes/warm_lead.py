from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.lead_behavior import LeadBehaviorCRUD
from app.models.warm_lead import WarmLead, WarmLeadCRUD

router = APIRouter()


class LeadBehaviorPayload(BaseModel):
    """Снимок лид-метрик; может уйти вместе с заявкой в одном теле (опционально)."""

    model_config = ConfigDict(extra="forbid")
    time_on_page_seconds: float = 0.0
    button_clicks: dict[str, Any] = Field(default_factory=dict)
    cursor_hover_data: Any = None
    page_return_count: int = 0
    raw_metrics: dict[str, Any] | None = None


class WarmLeadBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str
    last_name: str
    middle_name: str | None = None
    business_info: str | None = None
    business_niche: str | None = None
    company_size: str | None = None
    task_volume: str | None = None
    role_type: str | None = None
    business_size: str | None = None
    need_volume: str | None = None
    result_deadline: str | None = None
    task_type: str | None = None
    product_interest: str | None = None
    budget: str | None = None
    contact_method: str | None = None
    preferred_time: str | None = None
    comments: str | None = None


class WarmLeadCreate(WarmLeadBase):
    behavior: LeadBehaviorPayload | None = None


class WarmLeadOut(WarmLeadBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime | None = None


class WarmLeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    business_info: str | None = None
    business_niche: str | None = None
    company_size: str | None = None
    task_volume: str | None = None
    role_type: str | None = None
    business_size: str | None = None
    need_volume: str | None = None
    result_deadline: str | None = None
    task_type: str | None = None
    product_interest: str | None = None
    budget: str | None = None
    contact_method: str | None = None
    preferred_time: str | None = None
    comments: str | None = None


@router.post(
    "",
    response_model=WarmLeadOut,
    status_code=status.HTTP_201_CREATED,
    summary="Создать заявку; опционально — одним запросом записать лид-метрики (behavior)",
)
async def create_warm_lead(
    data: WarmLeadCreate,
    session: AsyncSession = Depends(get_db),
) -> WarmLeadOut:
    b = data.behavior
    lead_fields = data.model_dump(exclude={"behavior"})
    lead = await WarmLeadCRUD.create(session, **lead_fields)
    if b is not None:
        await LeadBehaviorCRUD.upsert(
            session,
            lead.id,
            time_on_page_seconds=b.time_on_page_seconds,
            button_clicks=b.button_clicks,
            cursor_hover_data=b.cursor_hover_data if b.cursor_hover_data is not None else {},
            page_return_count=b.page_return_count,
            raw_metrics=b.raw_metrics,
        )
    await session.commit()
    return WarmLeadOut.model_validate(lead)


@router.get(
    "/{lead_id}",
    response_model=WarmLeadOut,
    summary="Получить заявку по id",
)
async def get_warm_lead(lead_id: int, session: AsyncSession = Depends(get_db)) -> WarmLead:
    row = await WarmLeadCRUD.get_by_id(session, lead_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.get(
    "",
    response_model=list[WarmLeadOut],
    summary="Список заявок",
)
async def list_warm_leads(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db),
) -> list[WarmLead]:
    return await WarmLeadCRUD.list_all(session, offset=offset, limit=limit)


@router.patch(
    "/{lead_id}",
    response_model=WarmLeadOut,
    summary="Частично обновить заявку",
)
async def patch_warm_lead(
    lead_id: int,
    data: WarmLeadUpdate,
    session: AsyncSession = Depends(get_db),
) -> WarmLeadOut:
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    row = await WarmLeadCRUD.update(session, lead_id, **update)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
    return WarmLeadOut.model_validate(row)


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить заявку (и связанные lead_behaviors — каскадом в БД)",
)
async def delete_warm_lead(lead_id: int, session: AsyncSession = Depends(get_db)) -> None:
    ok = await WarmLeadCRUD.delete(session, lead_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.commit()
