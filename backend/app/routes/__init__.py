from app.routes.warm_lead import router as warm_lead_router
from app.routes.lead_behavior import router as lead_behavior_router
from app.routes.lead_behavior_ping import router as lead_behavior_ping_router
from app.routes.admin_data import router as admin_data_router
from app.routes.admin_auth import router as admin_auth_router
from app.routes.admin_users import router as admin_users_router
from app.routes.admin_warm_leads import router as admin_warm_leads_router

__all__ = [
    "warm_lead_router",
    "lead_behavior_router",
    "lead_behavior_ping_router",
    "admin_data_router",
    "admin_auth_router",
    "admin_users_router",
    "admin_warm_leads_router",
]
