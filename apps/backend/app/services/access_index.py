"""Who can reach each object and field, for paged "who can access" lists
(the standing pagination rule) and user counts on long lists.

Same rules as the per-user views (effective_access.py): a user's access is
the union of their profile, assigned permission sets and permission set
groups, with a group's muting set applied inside that group. Each distinct
source (profile, set or group) is evaluated once; a user's access is then
any of their sources granting it. So "users with Read on X" is the users
of the sources that grant X, without evaluating every user per request.

Built from the last sync and kept in memory per org until the sync, the
privacy level or the snapshot row counts change (a few orgs at most).
"""
from __future__ import annotations

from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.services.effective_access import (
    FIELD_FLAGS,
    OBJECT_FLAGS,
    EffectiveAccessService,
    _assigned_sources,
    _Component,
    _evaluate,
    _Source,
)

SourceKey = Tuple[Tuple[str, bool], ...]
_CACHE: "OrderedDict[str, Tuple[Tuple, AccessIndex]]" = OrderedDict()
_CACHE_ORGS = 4


@dataclass
class AccessIndex:
    users: Dict[str, Any]  # active users by Salesforce id
    sources: Dict[SourceKey, _Source]
    users_by_source: Dict[SourceKey, Set[str]]
    objects: Dict[SourceKey, Dict[str, Dict[str, bool]]]  # source -> object -> flags it grants
    fields: Dict[SourceKey, Dict[str, Dict[str, bool]]]  # source -> Object.Field -> flags
    _counts: Dict[str, Dict[str, Dict[str, int]]] = field(default_factory=dict)

    def _grants(self, kind: str) -> Dict[SourceKey, Dict[str, Dict[str, bool]]]:
        return self.objects if kind == "objects" else self.fields

    def users_with(self, kind: str, key: str, flag: str = "read") -> Set[str]:
        """Active users holding `flag` on an object or Object.Field."""
        out: Set[str] = set()
        for src, granted in self._grants(kind).items():
            if (granted.get(key) or {}).get(flag):
                out |= self.users_by_source.get(src, set())
        return out

    def sources_with(self, kind: str, key: str, flag: str = "read") -> List[_Source]:
        """The profiles, sets and groups that grant `flag` (a group after muting)."""
        return [self.sources[src] for src, granted in self._grants(kind).items() if (granted.get(key) or {}).get(flag)]

    def counts(self, kind: str) -> Dict[str, Dict[str, int]]:
        """key -> flag -> active users, for every object (or field); cached."""
        if kind not in self._counts:
            flags = OBJECT_FLAGS if kind == "objects" else FIELD_FLAGS
            holders: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: defaultdict(set))
            for src, granted in self._grants(kind).items():
                users = self.users_by_source.get(src, set())
                if not users:
                    continue
                for key, perm in granted.items():
                    for f in flags:
                        if perm.get(f):
                            holders[key][f] |= users
            self._counts[kind] = {k: {f: len(v.get(f, ())) for f in flags} for k, v in holders.items()}
        return self._counts[kind]


async def _marker(db: AsyncSession, org: Any) -> Tuple:
    oid = org.id
    job = (await db.execute(select(SyncJob.id, SyncJob.completed_at).where(
        SyncJob.organization_id == oid, SyncJob.status == SyncStatus.COMPLETED)
        .order_by(desc(SyncJob.completed_at)).limit(1))).first()
    counts = []
    for column in (UserSnapshot.organization_id, PermissionSetAssignmentSnapshot.organization_id,
                   PermissionSetSnapshot.organization_id):
        counts.append((await db.execute(select(func.count()).where(column == oid))).scalar())
    from app.services import privacy_mode
    return (tuple(job) if job else None, tuple(counts), privacy_mode.mode_of(org))


async def build(db: AsyncSession, org_id: str) -> AccessIndex:
    svc = EffectiveAccessService(db)
    users = {u.salesforce_id: u for u in (await db.execute(select(UserSnapshot).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.is_active.is_(True)))).scalars().all()}
    ps_rows = {p.salesforce_id: p for p in (await db.execute(select(PermissionSetSnapshot).where(
        PermissionSetSnapshot.organization_id == org_id))).scalars().all()}
    profile_ps = {p.profile_id: p.salesforce_id for p in ps_rows.values() if p.is_owned_by_profile and p.profile_id}
    profile_names = {p.salesforce_id: p.name for p in (await db.execute(select(ProfileSnapshot).where(
        ProfileSnapshot.organization_id == org_id))).scalars().all()}
    groups = {g.salesforce_id: g for g in (await db.execute(select(PermissionSetGroupSnapshot).where(
        PermissionSetGroupSnapshot.organization_id == org_id))).scalars().all()}
    components_by_group: Dict[str, List[str]] = defaultdict(list)
    for c in (await db.execute(select(PermissionSetGroupComponentSnapshot).where(
            PermissionSetGroupComponentSnapshot.organization_id == org_id))).scalars().all():
        components_by_group[c.permission_set_group_id].append(c.permission_set_id)
    assigned: Dict[str, List[str]] = defaultdict(list)
    for a in (await db.execute(select(PermissionSetAssignmentSnapshot).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id))).scalars().all():
        if a.permission_set_id not in assigned[a.assignee_id]:
            assigned[a.assignee_id].append(a.permission_set_id)
    object_perms = await svc._object_perms(org_id, ps_rows)
    field_perms = await svc._field_perms(org_id, ps_rows)

    def key_of(src: _Source) -> SourceKey:
        return tuple((c.ps_id, c.is_muting) for c in src.components)

    sources: Dict[SourceKey, _Source] = {}
    users_by_source: Dict[SourceKey, Set[str]] = defaultdict(set)

    def add(src: _Source, uid: Optional[str]) -> None:
        k = key_of(src)
        sources.setdefault(k, src)
        if uid:
            users_by_source[k].add(uid)

    # Every profile, set and group is a source, assigned or not, so "who grants it" lists them all.
    for ps in ps_rows.values():
        if ps.is_owned_by_profile and ps.profile_id:
            name = profile_names.get(ps.profile_id, ps.profile_id)
            add(_Source("profile", name, [_Component(ps.salesforce_id, name)]), None)
        elif (ps.ps_type or "Regular") not in ("Group", "Muting") and not ps.is_muting:
            add(_Source("permission_set", ps.label or ps.name, [_Component(ps.salesforce_id, ps.label or ps.name)]), None)
    for gid in groups:
        for src in _assigned_sources([], [gid], groups, components_by_group, ps_rows):
            add(src, None)
    for user in users.values():
        mine: List[_Source] = []
        if user.profile_id in profile_ps:
            name = profile_names.get(user.profile_id, user.profile_id)
            mine.append(_Source("profile", name, [_Component(profile_ps[user.profile_id], name)]))
        for src in _assigned_sources(mine, assigned.get(user.salesforce_id, []), groups, components_by_group, ps_rows):
            add(src, user.salesforce_id)

    objects = {k: _evaluate(s, object_perms, OBJECT_FLAGS).granted for k, s in sources.items()}
    fields = {k: _evaluate(s, field_perms, FIELD_FLAGS).granted for k, s in sources.items()}
    return AccessIndex(users, sources, dict(users_by_source), objects, fields)


async def access_index(db: AsyncSession, org_id: str) -> AccessIndex:
    from app.domain.models import Organization
    org = await db.get(Organization, org_id)
    marker = await _marker(db, org) if org is not None else None
    hit = _CACHE.get(org_id)
    if hit and hit[0] == marker:
        _CACHE.move_to_end(org_id)
        return hit[1]
    index = await build(db, org_id)
    _CACHE[org_id] = (marker, index)  # type: ignore[assignment]
    while len(_CACHE) > _CACHE_ORGS:
        _CACHE.popitem(last=False)
    return index


def source_kind_label(src: _Source) -> str:
    return {"profile": "Profile", "permission_set": "Permission set", "permission_set_group": "Permission set group"}[src.kind]


def names(sources: Iterable[_Source]) -> List[str]:
    return sorted({s.name for s in sources}, key=str.lower)
