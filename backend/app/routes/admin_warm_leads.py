from __future__ import annotations

from enum import Enum
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.warm_lead import WarmLead, WarmLeadCRUD
from app.routes.warm_lead import WarmLeadOut
from app.services.lead_scoring import Department, compute_lead_score, parse_budget_rub

router = APIRouter(dependencies=[Depends(get_current_admin)])


class LeadSortMode(str, Enum):
    priority = "priority"
    created_desc = "created_desc"


class ScoreDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    budget: int
    company: int
    role: int
    deadline: int
    niche: int
    need: int


class WarmLeadScoredOut(WarmLeadOut):
    """Поля заявки + скоринг и подсказки по работе с лидом."""

    priority_score: int = Field(ge=0, le=100)
    temperature: Literal["hot", "warm", "cold"]
    temperature_label: str
    department: Literal["vip", "general"]
    department_label: str
    attention_label: str
    personal_manager_recommended: bool
    score_details: ScoreDetails
    budget_parsed_rub: float = Field(
        description="Распознанная сумма бюджета (макс. число из поля), для аналитики"
    )


class WarmLeadsStatsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    total: int
    hot: int
    warm: int
    cold: int


class AdminWarmLeadsListOut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stats: WarmLeadsStatsOut
    items: list[WarmLeadScoredOut]


def _enrich(lead: WarmLead) -> WarmLeadScoredOut:
    total, br, temp, dept = compute_lead_score(lead)
    budget_val = parse_budget_rub(lead.budget)
    temp_labels = {"hot": "Горячий", "warm": "Тёплый", "cold": "Холодный"}
    dept_labels: dict[Department, str] = {
        "vip": "VIP",
        "general": "Общий",
    }
    role_pts = br.role
    personal = (
        dept == "vip" or total >= 60 or (total >= 52 and role_pts >= 11)
    )
    if total >= 40:
        attention = "Стоит внимания"
    else:
        attention = "Низкий приоритет"
    return WarmLeadScoredOut(
        first_name=lead.first_name,
        last_name=lead.last_name,
        middle_name=lead.middle_name,
        business_info=lead.business_info,
        business_niche=lead.business_niche,
        company_size=lead.company_size,
        task_volume=lead.task_volume,
        role_type=lead.role_type,
        business_size=lead.business_size,
        need_volume=lead.need_volume,
        result_deadline=lead.result_deadline,
        task_type=lead.task_type,
        product_interest=lead.product_interest,
        budget=lead.budget,
        contact_method=lead.contact_method,
        preferred_time=lead.preferred_time,
        comments=lead.comments,
        id=lead.id,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
        priority_score=total,
        temperature=temp,  # type: ignore[arg-type]
        temperature_label=temp_labels[temp],
        department=dept,  # type: ignore[arg-type]
        department_label=dept_labels[dept],
        attention_label=attention,
        personal_manager_recommended=personal,
        score_details=ScoreDetails(
            budget=br.budget,
            company=br.company,
            role=br.role,
            deadline=br.deadline,
            niche=br.niche,
            need=br.need,
        ),
        budget_parsed_rub=budget_val,
    )


@router.get(
    "",
    response_model=AdminWarmLeadsListOut,
    summary="Список заявок с интеллектуальным скорингом (JWT админа)",
)
async def list_warm_leads_scored(
    session: AsyncSession = Depends(get_db),
    sort: LeadSortMode = Query(
        LeadSortMode.priority,
        description="priority — по оценке (срочные сверху); created_desc — по дате создания",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
) -> AdminWarmLeadsListOut:
    all_rows = await WarmLeadCRUD.list_all_unbounded(session)
    enriched: list[tuple[WarmLead, WarmLeadScoredOut]] = [
        (r, _enrich(r)) for r in all_rows
    ]
    if sort == LeadSortMode.priority:
        enriched.sort(
            key=lambda t: (
                -t[1].priority_score,
                -(t[0].created_at.timestamp() if t[0].created_at else 0),
                -t[0].id,
            )
        )
    else:
        enriched.sort(
            key=lambda t: (
                -(t[0].created_at.timestamp() if t[0].created_at else 0),
                -t[0].id,
            )
        )
    hot = sum(1 for _, e in enriched if e.temperature == "hot")
    warm = sum(1 for _, e in enriched if e.temperature == "warm")
    cold = sum(1 for _, e in enriched if e.temperature == "cold")
    total_n = len(enriched)
    page = [e for _, e in enriched[skip : skip + limit]]
    return AdminWarmLeadsListOut(
        stats=WarmLeadsStatsOut(
            total=total_n,
            hot=hot,
            warm=warm,
            cold=cold,
        ),
        items=page,
    )


@router.get(
    "/{lead_id}",
    response_model=WarmLeadScoredOut,
    summary="Одна заявка с скорингом",
)
async def get_warm_lead_scored(
    lead_id: int,
    session: AsyncSession = Depends(get_db),
) -> WarmLeadScoredOut:
    row = await WarmLeadCRUD.get_by_id(session, lead_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return _enrich(row)
