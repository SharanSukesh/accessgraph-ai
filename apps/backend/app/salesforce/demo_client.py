"""Read-only stand-in for SalesforceAPIClient, used only for demo orgs.

A demo org has no Salesforce connection. The few org-level facts Newton
normally reads live (licences, edition, limits, record ownership) come
from the fixture's "demo_live" section instead. Every other read returns
"no data", which the analyzers already treat like a permission-denied
query. Nothing here can reach the network.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Any method that would change Salesforce refuses instead of quietly "succeeding".
_WRITE_PREFIXES = ("update", "create", "delete", "insert", "upsert", "patch", "post", "put", "deploy", "assign")


class DemoSalesforceClient:
    instance_url = "https://demo.invalid"
    access_token = ""

    def __init__(self, demo_live: Dict[str, Any]):
        self._live = demo_live or {}

    async def get_user_licenses(self) -> List[Dict[str, Any]]:
        return list(self._live.get("user_licenses", []))

    async def get_permission_set_licenses(self) -> List[Dict[str, Any]]:
        return list(self._live.get("permission_set_licenses", []))

    async def extract_organization(self) -> Optional[Dict[str, Any]]:
        return self._live.get("organization")

    async def get_org_limits(self) -> Dict[str, Any]:
        return dict(self._live.get("org_limits", {}))

    async def owner_counts_by_object(self, object_name: str) -> Dict[str, int]:
        return dict(self._live.get("owner_counts", {}).get(object_name, {}))

    async def owner_counts_for(self, object_name: str, owner_ids: List[str]) -> Optional[Dict[str, int]]:
        counts = self._live.get("owner_counts", {}).get(object_name, {})
        wanted = set(owner_ids)
        return {k: v for k, v in counts.items() if k in wanted}

    async def count_sobject(self, object_name: str) -> Optional[int]:
        return None

    async def total_account_count(self) -> Optional[int]:
        return None

    async def count_stale_opportunities(self, days: int = 60) -> Optional[int]:
        return None

    def __getattr__(self, name: str):
        if name.startswith(_WRITE_PREFIXES):
            async def _refuse(*_args, **_kwargs):
                from app.ingestion.demo_orgs import DemoOrgUnsupported
                raise DemoOrgUnsupported(
                    "This is a demo org with synthetic data; nothing can be written to Salesforce."
                )
            return _refuse

        async def _no_data(*_args, **_kwargs):
            logger.debug("demo client: %s has no demo data", name)
            return []
        return _no_data
