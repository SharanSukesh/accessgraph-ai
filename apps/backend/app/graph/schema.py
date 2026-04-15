"""
Neo4j Graph Schema
Defines node labels and relationship types
"""
from enum import Enum


class NodeLabel(str, Enum):
    """Neo4j node labels"""
    USER = "User"
    ROLE = "Role"
    PROFILE = "Profile"
    PERMISSION_SET = "PermissionSet"
    PERMISSION_SET_GROUP = "PermissionSetGroup"
    OBJECT = "Object"
    FIELD = "Field"


class RelType(str, Enum):
    """Neo4j relationship types"""
    HAS_ROLE = "HAS_ROLE"
    HAS_PROFILE = "HAS_PROFILE"
    ASSIGNED_PERMISSION_SET = "ASSIGNED_PERMISSION_SET"
    MEMBER_OF_GROUP = "MEMBER_OF_GROUP"
    GROUP_CONTAINS = "GROUP_CONTAINS"
    GRANTS_OBJECT_PERMISSION = "GRANTS_OBJECT_PERMISSION"
    GRANTS_FIELD_PERMISSION = "GRANTS_FIELD_PERMISSION"
    CAN_READ = "CAN_READ"
    CAN_CREATE = "CAN_CREATE"
    CAN_EDIT = "CAN_EDIT"
    CAN_DELETE = "CAN_DELETE"
    CAN_READ_FIELD = "CAN_READ_FIELD"
    CAN_EDIT_FIELD = "CAN_EDIT_FIELD"
    ROLE_PARENT = "ROLE_PARENT"
