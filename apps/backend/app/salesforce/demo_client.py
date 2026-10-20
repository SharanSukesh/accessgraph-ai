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

    async def get_code_coverage(self) -> Dict[str, Any]:
        return dict(self._live.get("code_coverage") or {})

    async def get_apex_rest_resources(self) -> Optional[List[Dict[str, Any]]]:
        return [dict(c) for c in (self._live.get("api_usage") or {}).get("apex_rest", [])]

    async def get_api_total_usage(self, apex_rest: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        usage = self._live.get("api_usage")
        if not usage:
            return {"status": "ok", "days": []}
        return {"status": "ok", "days": [dict(d) for d in usage.get("days", [])]}

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


class DemoDataQualityClient:
    """Serves Data Quality's reads for a demo org from the fixture's
    demo_live.data_quality section: object list, describe, counts,
    populated counts per field, last-modified ages and duplicate cluster
    sizes. Read-only, never reaches the network, and answers only the
    calls Data Quality makes.

    Ages are stored as days before the fixture's as_of date and age with
    the calendar, so a staleness cutoff behaves as it would on a live org.
    """

    instance_url = "https://demo.invalid"

    def __init__(self, data: Dict[str, Any]):
        from datetime import date
        self._objects = {o["name"]: o for o in (data or {}).get("objects", [])}
        as_of = (data or {}).get("as_of")
        self._as_of = date.fromisoformat(as_of) if as_of else date.today()

    def _obj(self, name: str) -> Dict[str, Any]:
        return self._objects.get(name) or {}

    async def list_all_sobjects(self) -> List[Dict[str, Any]]:
        return [{"name": o["name"], "label": o.get("label") or o["name"], "custom": bool(o.get("custom")),
                 "queryable": True} for o in self._objects.values()]

    async def describe_object(self, name: str) -> Dict[str, Any]:
        o = self._obj(name)
        if not o:
            raise KeyError(name)
        base = {"calculated": False, "autoNumber": False, "encrypted": False, "createable": True,
                "nillable": True, "custom": False, "aggregatable": True, "groupable": True}
        fields = [{**base, **{k: v for k, v in f.items() if k != "populated"}} for f in o.get("fields", [])]
        fields.append({**base, "name": "LastModifiedDate", "type": "datetime", "createable": False})
        return {"name": name, "label": o.get("label"), "fields": fields}

    async def approximate_record_counts(self, names: List[str]) -> Dict[str, int]:
        return {n: int(self._obj(n).get("approx_count", self._obj(n).get("record_count", 0))) for n in names if self._obj(n)}

    async def count_sobject(self, name: str) -> Optional[int]:
        o = self._obj(name)
        return int(o["record_count"]) if o else None

    def _populated(self, name: str) -> Dict[str, int]:
        return {f["name"]: int(f.get("populated", 0)) for f in self._obj(name).get("fields", [])}

    async def aggregate_field_populated_counts(self, name: str, field_names: List[str]) -> Optional[Dict[str, int]]:
        o = self._obj(name)
        if not o:
            return None
        pop = self._populated(name)
        return {"__total__": int(o["record_count"]), **{f: pop.get(f, 0) for f in field_names}}

    async def bounded_populated_counts(self, name: str, field_names: List[str], sample_size: int,
                                       page_size: int = 2000) -> Optional[Dict[str, int]]:
        o = self._obj(name)
        if not o:
            return None
        total = int(o["record_count"])
        n = min(sample_size, total)
        pop = self._populated(name)
        return {"__sampled__": n, **{f: round(pop.get(f, 0) / total * n) if total else 0 for f in field_names}}

    async def aggregate_duplicate_cluster_sizes(self, name: str, key_field: str, limit: int = 2000) -> Optional[List[int]]:
        return sorted(self._obj(name).get("duplicate_clusters", []), reverse=True)[:limit]

    async def count_modified_before(self, name: str, cutoff_iso: str) -> Optional[int]:
        from datetime import date, datetime
        o = self._obj(name)
        if not o:
            return None
        cutoff = datetime.fromisoformat(cutoff_iso.replace("Z", "+00:00")).date()
        elapsed = (date.today() - self._as_of).days
        cutoff_age = (date.today() - cutoff).days
        return sum(int(count) for age, count in o.get("age_buckets", []) if age + elapsed > cutoff_age)

    async def extract_duplicate_rules(self) -> List[Dict[str, Any]]:
        return []

    async def aggregate_duplicate_record_sets_by_rule(self) -> Dict[str, int]:
        return {}


class DemoChangeRiskClient:
    """Serves Change-Risk Radar's one read for a demo org: the fixture's
    Setup Audit Trail (demo_live.setup_audit_trail, dates already moved with
    the demo anchor), newest first, within the window asked for. Read-only,
    never reaches the network."""

    instance_url = "https://demo.invalid"

    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows or []

    async def extract_setup_audit_trail(self, since_days: int = 30, limit: int = 5000) -> List[Dict[str, Any]]:
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=since_days)

        def when(r: Dict[str, Any]) -> datetime:
            return datetime.strptime(r["CreatedDate"], "%Y-%m-%dT%H:%M:%S.%f%z")

        rows = [r for r in self._rows if cutoff <= when(r) <= now]
        return sorted(rows, key=when, reverse=True)[:limit]
