"""Role hierarchy view (roadmap item 35a), read-only.

Builds the org's role tree from the synced UserRole rows: for each role, its
users, and the records owned by users in the role and below it (what rolls
up to its ancestors through the hierarchy), from the per-user owner counts
the sync takes (item 32). Flags empty roles, single-user roles and branches
deeper or wider than a threshold. Portal and community roles (PortalType
other than None) are kept in their own list.

Nothing here calls Salesforce. Users follow the org's privacy level: the
sync already stores aliases on masked orgs, and at Metadata only there are
no users, so roles are shown without user or record counts.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from app.ingestion.snapshot import OWNED_RECORDS_KEY  # per-user owner counts (item 32)

# Defaults only: Salesforce documents no depth limit (its guidance is to
# keep the number of levels low), so these are starting points to adjust.
DEFAULT_DEEP_AFTER = 5    # flag roles more than this many levels down
DEFAULT_WIDE_AFTER = 6    # flag roles with more than this many direct children
OWNED_OBJECTS = ("Account", "Opportunity")
ACCOUNT_OWNER_ACCESS_FIELDS = (
    ("OpportunityAccessForAccountOwner", "Opportunity"),
    ("CaseAccessForAccountOwner", "Case"),
    ("ContactAccessForAccountOwner", "Contact"),
)
USERS_HIDDEN = "Users and record counts aren't shown: this client's privacy level excludes user records."


@dataclass
class Thresholds:
    deep_after: int = DEFAULT_DEEP_AFTER
    wide_after: int = DEFAULT_WIDE_AFTER


def is_portal(raw: Dict[str, Any]) -> bool:
    pt = (raw or {}).get("PortalType")
    return bool(pt) and pt != "None"


def _owned(user: Any) -> Optional[Dict[str, Optional[int]]]:
    stored = (getattr(user, "raw_data", None) or {}).get(OWNED_RECORDS_KEY)
    return stored if isinstance(stored, dict) else None


def _add(total: Dict[str, Optional[int]], part: Dict[str, Optional[int]]) -> None:
    """Sum per object; one unknown makes the total unknown."""
    for obj in OWNED_OBJECTS:
        if total.get(obj, 0) is None or part.get(obj) is None:
            total[obj] = None
        else:
            total[obj] = total.get(obj, 0) + part[obj]


def build_view(roles: Iterable[Any], users: Iterable[Any], users_allowed: bool,
               thresholds: Optional[Thresholds] = None, coverage: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """JSON-ready role tree. roles: RoleSnapshot rows; users: UserSnapshot
    rows (empty at Metadata only)."""
    t = thresholds or Thresholds()
    roles = list(roles)
    by_id = {r.salesforce_id: r for r in roles}
    children: Dict[Optional[str], List[str]] = defaultdict(list)
    for r in sorted(roles, key=lambda r: (r.name or "").lower()):
        parent = r.parent_role_id if r.parent_role_id in by_id else None
        children[parent].append(r.salesforce_id)

    active: Dict[str, int] = defaultdict(int)
    inactive: Dict[str, int] = defaultdict(int)
    owned: Dict[str, Dict[str, Optional[int]]] = defaultdict(lambda: {o: 0 for o in OWNED_OBJECTS})
    no_role = 0
    for u in users:
        rid = getattr(u, "user_role_id", None)
        if not rid or rid not in by_id:
            no_role += 1 if getattr(u, "is_active", False) else 0
            continue
        if getattr(u, "is_active", False):
            active[rid] += 1
        else:
            inactive[rid] += 1
        # Records owned by inactive users still roll up through the hierarchy.
        _add(owned[rid], _owned(u) or {o: None for o in OWNED_OBJECTS})

    out: Dict[str, Dict[str, Any]] = {}

    def visit(rid: str, depth: int, portal: bool) -> Dict[str, Any]:
        r = by_id[rid]
        raw = r.raw_data or {}
        node: Dict[str, Any] = {
            "id": rid,
            "name": r.name,
            "developer_name": raw.get("DeveloperName"),
            "parent_id": r.parent_role_id if r.parent_role_id in by_id else None,
            "depth": depth,
            "portal_type": raw.get("PortalType") if is_portal(raw) else None,
            "rollup_description": raw.get("RollupDescription"),
            "account_owner_access": {
                obj: raw.get(field) for field, obj in ACCOUNT_OWNER_ACCESS_FIELDS if raw.get(field)
            },
            "children": list(children.get(rid, [])),
        }
        sub_users = 0
        sub_owned = {o: 0 for o in OWNED_OBJECTS}
        sub_depth = depth
        for c in node["children"]:
            child = visit(c, depth + 1, portal)
            if users_allowed:
                sub_users += child["subtree_user_count"]
                _add(sub_owned, child["subtree_owned"])
            sub_depth = max(sub_depth, child["branch_depth"])
        if users_allowed:
            mine = dict(owned[rid]) if rid in owned else {o: 0 for o in OWNED_OBJECTS}
            node.update({
                "user_count": active.get(rid, 0),
                "inactive_user_count": inactive.get(rid, 0),
                "owned": mine,
            })
            _add(sub_owned, mine)
            node["subtree_user_count"] = sub_users + node["user_count"]
            node["subtree_owned"] = sub_owned
        else:
            node.update({"user_count": None, "inactive_user_count": None, "owned": None,
                         "subtree_user_count": None, "subtree_owned": None})
        node["branch_depth"] = sub_depth
        flags = []
        if users_allowed and node["user_count"] == 0:
            flags.append({"code": "empty", "label": "Empty",
                          "reason": "No active users in this role." + (
                              f" {node['subtree_user_count']} below it." if node["subtree_user_count"] else "")})
        if users_allowed and node["user_count"] == 1:
            flags.append({"code": "single_user", "label": "One user", "reason": "Only one active user in this role."})
        if depth > t.deep_after:
            flags.append({"code": "deep", "label": "Deep",
                          "reason": f"{depth} levels from the top (threshold: more than {t.deep_after})."})
        if len(node["children"]) > t.wide_after:
            flags.append({"code": "wide", "label": "Wide",
                          "reason": f"{len(node['children'])} roles directly below (threshold: more than {t.wide_after})."})
        node["flags"] = flags
        out[rid] = node
        return node

    roots = children.get(None, [])
    internal_roots = [r for r in roots if not is_portal(by_id[r].raw_data or {})]
    portal_roots = [r for r in roots if is_portal(by_id[r].raw_data or {})]
    for r in internal_roots:
        visit(r, 1, False)
    for r in portal_roots:
        visit(r, 1, True)

    internal = [n for n in out.values() if not n["portal_type"]]
    portal = [n for n in out.values() if n["portal_type"]]
    flag_counts: Dict[str, int] = defaultdict(int)
    for n in internal:
        for f in n["flags"]:
            flag_counts[f["code"]] += 1
    from app.services.record_coverage import PARTIAL_LABEL
    partial = [o for o in OWNED_OBJECTS if ((coverage or {}).get("objects") or {}).get(o) != "full"]
    return {
        "roles": out,
        "roots": internal_roots,
        "portal_roots": portal_roots,
        "summary": {
            "roles": len(internal),
            "portal_roles": len(portal),
            "max_depth": max((n["depth"] for n in internal), default=0),
            "users_without_role": no_role if users_allowed else None,
            "flags": dict(flag_counts),
        },
        "thresholds": {"deep_after": t.deep_after, "wide_after": t.wide_after,
                       "defaults": {"deep_after": DEFAULT_DEEP_AFTER, "wide_after": DEFAULT_WIDE_AFTER}},
        "users_allowed": users_allowed,
        "users_hidden_reason": None if users_allowed else USERS_HIDDEN,
        "owned_objects": list(OWNED_OBJECTS),
        "partial_label": PARTIAL_LABEL if users_allowed and partial else None,
        "partial_objects": partial if users_allowed else [],
    }


async def load_view(db: Any, org_id: str, thresholds: Optional[Thresholds] = None) -> Dict[str, Any]:
    from sqlalchemy import select

    from app.domain.models import RoleSnapshot, UserSnapshot
    from app.services import privacy_mode
    from app.services.record_coverage import latest_record_coverage

    org = await privacy_mode.load_org(db, org_id)
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    roles = (await db.execute(select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id))).scalars().all()
    users = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id))).scalars().all() \
        if users_allowed else []
    coverage = await latest_record_coverage(db, org_id)
    return build_view(roles, users, users_allowed, thresholds, coverage)


async def role_users(db: Any, org_id: str, role_id: str) -> List[Dict[str, Any]]:
    """Users in one role: name, profile, risk score and level, last login,
    owned records. Names are aliases on masked orgs (stored that way)."""
    from sqlalchemy import func, select

    from app.domain.models import ProfileSnapshot, RiskScore, UserSnapshot

    users = (await db.execute(select(UserSnapshot).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.user_role_id == role_id,
    ))).scalars().all()
    if not users:
        return []
    profiles = {p.salesforce_id: p.name for p in (await db.execute(
        select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id)
    )).scalars().all()}
    ids = [u.salesforce_id for u in users]
    latest = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user", RiskScore.entity_id.in_(ids))
        .group_by(RiskScore.entity_id).subquery()
    )
    risks = {r.entity_id: r for r in (await db.execute(
        select(RiskScore).join(latest, (RiskScore.entity_id == latest.c.entity_id) & (RiskScore.calculated_at == latest.c.at))
        .where(RiskScore.organization_id == org_id)
    )).scalars().all()}
    rows = []
    for u in users:
        r = risks.get(u.salesforce_id)
        rows.append({
            "id": u.salesforce_id,
            "name": u.name or u.username,
            "profile": profiles.get(u.profile_id),
            "is_active": bool(u.is_active),
            "risk_score": round(r.risk_score) if r and r.risk_score is not None else None,
            "risk_level": str(getattr(r.risk_level, "value", r.risk_level)).lower() if r and r.risk_level else None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "owned": _owned(u),
        })
    return sorted(rows, key=lambda x: (not x["is_active"], -(x["risk_score"] or -1), (x["name"] or "").lower()))
