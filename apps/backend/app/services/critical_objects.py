"""Critical objects: which objects' data is unhealthy, and why.

Built on the Data Quality run (no separate crawler). Each analysed object
gets flags, each with a plain reason and the numbers behind it:

  stale            share of records not modified within the staleness
                   window is at or above stale_share_pct
  mostly_empty     average fill rate across the inspected fields is below
                   min_fill_pct
  never_populated  inspected fields with no value on any record (exact
                   counts only; a field empty in a sample is reported
                   separately and never as "never populated")

Thresholds are adjustable per org (Organization.settings["data_quality"])
and stored with every run so results can be reproduced. Counts are
estimates where the object was sampled, and partial where the integration
user can't see every record; both are labelled.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Organization


@dataclass
class CriticalObjectSettings:
    stale_days: int = 180              # a record is stale when unmodified this long
    stale_share_pct: float = 80.0      # object flagged when this share of records is stale
    min_fill_pct: float = 40.0         # object flagged when average fill rate is below this
    large_object_records: int = 1_000_000  # above this (approximate count), sample instead of counting
    sample_size: int = 10_000          # records read when sampling a large object

    LIMITS = {
        "stale_days": (30, 3650),
        "stale_share_pct": (1, 100),
        "min_fill_pct": (1, 100),
        "large_object_records": (50_000, 50_000_000),
        "sample_size": (500, 50_000),
    }

    @classmethod
    def from_dict(cls, raw: Optional[Dict[str, Any]]) -> "CriticalObjectSettings":
        out = cls()
        for f in fields(cls):
            if raw and raw.get(f.name) is not None:
                lo, hi = cls.LIMITS[f.name]
                value = type(getattr(out, f.name))(raw[f.name])
                setattr(out, f.name, min(max(value, lo), hi))
        return out

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


async def load_settings(db: AsyncSession, org_id: str) -> CriticalObjectSettings:
    org = await db.get(Organization, org_id)
    return CriticalObjectSettings.from_dict(((org.settings or {}) if org else {}).get("data_quality"))


async def save_settings(db: AsyncSession, org_id: str, raw: Dict[str, Any]) -> CriticalObjectSettings:
    org = await db.get(Organization, org_id)
    settings = CriticalObjectSettings.from_dict(raw)
    org.settings = {**(org.settings or {}), "data_quality": settings.to_dict()}
    await db.commit()
    return settings


def critical_flags(
    *,
    record_count: int,
    staleness_pct: Optional[float],
    stale_count: Optional[int],
    completeness_pct: float,
    fields_inspected: int,
    never_populated: List[str],
    estimated: bool,
    settings: CriticalObjectSettings,
) -> List[Dict[str, Any]]:
    """Flags for one object, each with a reason a consultant can repeat."""
    if record_count <= 0:
        return []
    flags: List[Dict[str, Any]] = []
    approx = "about " if estimated else ""
    if staleness_pct is not None and staleness_pct >= settings.stale_share_pct:
        flags.append({
            "code": "stale",
            "label": "Stale",
            "reason": (f"{staleness_pct:.0f}% of {approx}{record_count:,} records haven't been modified in "
                       f"{settings.stale_days} days (threshold {settings.stale_share_pct:g}%)."),
            "value": round(staleness_pct, 1),
            "threshold": settings.stale_share_pct,
            "stale_records": stale_count,
            "estimated": estimated,
        })
    if fields_inspected and completeness_pct < settings.min_fill_pct:
        flags.append({
            "code": "mostly_empty",
            "label": "Mostly empty",
            "reason": (f"On average only {completeness_pct:.0f}% of the {fields_inspected} inspected fields hold a value "
                       f"(threshold {settings.min_fill_pct:g}%)."),
            "value": round(completeness_pct, 1),
            "threshold": settings.min_fill_pct,
            "estimated": estimated,
        })
    if never_populated and not estimated:
        n = len(never_populated)
        flags.append({
            "code": "never_populated",
            "label": "Fields never populated",
            "reason": (f"{n} field{'s' if n != 1 else ''} with no value on any of the {record_count:,} records: "
                       f"{', '.join(never_populated)}."),
            "fields": never_populated,
            "estimated": False,
        })
    return flags
