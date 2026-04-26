from app.models.base import Base
from app.models.warm_lead import WarmLead, WarmLeadCRUD
from app.models.lead_behavior import LeadBehavior, LeadBehaviorCRUD
from app.models.admin_data import AdminData, AdminDataCRUD

__all__ = [
    "Base",
    "WarmLead",
    "WarmLeadCRUD",
    "LeadBehavior",
    "LeadBehaviorCRUD",
    "AdminData",
    "AdminDataCRUD",
]
