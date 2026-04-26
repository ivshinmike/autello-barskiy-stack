from app.routes.warm_lead import router as warm_lead_router
from app.routes.lead_behavior import router as lead_behavior_router
from app.routes.admin_data import router as admin_data_router

__all__ = [
    "warm_lead_router",
    "lead_behavior_router",
    "admin_data_router",
]
