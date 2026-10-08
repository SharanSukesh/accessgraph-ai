"""Resolve permission parents (ObjectPermissions/FieldPermissions ParentId)
to something a person recognises.

Salesforce stores a profile's object and field permissions on a hidden
permission set owned by that profile, whose Name is "X" + the profile id
and whose Label is the bare profile id. Without this mapping the UI shows
"00e1a000000MWaDAAW" where it should show "System Administrator (Profile)".
Field permissions read from Profile metadata carry the profile id itself
as their parent, so both shapes are handled.
"""
from dataclasses import dataclass
from typing import Dict, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PermissionSetSnapshot, ProfileSnapshot

KIND_PROFILE = "profile"
KIND_PERMISSION_SET = "permission_set"
KIND_PERMISSION_SET_GROUP = "permission_set_group"


@dataclass(frozen=True)
class GrantSource:
    kind: str
    id: str  # profile id for profiles, permission set id otherwise
    name: str  # API / developer name
    label: str  # what a person should read

    @property
    def display(self) -> str:
        return f"{self.label} (Profile)" if self.kind == KIND_PROFILE else self.label


async def resolve_grant_sources(
    db: AsyncSession, org_id: str, parent_ids: Optional[Iterable[str]] = None
) -> Dict[str, GrantSource]:
    """Map each parent id (permission set id or profile id) to its GrantSource."""
    ids = set(parent_ids) if parent_ids is not None else None

    ps_query = select(PermissionSetSnapshot).where(PermissionSetSnapshot.organization_id == org_id)
    if ids is not None:
        ps_query = ps_query.where(PermissionSetSnapshot.salesforce_id.in_(ids))
    permission_sets = (await db.execute(ps_query)).scalars().all()

    profiles = {
        p.salesforce_id: p
        for p in (
            await db.execute(select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id))
        ).scalars().all()
    }

    out: Dict[str, GrantSource] = {}
    for ps in permission_sets:
        if ps.is_owned_by_profile and ps.profile_id:
            profile = profiles.get(ps.profile_id)
            out[ps.salesforce_id] = GrantSource(
                kind=KIND_PROFILE,
                id=ps.profile_id,
                name=profile.name if profile else ps.profile_id,
                label=profile.name if profile else ps.profile_id,
            )
        else:
            out[ps.salesforce_id] = GrantSource(
                kind=KIND_PERMISSION_SET_GROUP if (ps.ps_type or "") == "Group" else KIND_PERMISSION_SET,
                id=ps.salesforce_id,
                name=ps.name,
                label=ps.label or ps.name,
            )
    for profile_id, profile in profiles.items():
        if ids is None or profile_id in ids:
            out.setdefault(
                profile_id,
                GrantSource(kind=KIND_PROFILE, id=profile_id, name=profile.name, label=profile.name),
            )
    return out
