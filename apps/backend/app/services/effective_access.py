"""
Effective Access Service
Computes effective access by aggregating all grant sources
"""
import logging
from collections import defaultdict
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


class EffectiveAccessService:
    """
    Compute effective access for users
    Aggregates: Profile PS + Direct PS + PSG (via components)
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_object_access(self, org_id: str, user_sf_id: str) -> Dict:
        """
        Get effective object access for user

        Returns:
            Dict with objects and their permissions
        """
        # Get user
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == user_sf_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found: {user_sf_id}")

        # Get all permission sets for user
        ps_ids = await self._get_user_permission_sets(org_id, user_sf_id, user.profile_id)

        # Get object permissions from those permission sets
        result = await self.db.execute(
            select(ObjectPermissionSnapshot).where(
                ObjectPermissionSnapshot.organization_id == org_id,
                ObjectPermissionSnapshot.parent_id.in_(ps_ids),
            )
        )
        obj_perms = result.scalars().all()

        # Aggregate permissions by object
        access = defaultdict(lambda: {"read": False, "create": False, "edit": False, "delete": False})
        grants_by_object = defaultdict(list)

        for perm in obj_perms:
            obj_name = perm.sobject_type
            access[obj_name]["read"] = access[obj_name]["read"] or perm.permissions_read
            access[obj_name]["create"] = access[obj_name]["create"] or perm.permissions_create
            access[obj_name]["edit"] = access[obj_name]["edit"] or perm.permissions_edit
            access[obj_name]["delete"] = access[obj_name]["delete"] or perm.permissions_delete

            grants_by_object[obj_name].append({
                "permission_set_id": perm.parent_id,
                "read": perm.permissions_read,
                "create": perm.permissions_create,
                "edit": perm.permissions_edit,
                "delete": perm.permissions_delete,
            })

        # Format response for frontend
        objects_list = []
        for obj_name, perms in access.items():
            objects_list.append({
                "objectName": obj_name,
                "objectLabel": obj_name,  # We don't have label metadata, use name
                "permissions": {
                    "canRead": perms["read"],
                    "canCreate": perms["create"],
                    "canEdit": perms["edit"],
                    "canDelete": perms["delete"],
                },
                "isSensitive": False,  # Would need metadata to determine
                "grantedByCount": len(grants_by_object[obj_name]),
            })

        return objects_list

    async def get_user_field_access(self, org_id: str, user_sf_id: str) -> Dict:
        """Get effective field access for user"""
        # Get user
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == user_sf_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found: {user_sf_id}")

        # Get all permission sets
        ps_ids = await self._get_user_permission_sets(org_id, user_sf_id, user.profile_id)

        # Get field permissions
        result = await self.db.execute(
            select(FieldPermissionSnapshot).where(
                FieldPermissionSnapshot.organization_id == org_id,
                FieldPermissionSnapshot.parent_id.in_(ps_ids),
            )
        )
        field_perms = result.scalars().all()

        # Aggregate by field
        access = defaultdict(lambda: {"read": False, "edit": False})
        grants_by_field = defaultdict(list)

        for perm in field_perms:
            field_name = perm.field
            access[field_name]["read"] = access[field_name]["read"] or perm.permissions_read
            access[field_name]["edit"] = access[field_name]["edit"] or perm.permissions_edit

            grants_by_field[field_name].append({
                "permission_set_id": perm.parent_id,
                "read": perm.permissions_read,
                "edit": perm.permissions_edit,
            })

        # Format response for frontend
        fields_list = []
        for field_name, perms in access.items():
            # Parse object and field from field name (format: Object.Field)
            if '.' in field_name:
                object_name, field_api_name = field_name.split('.', 1)
            else:
                object_name = "Unknown"
                field_api_name = field_name

            fields_list.append({
                "objectName": object_name,
                "fieldName": field_api_name,
                "fieldLabel": field_api_name,  # We don't have label metadata
                "canRead": perms["read"],
                "canEdit": perms["edit"],
                "isSensitive": False,  # Would need metadata to determine
                "grantedByCount": len(grants_by_field[field_name]),
            })

        return fields_list

    async def explain_user_object_access(
        self, org_id: str, user_sf_id: str, object_name: str
    ) -> Dict:
        """
        Explain how user gets access to an object

        Returns explanation with grant paths
        """
        # Get user
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == user_sf_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found: {user_sf_id}")

        # Get PS details with sources
        ps_details = await self._get_user_permission_sets_with_source(org_id, user_sf_id, user.profile_id)

        # Get object permissions
        ps_ids = [ps["ps_id"] for ps in ps_details]
        result = await self.db.execute(
            select(ObjectPermissionSnapshot).where(
                ObjectPermissionSnapshot.organization_id == org_id,
                ObjectPermissionSnapshot.parent_id.in_(ps_ids),
                ObjectPermissionSnapshot.sobject_type == object_name,
            )
        )
        obj_perms = result.scalars().all()

        # Build explanation paths
        paths = []
        for perm in obj_perms:
            # Find source
            source_info = next((ps for ps in ps_details if ps["ps_id"] == perm.parent_id), None)
            if not source_info:
                continue

            granted_permissions = []
            if perm.permissions_read:
                granted_permissions.append("Read")
            if perm.permissions_create:
                granted_permissions.append("Create")
            if perm.permissions_edit:
                granted_permissions.append("Edit")
            if perm.permissions_delete:
                granted_permissions.append("Delete")

            path = {
                "source_type": source_info["source_type"],
                "source_name": source_info["source_name"],
                "permissions": granted_permissions,
                "steps": self._build_path_steps(user.name, source_info, object_name, granted_permissions),
            }
            paths.append(path)

        # Aggregate final access
        final_access = {"read": False, "create": False, "edit": False, "delete": False}
        for perm in obj_perms:
            final_access["read"] = final_access["read"] or perm.permissions_read
            final_access["create"] = final_access["create"] or perm.permissions_create
            final_access["edit"] = final_access["edit"] or perm.permissions_edit
            final_access["delete"] = final_access["delete"] or perm.permissions_delete

        return {
            "user_id": user_sf_id,
            "user_name": user.name,
            "object": object_name,
            "access": final_access,
            "paths": paths,
        }

    async def _get_user_permission_sets(
        self, org_id: str, user_sf_id: str, profile_id: Optional[str]
    ) -> List[str]:
        """Get all permission set IDs for user (profile + direct + PSG)"""
        ps_ids = []

        # Profile-backed permission set
        if profile_id:
            result = await self.db.execute(
                select(PermissionSetSnapshot.salesforce_id).where(
                    PermissionSetSnapshot.organization_id == org_id,
                    PermissionSetSnapshot.profile_id == profile_id,
                    PermissionSetSnapshot.is_owned_by_profile == True,
                )
            )
            profile_ps = result.scalar_one_or_none()
            if profile_ps:
                ps_ids.append(profile_ps)

        # Direct assignments
        result = await self.db.execute(
            select(PermissionSetAssignmentSnapshot.permission_set_id).where(
                PermissionSetAssignmentSnapshot.organization_id == org_id,
                PermissionSetAssignmentSnapshot.assignee_id == user_sf_id,
            )
        )
        assigned_ps_ids = result.scalars().all()
        ps_ids.extend(assigned_ps_ids)

        # Expand PSGs to their component permission sets
        psg_ids = []
        for ps_id in assigned_ps_ids:
            # Check if it's a PSG
            result = await self.db.execute(
                select(PermissionSetGroupSnapshot.salesforce_id).where(
                    PermissionSetGroupSnapshot.organization_id == org_id,
                    PermissionSetGroupSnapshot.salesforce_id == ps_id,
                )
            )
            if result.scalar_one_or_none():
                psg_ids.append(ps_id)

        # Get PSG components
        if psg_ids:
            result = await self.db.execute(
                select(PermissionSetGroupComponentSnapshot.permission_set_id).where(
                    PermissionSetGroupComponentSnapshot.organization_id == org_id,
                    PermissionSetGroupComponentSnapshot.permission_set_group_id.in_(psg_ids),
                )
            )
            component_ps_ids = result.scalars().all()
            ps_ids.extend(component_ps_ids)

        return list(set(ps_ids))  # Deduplicate

    async def _get_user_permission_sets_with_source(
        self, org_id: str, user_sf_id: str, profile_id: Optional[str]
    ) -> List[Dict]:
        """Get permission sets with source information"""
        ps_details = []

        # Profile PS
        if profile_id:
            result = await self.db.execute(
                select(PermissionSetSnapshot).where(
                    PermissionSetSnapshot.organization_id == org_id,
                    PermissionSetSnapshot.profile_id == profile_id,
                    PermissionSetSnapshot.is_owned_by_profile == True,
                )
            )
            profile_ps = result.scalar_one_or_none()
            if profile_ps:
                ps_details.append({
                    "ps_id": profile_ps.salesforce_id,
                    "ps_name": profile_ps.name,
                    "source_type": "profile",
                    "source_name": f"Profile: {profile_id}",
                })

        # Direct assignments
        result = await self.db.execute(
            select(
                PermissionSetAssignmentSnapshot.permission_set_id,
                PermissionSetSnapshot.name,
            )
            .join(
                PermissionSetSnapshot,
                PermissionSetSnapshot.salesforce_id == PermissionSetAssignmentSnapshot.permission_set_id,
            )
            .where(
                PermissionSetAssignmentSnapshot.organization_id == org_id,
                PermissionSetAssignmentSnapshot.assignee_id == user_sf_id,
            )
        )
        assignments = result.all()

        for ps_id, ps_name in assignments:
            # Check if PSG
            result_psg = await self.db.execute(
                select(PermissionSetGroupSnapshot).where(
                    PermissionSetGroupSnapshot.organization_id == org_id,
                    PermissionSetGroupSnapshot.salesforce_id == ps_id,
                )
            )
            psg = result_psg.scalar_one_or_none()

            if psg:
                # It's a PSG - get components
                result_comp = await self.db.execute(
                    select(
                        PermissionSetGroupComponentSnapshot.permission_set_id,
                        PermissionSetSnapshot.name,
                    )
                    .join(
                        PermissionSetSnapshot,
                        PermissionSetSnapshot.salesforce_id == PermissionSetGroupComponentSnapshot.permission_set_id,
                    )
                    .where(
                        PermissionSetGroupComponentSnapshot.organization_id == org_id,
                        PermissionSetGroupComponentSnapshot.permission_set_group_id == ps_id,
                    )
                )
                components = result_comp.all()

                for comp_ps_id, comp_ps_name in components:
                    ps_details.append({
                        "ps_id": comp_ps_id,
                        "ps_name": comp_ps_name,
                        "source_type": "permission_set_group",
                        "source_name": f"PSG: {psg.master_label}",
                        "psg_id": ps_id,
                    })
            else:
                # Direct permission set
                ps_details.append({
                    "ps_id": ps_id,
                    "ps_name": ps_name,
                    "source_type": "permission_set",
                    "source_name": f"PermissionSet: {ps_name}",
                })

        return ps_details

    def _build_path_steps(self, user_name: str, source_info: Dict, object_name: str, permissions: List[str]) -> List[str]:
        """Build human-readable path steps"""
        steps = [f"User: {user_name}"]

        if source_info["source_type"] == "profile":
            steps.append(f"Profile: {source_info['source_name']}")
        elif source_info["source_type"] == "permission_set_group":
            steps.append(f"PermissionSetGroup: {source_info['source_name']}")
            steps.append(f"PermissionSet: {source_info['ps_name']}")
        elif source_info["source_type"] == "permission_set":
            steps.append(f"PermissionSet: {source_info['ps_name']}")

        perm_str = ", ".join(permissions)
        steps.append(f"ObjectPermission: {object_name} ({perm_str})")

        return steps
