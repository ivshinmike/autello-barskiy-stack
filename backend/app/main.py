from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, status
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.database import check_db, init_db
from app.routes import (
    admin_auth_router,
    admin_data_router,
    admin_users_router,
    admin_warm_leads_router,
    lead_behavior_ping_router,
    lead_behavior_router,
    warm_lead_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


_s = get_settings()
_open = _s.enable_openapi
app = FastAPI(
    title="Autéllo private API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _open else None,
    openapi_url="/openapi.json" if _open else None,
    redoc_url="/redoc" if _open else None,
)

app.include_router(
    warm_lead_router, prefix="/api/warm-leads", tags=["warm_leads"]
)
app.include_router(
    lead_behavior_router, prefix="/api/lead-behaviors", tags=["lead_behaviors"]
)
app.include_router(
    lead_behavior_ping_router,
    prefix="/api/lead-behavior",
    tags=["lead_behavior_ping"],
)
app.include_router(
    admin_data_router, prefix="/api/admin-data", tags=["admin_data"]
)
app.include_router(
    admin_auth_router, prefix="/api/admin-auth", tags=["admin_auth"]
)
app.include_router(
    admin_users_router, prefix="/api/admin-users", tags=["admin_users"]
)
app.include_router(
    admin_warm_leads_router, prefix="/api/admin/warm-leads", tags=["admin_warm_leads"]
)


async def _health_payload() -> JSONResponse | dict:
    if not await check_db():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unhealthy", "database": "unavailable"},
        )
    return {"status": "ok", "database": "ok"}


@app.get("/api/health", tags=["system"], response_model=None)
async def health():
    return await _health_payload()


@app.get("/health", tags=["system"], include_in_schema=False, response_model=None)
async def health_root():
    return await _health_payload()
