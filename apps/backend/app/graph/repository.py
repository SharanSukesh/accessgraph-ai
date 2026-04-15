"""
Neo4j Graph Repository
Handles graph operations and queries
"""
import logging
from typing import Any, Dict, List, Optional

from app.db.neo4j_client import Neo4jClient
from app.graph.schema import NodeLabel, RelType

logger = logging.getLogger(__name__)


class GraphRepository:
    """
    Neo4j repository for graph operations
    """

    def __init__(self, neo4j_client: Neo4jClient):
        self.client = neo4j_client

    async def create_indexes(self, org_id: str):
        """Create necessary indexes"""
        indexes = [
            f"CREATE INDEX IF NOT EXISTS FOR (u:{NodeLabel.USER}) ON (u.org_id, u.sf_id)",
            f"CREATE INDEX IF NOT EXISTS FOR (r:{NodeLabel.ROLE}) ON (r.org_id, r.sf_id)",
            f"CREATE INDEX IF NOT EXISTS FOR (p:{NodeLabel.PROFILE}) ON (p.org_id, p.sf_id)",
            f"CREATE INDEX IF NOT EXISTS FOR (ps:{NodeLabel.PERMISSION_SET}) ON (ps.org_id, ps.sf_id)",
            f"CREATE INDEX IF NOT EXISTS FOR (psg:{NodeLabel.PERMISSION_SET_GROUP}) ON (psg.org_id, psg.sf_id)",
            f"CREATE INDEX IF NOT EXISTS FOR (o:{NodeLabel.OBJECT}) ON (o.org_id, o.name)",
            f"CREATE INDEX IF NOT EXISTS FOR (f:{NodeLabel.FIELD}) ON (f.org_id, f.api_name)",
        ]

        for index_query in indexes:
            await self.client.execute_query(index_query)

        logger.info("Graph indexes created")

    async def clear_org_graph(self, org_id: str):
        """Delete all nodes for an org"""
        query = """
        MATCH (n)
        WHERE n.org_id = $org_id
        DETACH DELETE n
        """
        await self.client.execute_query(query, {"org_id": org_id})
        logger.info(f"Cleared graph for org: {org_id}")

    async def upsert_user_nodes(self, org_id: str, users: List[Dict[str, Any]]):
        """Batch upsert user nodes"""
        query = f"""
        UNWIND $users AS user
        MERGE (u:{NodeLabel.USER} {{org_id: $org_id, sf_id: user.sf_id}})
        ON CREATE SET
            u.name = user.name,
            u.username = user.username,
            u.email = user.email,
            u.is_active = user.is_active,
            u.department = user.department,
            u.title = user.title
        ON MATCH SET
            u.name = user.name,
            u.username = user.username,
            u.email = user.email,
            u.is_active = user.is_active,
            u.department = user.department,
            u.title = user.title
        """
        await self.client.execute_write(query, {"org_id": org_id, "users": users})
        logger.info(f"Upserted {len(users)} user nodes")

    async def upsert_role_nodes(self, org_id: str, roles: List[Dict[str, Any]]):
        """Batch upsert role nodes"""
        query = f"""
        UNWIND $roles AS role
        MERGE (r:{NodeLabel.ROLE} {{org_id: $org_id, sf_id: role.sf_id}})
        ON CREATE SET r.name = role.name
        ON MATCH SET r.name = role.name
        """
        await self.client.execute_write(query, {"org_id": org_id, "roles": roles})
        logger.info(f"Upserted {len(roles)} role nodes")

    async def upsert_profile_nodes(self, org_id: str, profiles: List[Dict[str, Any]]):
        """Batch upsert profile nodes"""
        query = f"""
        UNWIND $profiles AS profile
        MERGE (p:{NodeLabel.PROFILE} {{org_id: $org_id, sf_id: profile.sf_id}})
        ON CREATE SET p.name = profile.name
        ON MATCH SET p.name = profile.name
        """
        await self.client.execute_write(query, {"org_id": org_id, "profiles": profiles})
        logger.info(f"Upserted {len(profiles)} profile nodes")

    async def upsert_permission_set_nodes(self, org_id: str, permission_sets: List[Dict[str, Any]]):
        """Batch upsert permission set nodes"""
        query = f"""
        UNWIND $permission_sets AS ps
        MERGE (p:{NodeLabel.PERMISSION_SET} {{org_id: $org_id, sf_id: ps.sf_id}})
        ON CREATE SET
            p.name = ps.name,
            p.label = ps.label,
            p.is_owned_by_profile = ps.is_owned_by_profile
        ON MATCH SET
            p.name = ps.name,
            p.label = ps.label,
            p.is_owned_by_profile = ps.is_owned_by_profile
        """
        await self.client.execute_write(query, {"org_id": org_id, "permission_sets": permission_sets})
        logger.info(f"Upserted {len(permission_sets)} permission set nodes")

    async def upsert_permission_set_group_nodes(self, org_id: str, groups: List[Dict[str, Any]]):
        """Batch upsert PSG nodes"""
        query = f"""
        UNWIND $groups AS psg
        MERGE (p:{NodeLabel.PERMISSION_SET_GROUP} {{org_id: $org_id, sf_id: psg.sf_id}})
        ON CREATE SET
            p.name = psg.name,
            p.label = psg.label
        ON MATCH SET
            p.name = psg.name,
            p.label = psg.label
        """
        await self.client.execute_write(query, {"org_id": org_id, "groups": groups})
        logger.info(f"Upserted {len(groups)} PSG nodes")

    async def upsert_object_nodes(self, org_id: str, objects: List[str]):
        """Batch upsert object nodes"""
        object_data = [{"name": obj} for obj in objects]
        query = f"""
        UNWIND $objects AS obj
        MERGE (o:{NodeLabel.OBJECT} {{org_id: $org_id, name: obj.name}})
        """
        await self.client.execute_write(query, {"org_id": org_id, "objects": object_data})
        logger.info(f"Upserted {len(objects)} object nodes")

    async def upsert_field_nodes(self, org_id: str, fields: List[str]):
        """Batch upsert field nodes"""
        field_data = [{"api_name": field} for field in fields]
        query = f"""
        UNWIND $fields AS field
        MERGE (f:{NodeLabel.FIELD} {{org_id: $org_id, api_name: field.api_name}})
        """
        await self.client.execute_write(query, {"org_id": org_id, "fields": field_data})
        logger.info(f"Upserted {len(fields)} field nodes")

    async def create_user_role_relationships(self, org_id: str, assignments: List[Dict[str, str]]):
        """Create HAS_ROLE relationships"""
        query = f"""
        UNWIND $assignments AS assign
        MATCH (u:{NodeLabel.USER} {{org_id: $org_id, sf_id: assign.user_id}})
        MATCH (r:{NodeLabel.ROLE} {{org_id: $org_id, sf_id: assign.role_id}})
        MERGE (u)-[:{RelType.HAS_ROLE}]->(r)
        """
        await self.client.execute_write(query, {"org_id": org_id, "assignments": assignments})
        logger.info(f"Created {len(assignments)} user-role relationships")

    async def create_user_profile_relationships(self, org_id: str, assignments: List[Dict[str, str]]):
        """Create HAS_PROFILE relationships"""
        query = f"""
        UNWIND $assignments AS assign
        MATCH (u:{NodeLabel.USER} {{org_id: $org_id, sf_id: assign.user_id}})
        MATCH (p:{NodeLabel.PROFILE} {{org_id: $org_id, sf_id: assign.profile_id}})
        MERGE (u)-[:{RelType.HAS_PROFILE}]->(p)
        """
        await self.client.execute_write(query, {"org_id": org_id, "assignments": assignments})
        logger.info(f"Created {len(assignments)} user-profile relationships")

    async def create_permission_set_assignments(self, org_id: str, assignments: List[Dict[str, str]]):
        """Create ASSIGNED_PERMISSION_SET relationships"""
        query = f"""
        UNWIND $assignments AS assign
        MATCH (u:{NodeLabel.USER} {{org_id: $org_id, sf_id: assign.user_id}})
        MATCH (ps) WHERE ps.org_id = $org_id AND ps.sf_id = assign.ps_id
            AND (ps:{NodeLabel.PERMISSION_SET} OR ps:{NodeLabel.PERMISSION_SET_GROUP})
        MERGE (u)-[:{RelType.ASSIGNED_PERMISSION_SET}]->(ps)
        """
        await self.client.execute_write(query, {"org_id": org_id, "assignments": assignments})
        logger.info(f"Created {len(assignments)} permission set assignment relationships")

    async def create_psg_components(self, org_id: str, components: List[Dict[str, str]]):
        """Create GROUP_CONTAINS relationships"""
        query = f"""
        UNWIND $components AS comp
        MATCH (psg:{NodeLabel.PERMISSION_SET_GROUP} {{org_id: $org_id, sf_id: comp.psg_id}})
        MATCH (ps:{NodeLabel.PERMISSION_SET} {{org_id: $org_id, sf_id: comp.ps_id}})
        MERGE (psg)-[:{RelType.GROUP_CONTAINS}]->(ps)
        """
        await self.client.execute_write(query, {"org_id": org_id, "components": components})
        logger.info(f"Created {len(components)} PSG component relationships")

    async def create_object_permissions(self, org_id: str, permissions: List[Dict[str, Any]]):
        """Create object permission relationships"""
        query = f"""
        UNWIND $permissions AS perm
        MATCH (ps:{NodeLabel.PERMISSION_SET} {{org_id: $org_id, sf_id: perm.ps_id}})
        MERGE (o:{NodeLabel.OBJECT} {{org_id: $org_id, name: perm.object}})
        WITH ps, o, perm
        FOREACH (ignoreMe IN CASE WHEN perm.can_read THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_READ}]->(o))
        FOREACH (ignoreMe IN CASE WHEN perm.can_create THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_CREATE}]->(o))
        FOREACH (ignoreMe IN CASE WHEN perm.can_edit THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_EDIT}]->(o))
        FOREACH (ignoreMe IN CASE WHEN perm.can_delete THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_DELETE}]->(o))
        """
        await self.client.execute_write(query, {"org_id": org_id, "permissions": permissions})
        logger.info(f"Created object permissions")

    async def create_field_permissions(self, org_id: str, permissions: List[Dict[str, Any]]):
        """Create field permission relationships"""
        query = f"""
        UNWIND $permissions AS perm
        MATCH (ps:{NodeLabel.PERMISSION_SET} {{org_id: $org_id, sf_id: perm.ps_id}})
        MERGE (f:{NodeLabel.FIELD} {{org_id: $org_id, api_name: perm.field}})
        WITH ps, f, perm
        FOREACH (ignoreMe IN CASE WHEN perm.can_read THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_READ_FIELD}]->(f))
        FOREACH (ignoreMe IN CASE WHEN perm.can_edit THEN [1] ELSE [] END |
            MERGE (ps)-[:{RelType.CAN_EDIT_FIELD}]->(f))
        """
        await self.client.execute_write(query, {"org_id": org_id, "permissions": permissions})
        logger.info(f"Created field permissions")

    async def get_user_access_paths(self, org_id: str, user_sf_id: str, object_name: str) -> List[Dict]:
        """
        Get all access paths from user to object

        Returns paths showing how user gets access
        """
        query = """
        MATCH path = (u:User {org_id: $org_id, sf_id: $user_id})-[*1..4]->(o:Object {org_id: $org_id, name: $object})
        WHERE ANY(r IN relationships(path) WHERE type(r) IN ['CAN_READ', 'CAN_CREATE', 'CAN_EDIT', 'CAN_DELETE'])
        RETURN path
        LIMIT 10
        """
        results = await self.client.execute_query(
            query,
            {"org_id": org_id, "user_id": user_sf_id, "object": object_name}
        )
        return results

    async def get_user_graph(self, org_id: str, user_sf_id: str, depth: int = 2) -> Dict:
        """
        Get subgraph centered on user

        Returns nodes and edges for visualization
        """
        query = """
        MATCH (u:User {org_id: $org_id, sf_id: $user_id})
        CALL apoc.path.subgraphAll(u, {maxLevel: $depth})
        YIELD nodes, relationships
        RETURN nodes, relationships
        """
        # Simplified version without APOC
        query = f"""
        MATCH (u:{NodeLabel.USER} {{org_id: $org_id, sf_id: $user_id}})
        OPTIONAL MATCH path = (u)-[*1..{depth}]-(connected)
        WITH u, collect(DISTINCT connected) as connected_nodes, collect(DISTINCT relationships(path)) as rels
        RETURN u, connected_nodes, rels
        """
        results = await self.client.execute_query(
            query,
            {"org_id": org_id, "user_id": user_sf_id, "depth": depth}
        )
        return results
