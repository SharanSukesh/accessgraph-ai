"""Keep client org names meaningful.

Orgs take their Salesforce Organization.Name on connect, reconnect and
every sync, unless someone in Newton renamed the org, which wins.
"""
from typing import Optional

from app.domain.models import Organization

MAX_NAME_LENGTH = 120


def apply_salesforce_name(org: Organization, salesforce_name: Optional[str]) -> None:
    if not salesforce_name or (org.settings or {}).get("name_source") == "manual":
        return
    org.name = salesforce_name.strip()[:MAX_NAME_LENGTH]


def rename_manually(org: Organization, name: str) -> None:
    org.name = name.strip()[:MAX_NAME_LENGTH]
    org.settings = {**(org.settings or {}), "name_source": "manual"}
