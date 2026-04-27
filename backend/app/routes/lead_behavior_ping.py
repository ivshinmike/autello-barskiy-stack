from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.admin_user import AdminUser
from app.models.lead_behavior_ping import LeadBehaviorPing, LeadBehaviorPingCRUD

router = APIRouter()
_log = logging.getLogger(__name__)


def _loose_int(v: Any, default: int = 0) -> int:
    if v is None:
        return default
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    try:
        return int(str(v).strip())
    except (ValueError, TypeError):
        return default


class LeadBehaviorPingIn(BaseModel):
    """Вход без строгой валидации — удобно для телеметрии с лендинга."""

    model_config = ConfigDict(extra="ignore")
    application_id: Any = 0
    time_on_page: Any = 0
    buttons_clicked: Any = ""
    cursor_positions: Any = ""
    return_frequency: Any = 0

    def normalized(self) -> dict[str, Any]:
        return {
            "application_id": _loose_int(self.application_id, 0),
            "time_on_page": _loose_int(self.time_on_page, 0),
            "buttons_clicked": ""
            if self.buttons_clicked is None
            else str(self.buttons_clicked),
            "cursor_positions": ""
            if self.cursor_positions is None
            else str(self.cursor_positions),
            "return_frequency": _loose_int(self.return_frequency, 0),
        }


class LeadBehaviorPingOut(BaseModel):
    ok: bool = True
    id: int


class LeadBehaviorPingRow(BaseModel):
    """Строка телеметрии (как в БД) для админки и аналитики."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    application_id: int
    time_on_page: int
    buttons_clicked: str
    cursor_positions: str
    return_frequency: int
    created_at: datetime


@router.get(
    "/records",
    response_model=list[LeadBehaviorPingRow],
    summary="Список снимков телеметрии (админ); отдельный путь от POST /",
)
async def list_lead_behavior_pings(
    skip: int = Query(0, ge=0, description="Смещение (offset)"),
    limit: int = Query(100, ge=1, le=5000, description="Лимит записей"),
    _admin: AdminUser = Depends(get_current_admin),
    session: AsyncSession = Depends(get_db),
) -> list[LeadBehaviorPing]:
    return await LeadBehaviorPingCRUD.list_slice(session, skip=skip, limit=limit)


@router.post(
    "",
    response_model=LeadBehaviorPingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Телеметрия лендинга (раз в секунду): время, клики, позиции курсора",
)
async def ingest_lead_behavior_ping(
    body: LeadBehaviorPingIn,
    session: AsyncSession = Depends(get_db),
) -> LeadBehaviorPingOut:
    d = body.normalized()
    row = LeadBehaviorPing(**d)
    session.add(row)
    try:
        await session.flush()
    except Exception:
        _log.exception("lead_behavior_ping: flush failed (таблица lead_behavior_pings?)")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Не удалось записать телеметрию. Убедитесь, что в БД есть таблица "
                "lead_behavior_pings (перезапуск бэкенда создаёт её через create_all)."
            ),
        ) from None
    return LeadBehaviorPingOut(id=row.id)
