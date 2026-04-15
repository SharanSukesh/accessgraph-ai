"""
Graph Builder
Builds Neo4j graph from PostgreSQL snapshots
"""
import logging
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.neo4j_client import Neo4jClient
from app.domain.models import (
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    RoleSnapshot,
    UserSnapshot,
)
from app.graph.repository import GraphRepository

logger = logging.getLogger(__name__)


class GraphBuilder:
    """
    Builds graph from snapshot data
    """

    def __init__(self, db: AsyncSession, neo4j_client: Neo4jClient):
        self.db = db
        self.repo = GraphRepository(neo4j_client)

    async def build_org_graph(self, org_id: str, rebuild: bool = False):
        """
        Build complete graph for organization

        Args:
            org_id: Organization ID
            rebuild: If True, clear and rebuild. Otherwise incremental.
        """
        logger.info(f"Building graph for org: {org_id} (rebuild={rebuild})")

        if rebuild:
            await self.repo.clear_org_graph(org_id)

        # Create indexes
        await self.repo.create_indexes(org_id)

        # Load and upsert nodes
        await self._upsert_user_nodes(org_id)
        await self._upsert_role_nodes(org_id)
        await self._upsert_profile_nodes(org_id)
        await self._upsert_permission_set_nodes(org_id)
        await self._upsert_psg_nodes(org_id)

        # Create relationships
        await self._create_user_role_relationships(org_id)
        await self._create_user_profile_relationships(org_id)
        await self._create_permission_set_assignments(org_id)
        await self._create_psg_components(org_id)
        await self._create_object_permissions(org_id)
        await self._create_field_permissions(org_id)

        logger.info("Graph build complete")

    async def _upsert_user_nodes(self, org_id: str):
        """Load users from DB and upsert to graph"""
        result = await self.db.execute(
            select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
        )
        users = result.scalars().all()

        user_data = [
            {
                "sf_id": u.salesforce_id,
                "name": u.name,
                "username": u.username,
                "email": u.email,
                "is_active": u.is_active,
                "department": u.department,
                "title": u.title,
            }
            for u in users
        ]

        await self.repo.upsert_user_nodes(org_id, user_data)

    async def _upsert_role_nodes(self, org_id: str):
        """Load roles and upsert"""
        result = await self.db.execute(
            select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id)
        )
        roles = result.scalars().all()

        role_data = [{"sf_id": r.salesforce_id, "name": r.name} for r in roles]

        await self.repo.upsert_role_nodes(org_id, role_data)

    async def _upsert_profile_nodes(self, org_id: str):
        """Load profiles and upsert"""
        result = await self.db.execute(
            select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id)
        )
        profiles = result.scalars().all()

        profile_data = [{"sf_id": p.salesforce_id, "name": p.name} for p in profiles]

        await self.repo.upsert_profile_nodes(org_id, profile_data)

    async def _upsert_permission_set_nodes(self, org_id: str):
        """Load permission sets and upsert"""
        result = await self.db.execute(
            select(PermissionSetSnapshot).where(PermissionSetSnapshot.organization_id == org_id)
        )
        psets = result.scalars().all()

        ps_data = [
            {
                "sf_id": ps.salesforce_id,
                "name": ps.name,
                "label": ps.label,
                "is_owned_by_profile": ps.is_owned_by_profile,
            }
            for ps in psets
        ]

        await self.repo.upsert_permission_set_nodes(org_id, ps_data)

    async def _upsert_psg_nodes(self, org_id: str):
        """Load PSGs and upsert"""
        result = await self.db.execute(
            select(PermissionSetGroupSnapshot).where(
                PermissionSetGroupSnapshot.organization_id == org_id
            )
        )
        psgs = result.scalars().all()

        psg_data = [
            {"sf_id": psg.salesforce_id, "name": psg.developer_name, "label": psg.master_label}
            for psg in psgs
        ]

        await self.repo.upsert_permission_set_group_nodes(org_id, psg_data)

    async def _create_user_role_relationships(self, org_id: str):
        """Create user->role relationships"""
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.user_role_id.isnot(None)
            )
        )
        users = result.scalars().all()

        assignments = [
            {"user_id": u.salesforce_id, "role_id": u.user_role_id}
            for u in users if u.user_role_id
        ]

        if assignments:
            await self.repo.create_user_role_relationships(org_id, assignments)

    async def _create_user_profile_relationships(self, org_id: str):
        """Create user->profile relationships"""
        result = await self.db.execute(
            select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
        )
        users = result.scalars().all()

        assignments = [
            {"user_id": u.salesforce_id, "profile_id": u.profile_id}
            for u in users if u.profile_id
        ]

        if assignments:
            await self.repo.create_user_profile_relationships(org_id, assignments)

    async def _create_permission_set_assignments(self, org_id: str):
        """Create user->PS/PSG relationships"""
        result = await self.db.execute(
            select(PermissionSetAssignmentSnapshot).where(
                PermissionSetAssignmentSnapshot.organization_id == org_id
            )
        )
        assignments_db = result.scalars().all()

        assignments = [
            {"user_id": a.assignee_id, "ps_id": a.permission_set_id}
            for a in assignments_db
        ]

        if assignments:
            await self.repo.create_permission_set_assignments(org_id, assignments)

    async def _create_psg_components(self, org_id: str):
        """Create PSG->PS relationships"""
        result = await self.db.execute(
            select(PermissionSetGroupComponentSnapshot).where(
                PermissionSetGroupComponentSnapshot.organization_id == org_id
            )
        )
        components_db = result.scalars().all()

        components = [
            {"psg_id": c.permission_set_group_id, "ps_id": c.permission_set_id}
            for c in components_db
        ]

        if components:
            await self.repo.create_psg_components(org_id, components)

    async def _create_object_permissions(self, org_id: str):
        """Create PS->Object relationships"""
        result = await self.db.execute(
            select(ObjectPermissionSnapshot).where(
                ObjectPermissionSnapshot.organization_id == org_id
            )
        )
        perms_db = result.scalars().all()

        permissions = [
            {
                "ps_id": p.parent_id,
                "object": p.sobject_type,
                "can_read": p.permissions_read,
                "can_create": p.permissions_create,
                "can_edit": p.permissions_edit,
                "can_delete": p.permissions_delete,
            }
            for p in perms_db
        ]

        if permissions:
            await self.repo.create_object_permissions(org_id, permissions)

    async def _create_field_permissions(self, org_id: str):
        """Create PS->Field relationships"""
        result = await self.db.execute(
            select(FieldPermissionSnapshot).where(
                FieldPermissionSnapshot.organization_id == org_id
            )
        )
        perms_db = result.scalars().all()

        permissions = [
            {
                "ps_id": p.parent_id,
                "field": p.field,
                "can_read": p.permissions_read,
                "can_edit": p.permissions_edit,
            }
            for p in perms_db
        ]

        if permissions:
            await self.repo.create_field_permissions(org_id, permissions)
