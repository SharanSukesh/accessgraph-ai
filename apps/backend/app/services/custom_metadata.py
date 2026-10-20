"""Custom metadata records, opt-in per type (roadmap item 11 part c2,
Config Workbook parity row #7).

Custom metadata types are configuration, but their values can hold
configuration secrets (endpoints, keys, thresholds a client treats as
confidential). So:

  - every sync lists the types (API name and label, from the global
    describe: names ending __mdt), never their records;
  - records are read only for the types an engagement admin turns on for
    the org (Organization.settings["custom_metadata"], off by default,
    audit-logged), at the next sync;
  - turning a type off removes its stored records from every past sync, and
    the workbook only shows types that are on now.

Reads: describe of each enabled type (its custom fields), then
SELECT DeveloperName, MasterLabel, NamespacePrefix, <custom fields> FROM
<type> (custom metadata types are queryable like sObjects). At most
MAX_TYPES types and MAX_RECORDS records per type.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set

from app.domain.models import Organization

SETTINGS_KEY = "custom_metadata"
MAX_TYPES = 25
MAX_RECORDS = 2000
STANDARD = ("DeveloperName", "MasterLabel", "NamespacePrefix")
SKIP_FIELDS = {"Id", "Label", "Language", "QualifiedApiName", "SystemModstamp", "CreatedDate", "CreatedById",
               "LastModifiedDate", "LastModifiedById", "IsProtected"}


def enabled_types(org: Optional[Organization]) -> Set[str]:
    return set(((org.settings or {}) if org else {}).get(SETTINGS_KEY, {}).get("types") or [])


def record_of(org: Organization) -> Dict[str, Any]:
    return ((org.settings or {}).get(SETTINGS_KEY) or {"types": []})


def set_enabled(org: Organization, types: Iterable[str], actor_email: str, note: Optional[str]) -> Dict[str, Any]:
    record = {
        "types": sorted({t for t in types if t.endswith("__mdt")}),
        "changed_by": actor_email,
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "note": (note or "")[:500],
    }
    org.settings = {**(org.settings or {}), SETTINGS_KEY: record}
    return record


def is_type(name: Optional[str]) -> bool:
    return bool(name) and str(name).endswith("__mdt")


def keep_enabled(records: Optional[Dict[str, Any]], enabled: Set[str]) -> Dict[str, Any]:
    """Only the records of types that are on now."""
    return {t: v for t, v in (records or {}).items() if t in enabled}


async def collect_live(client: Any, enabled: Set[str]) -> Dict[str, Any]:
    """The org's custom metadata types (always) and the records of enabled
    types (read-only queries). Never raises: what fails is noted."""
    out: Dict[str, Any] = {"notes": []}
    try:
        sobjects = await client.list_all_sobjects()
    except Exception:  # noqa: BLE001
        out["notes"].append("Custom metadata types couldn't be listed.")
        return out
    types = sorted(({"name": s["name"], "label": s.get("label")} for s in sobjects if is_type(s.get("name"))),
                   key=lambda t: t["name"].lower())
    out["types"] = types
    names = {t["name"] for t in types}
    wanted = sorted(enabled & names)
    if len(wanted) > MAX_TYPES:
        out["notes"].append(f"Records were read for the first {MAX_TYPES} of the {len(wanted)} custom metadata types "
                            "turned on.")
    records: Dict[str, Any] = {}
    for t in wanted[:MAX_TYPES]:
        try:
            d = await client.describe_object(t)
            fields = [f["name"] for f in d.get("fields") or [] if f.get("name") not in SKIP_FIELDS
                      and f.get("name") not in STANDARD]
            rows = await client.query_all(f"SELECT {', '.join(STANDARD + tuple(fields))} FROM {t}")
        except Exception:  # noqa: BLE001
            out["notes"].append(f"Records of {t} couldn't be read.")
            continue
        records[t] = {"fields": fields, "records": [
            {"name": r.get("DeveloperName"), "label": r.get("MasterLabel"), "namespace": r.get("NamespacePrefix"),
             "values": {f: r.get(f) for f in fields}} for r in rows[:MAX_RECORDS]]}
        if len(rows) > MAX_RECORDS:
            out["notes"].append(f"Only the first {MAX_RECORDS} records of {t} were kept.")
    out["records"] = records
    return out


async def purge(db: Any, org_id: str, keep: Set[str]) -> int:
    """Remove the stored records of types no longer turned on, from every
    sync of the org. Returns how many types' records were removed."""
    from sqlalchemy import select
    from sqlalchemy.orm.attributes import flag_modified

    from app.domain.models import SyncJob

    removed = 0
    jobs = (await db.execute(select(SyncJob).where(SyncJob.organization_id == org_id))).scalars().all()
    for j in jobs:
        docs = (j.sync_metadata or {}).get("org_docs")
        if not isinstance(docs, dict) or not docs.get("custom_metadata_records"):
            continue
        stored = docs["custom_metadata_records"]
        drop: List[str] = [t for t in stored if t not in keep]
        if not drop:
            continue
        removed += len(drop)
        docs["custom_metadata_records"] = {t: v for t, v in stored.items() if t in keep}
        j.sync_metadata = {**j.sync_metadata, "org_docs": docs}
        flag_modified(j, "sync_metadata")
    return removed
