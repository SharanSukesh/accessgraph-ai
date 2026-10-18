"""
Effective Access Service

A user's access is the union of their grant sources: the profile, each
directly assigned permission set, and each permission set group. A group
contributes the union of its non-muting components minus whatever its
muting permission set mutes. Muting only removes permissions granted
through that same group, so the same permission from the profile or
another assignment survives. Mirrors RiskScoringService's bundle().
"""
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


OBJECT_FLAGS = ("read", "create", "edit", "delete")
FIELD_FLAGS = ("read", "edit")
FLAG_LABELS = {"read": "Read", "create": "Create", "edit": "Edit", "delete": "Delete"}


@dataclass
class _Component:
    ps_id: str
    name: str
    is_muting: bool = False


@dataclass
class _Source:
    kind: str  # profile | permission_set | permission_set_group
    name: str
    components: List[_Component] = field(default_factory=list)
    group_id: Optional[str] = None

    @property
    def label(self) -> str:
        prefix = {"profile": "Profile", "permission_set": "PermissionSet",
                  "permission_set_group": "PSG"}[self.kind]
        return f"{prefix}: {self.name}"


@dataclass
class _SourceAccess:
    """What one source grants per key (object or field) after muting."""
    granted: Dict[str, Dict[str, bool]]
    granting_components: Dict[str, List[str]]
    muted: Dict[str, Dict[str, str]]  # key -> flag -> muting set name


def _evaluate(source: _Source, perms_by_parent: Dict[str, Dict[str, Dict[str, bool]]],
              flags: Sequence[str]) -> _SourceAccess:
    granted: Dict[str, Dict[str, bool]] = defaultdict(lambda: dict.fromkeys(flags, False))
    granting: Dict[str, List[str]] = defaultdict(list)
    for comp in source.components:
        if comp.is_muting:
            continue
        for key, perm in perms_by_parent.get(comp.ps_id, {}).items():
            if any(perm[f] for f in flags):
                granting[key].append(comp.name)
            for f in flags:
                granted[key][f] = granted[key][f] or perm[f]
    muted: Dict[str, Dict[str, str]] = defaultdict(dict)
    for comp in source.components:
        if not comp.is_muting:
            continue
        for key, perm in perms_by_parent.get(comp.ps_id, {}).items():
            for f in flags:
                if perm[f] and granted.get(key, {}).get(f):
                    granted[key][f] = False
                    muted[key][f] = comp.name
    return _SourceAccess(dict(granted), dict(granting), dict(muted))


class EffectiveAccessService:
    """Compute effective access for users from profile, permission sets and groups."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _user(self, org_id: str, user_sf_id: str) -> UserSnapshot:
        user = (
            await self.db.execute(
                select(UserSnapshot).where(
                    UserSnapshot.organization_id == org_id,
                    UserSnapshot.salesforce_id == user_sf_id,
                )
            )
        ).scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found: {user_sf_id}")
        return user

    async def _sources(self, org_id: str, user: UserSnapshot) -> List[_Source]:
        sources: List[_Source] = []
        if user.profile_id:
            profile_ps = (
                await self.db.execute(
                    select(PermissionSetSnapshot).where(
                        PermissionSetSnapshot.organization_id == org_id,
                        PermissionSetSnapshot.profile_id == user.profile_id,
                        PermissionSetSnapshot.is_owned_by_profile == True,  # noqa: E712
                    )
                )
            ).scalars().first()
            if profile_ps:
                profile_name = (
                    await self.db.execute(
                        select(ProfileSnapshot.name).where(
                            ProfileSnapshot.organization_id == org_id,
                            ProfileSnapshot.salesforce_id == user.profile_id,
                        )
                    )
                ).scalar_one_or_none() or user.profile_id
                sources.append(_Source("profile", profile_name, [_Component(profile_ps.salesforce_id, profile_name)]))

        assigned_ids = list(dict.fromkeys(
            (
                await self.db.execute(
                    select(PermissionSetAssignmentSnapshot.permission_set_id).where(
                        PermissionSetAssignmentSnapshot.organization_id == org_id,
                        PermissionSetAssignmentSnapshot.assignee_id == user.salesforce_id,
                    )
                )
            ).scalars().all()
        ))
        if not assigned_ids:
            return sources

        groups = {
            g.salesforce_id: g
            for g in (
                await self.db.execute(
                    select(PermissionSetGroupSnapshot).where(
                        PermissionSetGroupSnapshot.organization_id == org_id,
                        PermissionSetGroupSnapshot.salesforce_id.in_(assigned_ids),
                    )
                )
            ).scalars().all()
        }
        components_by_group: Dict[str, List[str]] = defaultdict(list)
        if groups:
            for gid, ps_id in (
                await self.db.execute(
                    select(
                        PermissionSetGroupComponentSnapshot.permission_set_group_id,
                        PermissionSetGroupComponentSnapshot.permission_set_id,
                    ).where(
                        PermissionSetGroupComponentSnapshot.organization_id == org_id,
                        PermissionSetGroupComponentSnapshot.permission_set_group_id.in_(list(groups)),
                    )
                )
            ).all():
                components_by_group[gid].append(ps_id)

        ps_ids = set(assigned_ids) | {pid for ids in components_by_group.values() for pid in ids}
        ps_rows = {
            ps.salesforce_id: ps
            for ps in (
                await self.db.execute(
                    select(PermissionSetSnapshot).where(
                        PermissionSetSnapshot.organization_id == org_id,
                        PermissionSetSnapshot.salesforce_id.in_(ps_ids),
                    )
                )
            ).scalars().all()
        }

        def component(ps_id: str) -> _Component:
            ps = ps_rows.get(ps_id)
            return _Component(ps_id, (ps.label or ps.name) if ps else ps_id, bool(ps and ps.is_muting))

        for ps_id in assigned_ids:
            if ps_id in groups:
                group = groups[ps_id]
                sources.append(_Source(
                    "permission_set_group",
                    group.master_label or group.developer_name or ps_id,
                    [component(c) for c in components_by_group.get(ps_id, [])],
                    group_id=ps_id,
                ))
                continue
            ps = ps_rows.get(ps_id)
            # Salesforce also lists the profile's own permission set as an
            # assignment; it's covered by the profile source. A muting set
            # can't grant anything outside its group.
            if ps is not None and (ps.is_owned_by_profile or ps.is_muting):
                continue
            if ps is not None and ps.ps_type == "Group":
                # Salesforce's aggregate permission set for a group: its rows
                # are already the group's net access, muting applied. Same
                # evaluation as a permission set; labelled as the group.
                sources.append(_Source("permission_set_group", component(ps_id).name,
                                       [component(ps_id)], group_id=ps_id))
                continue
            sources.append(_Source("permission_set", component(ps_id).name, [component(ps_id)]))
        return sources

    async def _object_perms(self, org_id: str, ps_ids: Iterable[str],
                            object_name: Optional[str] = None) -> Dict[str, Dict[str, Dict[str, bool]]]:
        query = select(ObjectPermissionSnapshot).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.parent_id.in_(list(ps_ids)),
        )
        if object_name:
            query = query.where(ObjectPermissionSnapshot.sobject_type == object_name)
        out: Dict[str, Dict[str, Dict[str, bool]]] = defaultdict(dict)
        for p in (await self.db.execute(query)).scalars().all():
            out[p.parent_id][p.sobject_type] = {
                "read": bool(p.permissions_read), "create": bool(p.permissions_create),
                "edit": bool(p.permissions_edit), "delete": bool(p.permissions_delete),
            }
        return out

    async def _field_perms(self, org_id: str, ps_ids: Iterable[str]) -> Dict[str, Dict[str, Dict[str, bool]]]:
        out: Dict[str, Dict[str, Dict[str, bool]]] = defaultdict(dict)
        for p in (
            await self.db.execute(
                select(FieldPermissionSnapshot).where(
                    FieldPermissionSnapshot.organization_id == org_id,
                    FieldPermissionSnapshot.parent_id.in_(list(ps_ids)),
                )
            )
        ).scalars().all():
            existing = out[p.parent_id].get(p.field, {"read": False, "edit": False})
            out[p.parent_id][p.field] = {
                "read": existing["read"] or bool(p.permissions_read),
                "edit": existing["edit"] or bool(p.permissions_edit),
            }
        return out

    @staticmethod
    def _combine(evaluated: List[_SourceAccess], flags: Sequence[str]) -> Tuple[Dict[str, Dict[str, bool]], Dict[str, int]]:
        access: Dict[str, Dict[str, bool]] = defaultdict(lambda: dict.fromkeys(flags, False))
        sources_granting: Dict[str, int] = defaultdict(int)
        for ev in evaluated:
            for key, perms in ev.granted.items():
                if any(perms.values()):
                    sources_granting[key] += 1
                for f in flags:
                    access[key][f] = access[key][f] or perms[f]
        return dict(access), dict(sources_granting)

    async def get_user_object_access(self, org_id: str, user_sf_id: str) -> Dict:
        user = await self._user(org_id, user_sf_id)
        sources = await self._sources(org_id, user)
        perms = await self._object_perms(org_id, {c.ps_id for s in sources for c in s.components})
        access, granted_by = self._combine([_evaluate(s, perms, OBJECT_FLAGS) for s in sources], OBJECT_FLAGS)

        objects_list = []
        for obj_name, p in access.items():
            if not any(p.values()):
                continue
            objects_list.append({
                "object": obj_name,
                "objectName": obj_name,
                "objectLabel": obj_name,  # We don't have label metadata, use name
                "access": dict(p),
                "permissions": {
                    "canRead": p["read"],
                    "canCreate": p["create"],
                    "canEdit": p["edit"],
                    "canDelete": p["delete"],
                },
                "isSensitive": False,  # Would need metadata to determine
                "grantedByCount": granted_by.get(obj_name, 0),
            })
        return {"objects": objects_list}

    async def get_user_field_access(self, org_id: str, user_sf_id: str) -> Dict:
        user = await self._user(org_id, user_sf_id)
        sources = await self._sources(org_id, user)
        perms = await self._field_perms(org_id, {c.ps_id for s in sources for c in s.components})
        access, granted_by = self._combine([_evaluate(s, perms, FIELD_FLAGS) for s in sources], FIELD_FLAGS)

        fields_list = []
        for field_name, p in access.items():
            if not any(p.values()):
                continue
            if "." in field_name:
                object_name, field_api_name = field_name.split(".", 1)
            else:
                object_name, field_api_name = "Unknown", field_name
            fields_list.append({
                "objectName": object_name,
                "fieldName": field_api_name,
                "fieldLabel": field_api_name,  # We don't have label metadata
                "access": dict(p),
                "canRead": p["read"],
                "canEdit": p["edit"],
                "isSensitive": False,  # Would need metadata to determine
                "grantedByCount": granted_by.get(field_name, 0),
            })
        return {"fields": fields_list}

    async def explain_user_object_access(self, org_id: str, user_sf_id: str, object_name: str) -> Dict:
        """How the user gets each permission on an object, per source. A
        muting set is never a grant source; what it removes is reported on
        the group's path instead."""
        user = await self._user(org_id, user_sf_id)
        sources = await self._sources(org_id, user)
        perms = await self._object_perms(
            org_id, {c.ps_id for s in sources for c in s.components}, object_name=object_name
        )

        paths = []
        evaluated = []
        for source in sources:
            ev = _evaluate(source, perms, OBJECT_FLAGS)
            evaluated.append(ev)
            granted = ev.granted.get(object_name, {})
            muted = ev.muted.get(object_name, {})
            permissions = [FLAG_LABELS[f] for f in OBJECT_FLAGS if granted.get(f)]
            if not permissions and not muted:
                continue
            muted_list = [{"permission": FLAG_LABELS[f], "muted_by": name} for f, name in muted.items()]
            paths.append({
                "source_type": source.kind,
                "source_name": source.label,
                "permissions": permissions,
                "granted_via": ev.granting_components.get(object_name, []),
                "muted": muted_list,
                "steps": self._build_path_steps(user.name, source, ev.granting_components.get(object_name, []),
                                                object_name, permissions, muted_list),
            })

        final_access, _ = self._combine(evaluated, OBJECT_FLAGS)
        return {
            "user_id": user_sf_id,
            "user_name": user.name,
            "object": object_name,
            "access": final_access.get(object_name, dict.fromkeys(OBJECT_FLAGS, False)),
            "paths": paths,
        }

    @staticmethod
    def _build_path_steps(user_name: str, source: _Source, granted_via: List[str], object_name: str,
                          permissions: List[str], muted: List[Dict[str, str]]) -> List[str]:
        steps = [f"User: {user_name}"]
        if source.kind == "profile":
            steps.append(f"Profile: {source.name}")
        elif source.kind == "permission_set_group":
            steps.append(f"PermissionSetGroup: {source.name}")
            if granted_via == [source.name]:
                steps.append("Group access as calculated by Salesforce, after any muting")
            elif granted_via:
                steps.append(f"PermissionSet: {', '.join(granted_via)}")
        else:
            steps.append(f"PermissionSet: {source.name}")
        steps.append(f"ObjectPermission: {object_name} ({', '.join(permissions) or 'none after muting'})")
        for m in muted:
            steps.append(f"Muted: {m['permission']} by muting permission set {m['muted_by']}")
        return steps
