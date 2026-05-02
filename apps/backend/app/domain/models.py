"""
Domain Models for AccessGraph AI
SQLAlchemy ORM models for all entities
"""
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy_utils import EncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

from app.db.base import Base, TimestampMixin
from app.core.config import settings


def generate_uuid() -> str:
    """Generate UUID for primary keys"""
    return str(uuid4())


# ============================================================================
# Enums
# ============================================================================


class SyncStatus(str, PyEnum):
    """Sync job status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class AnomalySeverity(str, PyEnum):
    """Anomaly severity levels"""
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskLevel(str, PyEnum):
    """Risk level classifications"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecommendationType(str, PyEnum):
    """Recommendation types"""
    PERMISSION_REMOVAL = "permission_removal"
    ROLE_SIMPLIFICATION = "role_simplification"
    ACCESS_REVIEW = "access_review"
    ACCOUNT_CLEANUP = "account_cleanup"
    PSG_MIGRATION = "psg_migration"
    UNDER_PERMISSIONED = "under_permissioned"


class RecommendationStatus(str, PyEnum):
    """Recommendation status"""
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    APPLIED = "applied"
    DEFERRED = "deferred"


class AuditAction(str, PyEnum):
    """Audit log action types"""
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"

    # Data Access
    VIEW_USERS = "view_users"
    VIEW_USER_DETAILS = "view_user_details"
    VIEW_PERMISSIONS = "view_permissions"
    VIEW_ACCESS_GRAPH = "view_access_graph"
    VIEW_ANOMALIES = "view_anomalies"
    VIEW_RECOMMENDATIONS = "view_recommendations"

    # Data Modification
    SYNC_DATA = "sync_data"
    DELETE_DATA = "delete_data"
    EXPORT_DATA = "export_data"

    # Configuration
    UPDATE_SETTINGS = "update_settings"
    INVITE_USER = "invite_user"
    REMOVE_USER = "remove_user"
    UPDATE_USER_ROLE = "update_user_role"

    # Salesforce
    CONNECT_SALESFORCE = "connect_salesforce"
    DISCONNECT_SALESFORCE = "disconnect_salesforce"


class OrgUserRole(str, PyEnum):
    """Organization user roles for RBAC"""
    ORG_ADMIN = "org_admin"        # Full access - can manage users, settings, export data
    ANALYST = "analyst"             # Can view and analyze data, create recommendations
    VIEWER = "viewer"               # Read-only access to dashboard
    AUDITOR = "auditor"             # Can view audit logs and compliance data


# ============================================================================
# Core Organization Models
# ============================================================================


class Organization(Base, TimestampMixin):
    """Organization/Tenant"""
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(255))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)

    # Relationships
    salesforce_connections = relationship("SalesforceConnection", back_populates="organization", cascade="all, delete-orphan")
    sync_jobs = relationship("SyncJob", back_populates="organization", cascade="all, delete-orphan")
    users = relationship("UserSnapshot", back_populates="organization", cascade="all, delete-orphan")
    anomalies = relationship("AccessAnomaly", back_populates="organization", cascade="all, delete-orphan")
    risk_scores = relationship("RiskScore", back_populates="organization", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Organization(id={self.id}, name={self.name})>"


class SalesforceConnection(Base, TimestampMixin):
    """Salesforce org connection"""
    __tablename__ = "salesforce_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    instance_url: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_id_sf: Mapped[Optional[str]] = mapped_column(String(18))  # Salesforce org ID

    # Encrypted OAuth tokens (AES-256 encryption)
    access_token: Mapped[Optional[str]] = mapped_column(
        EncryptedType(Text, settings.DATABASE_ENCRYPTION_KEY, AesEngine, 'pkcs5')
        if settings.ENABLE_FIELD_ENCRYPTION and settings.DATABASE_ENCRYPTION_KEY
        else Text,
        nullable=True
    )
    refresh_token: Mapped[Optional[str]] = mapped_column(
        EncryptedType(Text, settings.DATABASE_ENCRYPTION_KEY, AesEngine, 'pkcs5')
        if settings.ENABLE_FIELD_ENCRYPTION and settings.DATABASE_ENCRYPTION_KEY
        else Text,
        nullable=True
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    organization = relationship("Organization", back_populates="salesforce_connections")

    __table_args__ = (
        Index("ix_sf_conn_org", "organization_id"),
    )

    def __repr__(self) -> str:
        return f"<SalesforceConnection(org={self.organization_id}, instance={self.instance_url})>"


class SyncJob(Base, TimestampMixin):
    """Sync job tracking"""
    __tablename__ = "sync_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    status: Mapped[SyncStatus] = mapped_column(
        Enum(SyncStatus, native_enum=False, length=20),
        default=SyncStatus.PENDING,
        nullable=False
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    sync_metadata: Mapped[dict] = mapped_column(JSON, default=dict)  # Counts, timing, etc.

    # Relationships
    organization = relationship("Organization", back_populates="sync_jobs")

    __table_args__ = (
        Index("ix_sync_job_org", "organization_id"),
        Index("ix_sync_job_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<SyncJob(id={self.id}, org={self.organization_id}, status={self.status})>"


# ============================================================================
# Salesforce Snapshot Models
# ============================================================================


class UserSnapshot(Base, TimestampMixin):
    """User snapshot from Salesforce"""
    __tablename__ = "users_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    # Salesforce fields
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    user_type: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # References
    profile_id: Mapped[Optional[str]] = mapped_column(String(18))
    user_role_id: Mapped[Optional[str]] = mapped_column(String(18))

    # Metadata
    department: Mapped[Optional[str]] = mapped_column(String(255))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    # Relationships
    organization = relationship("Organization", back_populates="users")

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_user_org_sf_id"),
        Index("ix_user_org", "organization_id"),
        Index("ix_user_sf_id", "salesforce_id"),
        Index("ix_user_profile", "profile_id"),
        Index("ix_user_role", "user_role_id"),
    )

    def __repr__(self) -> str:
        return f"<UserSnapshot(id={self.id}, name={self.name}, sf_id={self.salesforce_id})>"


class RoleSnapshot(Base, TimestampMixin):
    """UserRole snapshot from Salesforce"""
    __tablename__ = "roles_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_role_id: Mapped[Optional[str]] = mapped_column(String(18))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_role_org_sf_id"),
        Index("ix_role_org", "organization_id"),
    )


class ProfileSnapshot(Base, TimestampMixin):
    """Profile snapshot from Salesforce"""
    __tablename__ = "profiles_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_profile_org_sf_id"),
        Index("ix_profile_org", "organization_id"),
    )


class PermissionSetSnapshot(Base, TimestampMixin):
    """PermissionSet snapshot from Salesforce"""
    __tablename__ = "permission_sets_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_owned_by_profile: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    profile_id: Mapped[Optional[str]] = mapped_column(String(18))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_ps_org_sf_id"),
        Index("ix_ps_org", "organization_id"),
        Index("ix_ps_profile", "profile_id"),
    )


class PermissionSetAssignmentSnapshot(Base, TimestampMixin):
    """PermissionSetAssignment snapshot from Salesforce"""
    __tablename__ = "permission_set_assignments_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    assignee_id: Mapped[str] = mapped_column(String(18), nullable=False)
    permission_set_id: Mapped[str] = mapped_column(String(18), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_psa_org_sf_id"),
        Index("ix_psa_org", "organization_id"),
        Index("ix_psa_assignee", "assignee_id"),
        Index("ix_psa_ps", "permission_set_id"),
    )


class PermissionSetGroupSnapshot(Base, TimestampMixin):
    """PermissionSetGroup snapshot from Salesforce"""
    __tablename__ = "permission_set_groups_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    developer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    master_label: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_psg_org_sf_id"),
        Index("ix_psg_org", "organization_id"),
    )


class PermissionSetGroupComponentSnapshot(Base, TimestampMixin):
    """PermissionSetGroupComponent snapshot from Salesforce"""
    __tablename__ = "permission_set_group_components_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    permission_set_group_id: Mapped[str] = mapped_column(String(18), nullable=False)
    permission_set_id: Mapped[str] = mapped_column(String(18), nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_psgc_org_sf_id"),
        Index("ix_psgc_org", "organization_id"),
        Index("ix_psgc_psg", "permission_set_group_id"),
    )


class ObjectPermissionSnapshot(Base, TimestampMixin):
    """ObjectPermissions snapshot from Salesforce"""
    __tablename__ = "object_permissions_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    parent_id: Mapped[str] = mapped_column(String(18), nullable=False)  # PermissionSet ID
    sobject_type: Mapped[str] = mapped_column(String(255), nullable=False)

    # Permissions
    permissions_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_create: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_edit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_delete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_view_all_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_modify_all_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_objperm_org_sf_id"),
        Index("ix_objperm_org", "organization_id"),
        Index("ix_objperm_parent", "parent_id"),
        Index("ix_objperm_object", "sobject_type"),
    )


class FieldPermissionSnapshot(Base, TimestampMixin):
    """FieldPermissions snapshot from Salesforce"""
    __tablename__ = "field_permissions_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    sync_job_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sync_jobs.id", ondelete="SET NULL"))

    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)
    parent_id: Mapped[str] = mapped_column(String(18), nullable=False)  # PermissionSet ID
    sobject_type: Mapped[str] = mapped_column(String(255), nullable=False)
    field: Mapped[str] = mapped_column(String(255), nullable=False)

    # Permissions
    permissions_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    permissions_edit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_fldperm_org_sf_id"),
        Index("ix_fldperm_org", "organization_id"),
        Index("ix_fldperm_parent", "parent_id"),
        Index("ix_fldperm_field", "field"),
    )


# ============================================================================
# Analysis Result Models
# ============================================================================


class AccessAnomaly(Base, TimestampMixin):
    """Access anomaly detection result"""
    __tablename__ = "access_anomalies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(18), nullable=False)  # Salesforce user ID

    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[AnomalySeverity] = mapped_column(
        Enum(AnomalySeverity, native_enum=False, length=20),
        nullable=False
    )

    # Reasons and context
    reasons: Mapped[list] = mapped_column(JSON, default=list)  # List of reason strings
    features: Mapped[dict] = mapped_column(JSON, default=dict)  # Feature values
    peer_stats: Mapped[dict] = mapped_column(JSON, default=dict)  # Peer comparison data

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="anomalies")

    __table_args__ = (
        Index("ix_anomaly_org", "organization_id"),
        Index("ix_anomaly_user", "user_id"),
        Index("ix_anomaly_severity", "severity"),
        Index("ix_anomaly_score", "anomaly_score"),
    )

    def __repr__(self) -> str:
        return f"<AccessAnomaly(user={self.user_id}, score={self.anomaly_score}, severity={self.severity})>"


class RiskScore(Base, TimestampMixin):
    """Risk score result"""
    __tablename__ = "risk_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # user, permission_set, psg
    entity_id: Mapped[str] = mapped_column(String(18), nullable=False)  # Salesforce ID

    risk_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0-100
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel, native_enum=False, length=20),
        nullable=False
    )

    # Explanation
    factors: Mapped[list] = mapped_column(JSON, default=list)  # Risk factor breakdown
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)

    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="risk_scores")

    __table_args__ = (
        Index("ix_risk_org", "organization_id"),
        Index("ix_risk_entity", "entity_type", "entity_id"),
        Index("ix_risk_level", "risk_level"),
        Index("ix_risk_score", "risk_score"),
    )

    def __repr__(self) -> str:
        return f"<RiskScore(entity={self.entity_type}:{self.entity_id}, score={self.risk_score}, level={self.risk_level})>"


class Recommendation(Base, TimestampMixin):
    """Access recommendation"""
    __tablename__ = "recommendations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    rec_type: Mapped[RecommendationType] = mapped_column(
        Enum(RecommendationType, native_enum=False, length=50),
        nullable=False
    )
    status: Mapped[RecommendationStatus] = mapped_column(
        Enum(RecommendationStatus, native_enum=False, length=20),
        default=RecommendationStatus.PENDING,
        nullable=False
    )
    severity: Mapped[AnomalySeverity] = mapped_column(
        Enum(AnomalySeverity, native_enum=False, length=20),
        nullable=False
    )

    # Target
    target_entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_entity_id: Mapped[str] = mapped_column(String(18), nullable=False)

    # Content
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)

    # Impact
    impact_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    affected_access: Mapped[dict] = mapped_column(JSON, default=dict)

    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="recommendations")

    __table_args__ = (
        Index("ix_rec_org", "organization_id"),
        Index("ix_rec_target", "target_entity_type", "target_entity_id"),
        Index("ix_rec_type", "rec_type"),
        Index("ix_rec_status", "status"),
        Index("ix_rec_severity", "severity"),
    )

    def __repr__(self) -> str:
        return f"<Recommendation(type={self.rec_type}, target={self.target_entity_type}:{self.target_entity_id}, severity={self.severity})>"


# ============================================================================
# Record-Level Sharing Models
# ============================================================================


class SharingRuleSnapshot(Base, TimestampMixin):
    """Salesforce Sharing Rules - defines how records are shared"""
    __tablename__ = "sharing_rule_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)  # Sharing rule ID from Salesforce

    # Rule identification
    rule_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sobject_type: Mapped[str] = mapped_column(String(100), nullable=False)  # Account, Opportunity, etc.
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)  # CriteriaBasedSharingRule, OwnerSharingRule

    # Access configuration
    access_level: Mapped[str] = mapped_column(String(50), nullable=False)  # Read, Edit

    # Sharing criteria (for criteria-based rules)
    criteria: Mapped[Optional[dict]] = mapped_column(JSON)  # Field conditions

    # Shared to configuration
    shared_to_type: Mapped[str] = mapped_column(String(100), nullable=False)  # Role, RoleAndSubordinates, Group, etc.
    shared_to_id: Mapped[Optional[str]] = mapped_column(String(18))  # Role or Group ID

    # Metadata
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_sharing_rule_org_sf_snapshot"),
        Index("ix_sharing_rule_org", "organization_id"),
        Index("ix_sharing_rule_object", "sobject_type"),
        Index("ix_sharing_rule_type", "rule_type"),
    )

    def __repr__(self) -> str:
        return f"<SharingRuleSnapshot(name={self.rule_name}, object={self.sobject_type}, type={self.rule_type})>"


class AccountShareSnapshot(Base, TimestampMixin):
    """Account manual shares and sharing rule results"""
    __tablename__ = "account_share_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    # Share details
    account_id: Mapped[str] = mapped_column(String(18), nullable=False)  # AccountId
    user_or_group_id: Mapped[str] = mapped_column(String(18), nullable=False)  # UserOrGroupId

    # Access levels
    account_access_level: Mapped[str] = mapped_column(String(20), nullable=False)  # Read, Edit
    opportunity_access_level: Mapped[str] = mapped_column(String(20), nullable=False)  # None, Read, Edit
    case_access_level: Mapped[str] = mapped_column(String(20), nullable=False)  # None, Read, Edit

    # Share source
    row_cause: Mapped[str] = mapped_column(String(50), nullable=False)  # Manual, Rule, Team, Territory, Owner, ImplicitChild, etc.

    # Metadata
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_account_share_org_sf_snapshot"),
        Index("ix_account_share_org", "organization_id"),
        Index("ix_account_share_account", "account_id"),
        Index("ix_account_share_user", "user_or_group_id"),
        Index("ix_account_share_cause", "row_cause"),
    )

    def __repr__(self) -> str:
        return f"<AccountShareSnapshot(account={self.account_id}, user={self.user_or_group_id}, cause={self.row_cause})>"


class OpportunityShareSnapshot(Base, TimestampMixin):
    """Opportunity manual shares"""
    __tablename__ = "opportunity_share_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    opportunity_id: Mapped[str] = mapped_column(String(18), nullable=False)
    user_or_group_id: Mapped[str] = mapped_column(String(18), nullable=False)
    opportunity_access_level: Mapped[str] = mapped_column(String(20), nullable=False)
    row_cause: Mapped[str] = mapped_column(String(50), nullable=False)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_opp_share_org_sf_snapshot"),
        Index("ix_opp_share_org", "organization_id"),
        Index("ix_opp_share_opp", "opportunity_id"),
        Index("ix_opp_share_user", "user_or_group_id"),
    )


class AccountTeamMemberSnapshot(Base, TimestampMixin):
    """Account Team Members"""
    __tablename__ = "account_team_member_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    account_id: Mapped[str] = mapped_column(String(18), nullable=False)
    user_id: Mapped[str] = mapped_column(String(18), nullable=False)
    team_member_role: Mapped[Optional[str]] = mapped_column(String(100))

    # Access levels granted by team membership
    account_access_level: Mapped[Optional[str]] = mapped_column(String(20))
    opportunity_access_level: Mapped[Optional[str]] = mapped_column(String(20))
    case_access_level: Mapped[Optional[str]] = mapped_column(String(20))

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_account_team_org_sf_snapshot"),
        Index("ix_account_team_org", "organization_id"),
        Index("ix_account_team_account", "account_id"),
        Index("ix_account_team_user", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<AccountTeamMemberSnapshot(account={self.account_id}, user={self.user_id}, role={self.team_member_role})>"


class GroupSnapshot(Base, TimestampMixin):
    """Salesforce Groups and Queues"""
    __tablename__ = "group_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    developer_name: Mapped[Optional[str]] = mapped_column(String(255))
    group_type: Mapped[str] = mapped_column(String(50), nullable=False)  # Regular, Queue, Role, etc.

    # Related entity (for RoleAndSubordinates, etc.)
    related_id: Mapped[Optional[str]] = mapped_column(String(18))

    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_group_org_sf_snapshot"),
        Index("ix_group_org", "organization_id"),
        Index("ix_group_type", "group_type"),
    )

    def __repr__(self) -> str:
        return f"<GroupSnapshot(name={self.name}, type={self.group_type})>"


class GroupMemberSnapshot(Base, TimestampMixin):
    """Group membership records"""
    __tablename__ = "group_member_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    group_id: Mapped[str] = mapped_column(String(18), nullable=False)
    user_or_group_id: Mapped[str] = mapped_column(String(18), nullable=False)  # Can be User or another Group (nested)

    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_group_member_org_sf_snapshot"),
        Index("ix_group_member_org", "organization_id"),
        Index("ix_group_member_group", "group_id"),
        Index("ix_group_member_user", "user_or_group_id"),
    )

    def __repr__(self) -> str:
        return f"<GroupMemberSnapshot(group={self.group_id}, member={self.user_or_group_id})>"


class OrganizationWideDefaultSnapshot(Base, TimestampMixin):
    """Organization-Wide Default (OWD) sharing settings for each object"""
    __tablename__ = "organization_wide_default_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # Object identification
    sobject_type: Mapped[str] = mapped_column(String(100), nullable=False)  # Account, Opportunity, Case, etc.
    sobject_label: Mapped[Optional[str]] = mapped_column(String(255))

    # Sharing settings
    internal_sharing_model: Mapped[str] = mapped_column(String(50), nullable=False)
    # Values: Private, Read, ReadWrite, ControlledByParent, FullAccess

    external_sharing_model: Mapped[Optional[str]] = mapped_column(String(50))
    # For objects with external sharing (Partner/Customer users)

    # Additional OWD settings
    is_default_owner_is_creator: Mapped[bool] = mapped_column(Boolean, default=False)
    # If true, record owner is set to creator by default

    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "sobject_type", "snapshot_date", name="uq_owd_org_sobject_snapshot"),
        Index("ix_owd_org", "organization_id"),
        Index("ix_owd_sobject", "sobject_type"),
    )

    def __repr__(self) -> str:
        return f"<OrganizationWideDefaultSnapshot(object={self.sobject_type}, internal={self.internal_sharing_model})>"


# ============================================================================
# Audit & Compliance Models
# ============================================================================


class AuditLog(Base, TimestampMixin):
    """Audit trail of all sensitive data access and actions"""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # Who performed the action
    user_email: Mapped[Optional[str]] = mapped_column(String(255))
    user_id: Mapped[Optional[str]] = mapped_column(String(36))  # Future: FK to OrgUser

    # What action was performed
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, native_enum=False, length=50),
        nullable=False
    )
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g., "user", "permission", "organization", "sync_job"

    resource_id: Mapped[Optional[str]] = mapped_column(String(255))
    # ID of the specific resource accessed (if applicable)

    # Request details
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))  # IPv4 or IPv6
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    request_path: Mapped[Optional[str]] = mapped_column(String(500))
    request_method: Mapped[Optional[str]] = mapped_column(String(10))  # GET, POST, etc.

    # Result
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    # Additional context
    context_data: Mapped[dict] = mapped_column(JSON, default=dict)
    # Store additional context like: query params, response size, duration, etc.

    # Relationships
    organization = relationship("Organization")

    __table_args__ = (
        Index("ix_audit_org", "organization_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_user", "user_email"),
        Index("ix_audit_created", "created_at"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog(action={self.action}, user={self.user_email}, resource={self.resource_type})>"


class OrgUser(Base, TimestampMixin):
    """Users who can access the AccessGraph dashboard (RBAC)"""
    __tablename__ = "org_users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # User identification
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255))

    # Authentication (future: could integrate with Auth0, Okta, etc.)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    # For now, users will authenticate via Salesforce OAuth

    # Role and permissions
    role: Mapped[OrgUserRole] = mapped_column(
        Enum(OrgUserRole, native_enum=False, length=20),
        default=OrgUserRole.VIEWER,
        nullable=False
    )

    # Granular permissions (override role defaults)
    can_export_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_users: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_sync_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_delete_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_view_audit_logs: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Invitation tracking
    invited_by: Mapped[Optional[str]] = mapped_column(String(36))  # FK to another OrgUser
    invited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    organization = relationship("Organization")

    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_org_user_email"),
        Index("ix_org_user_org", "organization_id"),
        Index("ix_org_user_email", "email"),
        Index("ix_org_user_role", "role"),
    )

    def __repr__(self) -> str:
        return f"<OrgUser(email={self.email}, role={self.role}, org={self.organization_id})>"

    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission based on role and overrides"""
        # Org admins have all permissions
        if self.role == OrgUserRole.ORG_ADMIN:
            return True

        # Check specific permissions
        permission_map = {
            "export_data": self.can_export_data,
            "manage_users": self.can_manage_users,
            "sync_data": self.can_sync_data,
            "delete_data": self.can_delete_data,
            "view_audit_logs": self.can_view_audit_logs or self.role == OrgUserRole.AUDITOR,
        }

        return permission_map.get(permission, False)
