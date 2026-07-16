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
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy_utils import EncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

from app.db.types import EncryptedString

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
    GRANT_FOR_EQUITY = "grant_for_equity"


class RecommendationTrack(str, PyEnum):
    """High-level grouping for the recommendations list UI.

    SECURITY  — anomaly-driven, action is revoke/review, severity Low→Critical
    EQUITY    — GAEA-driven, action is grant/connect, severity Info

    These answer different product questions and surface in distinct UI
    sections (Anomalies+Recommendations vs the Equity dashboard). A future
    track might be COMPLIANCE or COST_OPTIMIZATION; keep the enum open.
    """
    SECURITY = "security"
    EQUITY = "equity"


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
    # Reporting Graph editor — drag-and-drop edge save writes back to
    # User.ManagerId / User.DelegatedApproverId. Each edit logged
    # with prior_value + new_value in context_data.
    UPDATE_USER_RELATIONSHIP = "update_user_relationship"


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

    # Encrypted OAuth tokens (AES-256 encryption via custom EncryptedString
    # TypeDecorator - sqlalchemy_utils.EncryptedType has a class-level impl
    # that conflicts with SQLAlchemy 2.0 type caching, causing asyncpg to
    # store the encrypted base64 string as bytea-hex instead of text. Our
    # EncryptedString fixes this with explicit impl=Text.)
    access_token: Mapped[Optional[str]] = mapped_column(
        EncryptedString(settings.DATABASE_ENCRYPTION_KEY)
        if settings.ENABLE_FIELD_ENCRYPTION and settings.DATABASE_ENCRYPTION_KEY
        else Text,
        nullable=True
    )
    refresh_token: Mapped[Optional[str]] = mapped_column(
        EncryptedString(settings.DATABASE_ENCRYPTION_KEY)
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
    manager_id: Mapped[Optional[str]] = mapped_column(String(18))
    # Backup approver — second strongest user-to-user supervisory tie after
    # ManagerId. Powers the `delegated_approver` edge type in the equity
    # graph (apps/backend/app/services/equity_recommendations.py).
    delegated_approver_id: Mapped[Optional[str]] = mapped_column(String(18))

    # Metadata
    department: Mapped[Optional[str]] = mapped_column(String(255))
    title: Mapped[Optional[str]] = mapped_column(String(255))
    # Most recent Salesforce login timestamp. Powers the
    # last_login_days_ago feature in anomaly detection (closes the
    # DORMANT_POWERFUL blind spot from REPORT.md § 7.2).
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    # Relationships
    organization = relationship("Organization", back_populates="users")

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_user_org_sf_id"),
        Index("ix_user_org", "organization_id"),
        Index("ix_user_sf_id", "salesforce_id"),
        Index("ix_user_profile", "profile_id"),
        Index("ix_user_role", "user_role_id"),
        Index("ix_user_manager", "manager_id"),
        Index("ix_user_delegated_approver", "delegated_approver_id"),
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
    # FK to UserLicense — drives accurate per-user cost attribution in
    # the Org Analyzer (a Platform user only saves $25/mo when deactivated,
    # not the flat $165 we used to apply to everyone).
    user_license_id: Mapped[Optional[str]] = mapped_column(String(18))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", name="uq_profile_org_sf_id"),
        Index("ix_profile_org", "organization_id"),
        Index("ix_profile_user_license", "user_license_id"),
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
    # Salesforce PermissionSet.Type: Regular | Standard | Session | Group | Muting.
    # Nullable because rows synced before this column was added have no signal here.
    # Treat NULL as "Regular" downstream.
    ps_type: Mapped[Optional[str]] = mapped_column(String(32))
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)

    @property
    def is_muting(self) -> bool:
        return self.ps_type == "Muting"

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

    # category tags the detector this record came from:
    #   "access"  — existing ML detector over permission/effective-access
    #               features (Mahalanobis+GMM ensemble). Original behaviour.
    #   "session" — rule-based detector over LoginHistory (impossible
    #               travel, new-country, dormant reactivation, brute-force
    #               success). Shipped in the Session Anomalies feature.
    # Backfills as "access" for rows written before the column existed;
    # the frontend uses it as a filter chip on the Anomalies page.
    category: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="access", default="access",
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
        Index("ix_anomaly_category", "category"),
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
    # Track grouping for the UI (Security vs Equity). Defaults to SECURITY
    # at the DB level so legacy code paths that don't set it explicitly
    # land in the existing recommendations list as before. server_default
    # uses the enum NAME ('SECURITY') not the value ('security') because
    # SQLAlchemy's Enum(native_enum=False) stores names by default and
    # raises LookupError on read if the stored string doesn't match a
    # known name — matches the storage convention of the other enum cols.
    track: Mapped[RecommendationTrack] = mapped_column(
        Enum(RecommendationTrack, native_enum=False, length=20),
        default=RecommendationTrack.SECURITY,
        server_default=RecommendationTrack.SECURITY.name,
        nullable=False,
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
        Index("ix_rec_track", "track"),
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


class OpportunityTeamMemberSnapshot(Base, TimestampMixin):
    """OpportunityTeamMember snapshot — used by GAEA `opportunity_team` edge.

    Each row = one user on the team of one opportunity, with their stated
    role and access level. Provides strong "users collaborating on the
    same deal" signal for the equity graph.
    """
    __tablename__ = "opportunity_team_member_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    salesforce_id: Mapped[str] = mapped_column(String(18), nullable=False)

    opportunity_id: Mapped[str] = mapped_column(String(18), nullable=False)
    user_id: Mapped[str] = mapped_column(String(18), nullable=False)
    team_member_role: Mapped[Optional[str]] = mapped_column(String(100))
    opportunity_access_level: Mapped[Optional[str]] = mapped_column(String(20))

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "salesforce_id", "snapshot_date", name="uq_opp_team_org_sf_snapshot"),
        Index("ix_opp_team_org", "organization_id"),
        Index("ix_opp_team_opportunity", "opportunity_id"),
        Index("ix_opp_team_user", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<OpportunityTeamMemberSnapshot(opp={self.opportunity_id}, user={self.user_id}, role={self.team_member_role})>"


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


class AuthToken(Base, TimestampMixin):
    """Single-use tokens for account activation + password reset.

    Issued when an admin creates a new OrgUser (`purpose='activate'`) or
    when any user requests a password reset (`purpose='reset_password'`).
    The `token` column stores the token verbatim (URL-safe random 32
    bytes → 43 chars base64) since we index-lookup by it directly.
    That's a deliberate trade-off vs. hashing: single-use + short TTL
    (24h) means a leaked DB row is only useful within that window,
    and the lookup path stays a single indexed SELECT.

    Consumed by:
      - POST /auth/activate  — sets password, marks user verified,
                                marks token used.
      - POST /auth/reset-password — same, but doesn't touch is_email_verified.
    """
    __tablename__ = "auth_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("org_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    token: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    # 'activate' | 'reset_password'
    purpose: Mapped[str] = mapped_column(String(24), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Set when the token is consumed. Nullable — never reset to null
    # after being set, so a token is one-use forever.
    used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    user = relationship("OrgUser")

    __table_args__ = (
        Index("ix_auth_token_lookup", "token"),
        Index("ix_auth_token_user", "user_id"),
    )


class DeepLinkRedemption(Base, TimestampMixin):
    """
    Records redemption of a deep-link JWT issued to a managed-package quick
    action. The jti is the unique identifier from the token; presence in this
    table prevents replay (a token can only be redeemed once).

    Rows expire (expires_at) and a nightly cleanup job can prune them.
    """
    __tablename__ = "deeplink_redemptions"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    sf_user_id: Mapped[str] = mapped_column(String(18), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(255), nullable=False)
    redeemed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_deeplink_redemptions_org", "organization_id"),
        Index("ix_deeplink_redemptions_expires", "expires_at"),
    )


# ============================================================================
# Equity (RL-driven graph-augmentation track)
# ============================================================================


class VIPDesignationKind(str, PyEnum):
    """Pin = explicitly mark as VIP. Unpin = explicitly exclude from VIP set."""
    PIN = "pin"
    UNPIN = "unpin"


class VIPDesignation(Base, TimestampMixin):
    """Admin override for the equity track's VIP set (R).

    Heuristics (manager-id tree, role-tree depth, name-pattern match) supply
    the default VIP set. Admins can pin a missed user or unpin a false
    positive via this table; pins/unpins always win over heuristics.
    """
    __tablename__ = "vip_designations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    kind: Mapped[VIPDesignationKind] = mapped_column(
        Enum(VIPDesignationKind, native_enum=False, length=10),
        nullable=False,
    )
    designated_by: Mapped[Optional[str]] = mapped_column(String(36))  # OrgUser.id
    note: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (
        UniqueConstraint("organization_id", "user_sf_id", name="uq_vip_designation_org_user"),
        Index("ix_vip_designation_org", "organization_id"),
    )


class EquitySnapshot(Base, TimestampMixin):
    """One row per equity-recommendations run.

    Carries the headline diagnostic metrics surfaced in the UI plus the
    raw per-department utilities and edge-type counts so the per-user and
    per-VIP drill-downs can hydrate without recomputing the graph.
    """
    __tablename__ = "equity_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Headline metrics
    equity_index: Mapped[float] = mapped_column(Float, nullable=False)         # 1 - Gini
    disparity: Mapped[float] = mapped_column(Float, nullable=False)            # sum |U_g − Ū|
    most_disadvantaged_group: Mapped[Optional[str]] = mapped_column(String(255))
    vip_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # Detail JSON for per-dept utility bars and edge-type counts
    per_dept_utilities: Mapped[dict] = mapped_column(JSON, default=dict)
    edge_type_counts: Mapped[dict] = mapped_column(JSON, default=dict)
    raw_metrics: Mapped[dict] = mapped_column(JSON, default=dict)

    # How many GRANT_FOR_EQUITY recommendations this run produced
    recommendations_generated: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index("ix_equity_snapshot_org_time", "organization_id", "snapshot_at"),
    )


# ============================================================================
# Org Analyzer — consulting-grade org-health diagnostics
# ============================================================================
#
# Fourth analysis track alongside Anomaly, Risk, Equity. Surfaces a broad
# matrix of findings — license waste, configuration bloat, automation
# hygiene, sharing posture, storage/limit risk, predictive trends — with
# dollar-impact estimates so a consultant can hand a customer a CFO-ready
# report after plugging into their org for an hour. Purely additive: no
# existing service / table / route is modified.


class FindingCategory(str, PyEnum):
    """High-level grouping for org-analyzer findings."""
    LICENSE_WASTE = "license_waste"
    CONFIG_BLOAT = "config_bloat"
    AUTOMATION_HYGIENE = "automation_hygiene"
    SHARING_POSTURE = "sharing_posture"
    STORAGE_LIMIT = "storage_limit"
    DATA_QUALITY = "data_quality"
    USER_ACTIVITY = "user_activity"
    PREDICTIVE = "predictive"


class FindingSeverity(str, PyEnum):
    """Severity ladder for org-analyzer findings. Mirrors AnomalySeverity
    values exactly so the frontend severity badges + colour ramps can be
    reused without divergence."""
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OrgAnalysisSnapshot(Base, TimestampMixin):
    """One row per Org Analyzer run.

    Carries the headline summary (counts per category/severity, total
    estimated savings, raw /limits JSON) so the dashboard hydrates from
    a single row + the per-finding drill-down hangs off `findings`.
    """
    __tablename__ = "org_analysis_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    findings_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    findings_by_severity: Mapped[dict] = mapped_column(JSON, default=dict)
    findings_by_category: Mapped[dict] = mapped_column(JSON, default=dict)
    total_estimated_annual_savings_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Raw /limits payload at snapshot time — drives trend extrapolation
    # and the storage/API quota dashboards. Stored verbatim so we don't
    # lose any new SF limit keys when Salesforce adds them.
    org_limits: Mapped[dict] = mapped_column(JSON, default=dict)

    # Free-form headline metrics — per-object record counts, license
    # utilization%, daily-active-user count, etc. Whatever the analyzer
    # wants to chart on the trends tab.
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)

    # Plain-English executive summary composed at snapshot-persist time
    # so it's deterministic + renderable from a single row. Surfaced on
    # the Overview tab + PDF cover page.
    executive_summary: Mapped[Optional[str]] = mapped_column(Text)

    findings = relationship(
        "OrgFinding",
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_org_analysis_snapshot_org_time", "organization_id", "snapshot_at"),
    )


class OrgFinding(Base, TimestampMixin):
    """One row per finding produced by the Org Analyzer.

    Designed to be self-describing for the dashboard + PDF: title, body,
    severity badge, optional dollar savings, optional Setup deeplink, and
    a JSON `evidence` blob carrying whatever ids / counts / SOQL hints
    the consultant needs to follow up in the actual Salesforce org.
    """
    __tablename__ = "org_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("org_analysis_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )

    category: Mapped[FindingCategory] = mapped_column(
        Enum(FindingCategory, native_enum=False, length=30), nullable=False
    )
    # Stable string code per rule type (LICENSE_INACTIVE_USER, etc.) so
    # the frontend can map to icons / docs without re-deriving from the
    # title. Free-form string, not an enum, so new rules can ship without
    # a migration.
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[FindingSeverity] = mapped_column(
        Enum(FindingSeverity, native_enum=False, length=20), nullable=False
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_action: Mapped[Optional[str]] = mapped_column(Text)

    affected_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_annual_savings_cents: Mapped[Optional[int]] = mapped_column(Integer)

    # Per-finding evidence — list of {id, label, ...} dicts the dashboard
    # renders as a sample table. Bounded in size by the service (top 50).
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    # Optional deeplink to Salesforce Setup (e.g. /lightning/setup/ManageUsers/home)
    sf_setup_deeplink: Mapped[Optional[str]] = mapped_column(String(500))

    # Ignore state — lets a consultant mark a finding as intentional /
    # out-of-scope without losing the row. Ignored findings drop out of
    # the snapshot's total-savings rollup and hide by default in the UI.
    is_ignored: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    ignored_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ignored_by: Mapped[Optional[str]] = mapped_column(String(255))
    ignore_reason: Mapped[Optional[str]] = mapped_column(Text)

    # Resolved state — set by the "Apply fix" Salesforce write-back
    # endpoint when an actionable finding has been actioned in SF.
    # Resolved findings hide by default, get a green pill, and stop
    # contributing to active savings totals.
    is_resolved: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[Optional[str]] = mapped_column(String(255))

    snapshot = relationship("OrgAnalysisSnapshot", back_populates="findings")

    __table_args__ = (
        Index(
            "ix_org_finding_snapshot_category",
            "organization_id",
            "snapshot_id",
            "category",
        ),
        Index("ix_org_finding_severity", "severity"),
    )


class LicensePriceBook(Base, TimestampMixin):
    """Per-org license SKU → monthly cost. Drives the dollar-impact
    estimates on every license-waste finding.

    Seeded with sensible defaults on first read so a fresh-install org
    doesn't get $0 savings everywhere; the consultant overrides with the
    customer's actual contracted prices via the PUT endpoint.
    """
    __tablename__ = "license_price_book"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    license_name: Mapped[str] = mapped_column(String(100), nullable=False)
    monthly_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    # Per-row "is this actually billed in the customer's contract" flag.
    # When False, the analyzer treats the SKU as bundled/no-cost even if
    # monthly_cost_cents > 0. Lets the consultant override the auto-
    # detection ladder (org-edition + KNOWN_FREE_SKU_PATTERNS) for the
    # edge cases the heuristics miss.
    is_billed: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(255))

    __table_args__ = (
        UniqueConstraint(
            "organization_id", "license_name", name="uq_price_book_org_license"
        ),
    )


class OrgAnalyzerRun(Base, TimestampMixin):
    """Operational log of analyzer runs — useful for debugging long runs
    and surfacing 'last run failed because X' to the admin without
    grepping container logs."""
    __tablename__ = "org_analyzer_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("org_analysis_snapshots.id", ondelete="SET NULL"),
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # running|completed|failed
    actor_email: Mapped[Optional[str]] = mapped_column(String(255))
    error: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (
        Index("ix_analyzer_run_org_time", "organization_id", "started_at"),
    )


class BrandSettings(Base, TimestampMixin):
    """Per-org branding for the white-labeled Org Analyzer PDF report.

    One row per organization. Logo bytes stored on the row to keep
    deployment simple — no object-storage dependency. Capped at 256KB
    by the upload endpoint. accent_hex substitutes the indigo accent
    across the PDF; defaults preserve the unbranded look when null.
    """
    __tablename__ = "brand_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    firm_name: Mapped[Optional[str]] = mapped_column(String(255))
    accent_hex: Mapped[Optional[str]] = mapped_column(String(7))  # "#RRGGBB"
    logo_bytes: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    logo_mime: Mapped[Optional[str]] = mapped_column(String(64))
    updated_by: Mapped[Optional[str]] = mapped_column(String(255))


# ============================================================================
# Data Quality — per-object health scoring (Newton feature — additive)
# ============================================================================
#
# Snapshot-per-run pattern, mirroring OrgAnalysisSnapshot. Each run walks
# a curated set of business objects (Account, Contact, Lead, Opportunity,
# Case, plus every custom object) and computes:
#   - completeness  — % of records with required-adjacent fields populated
#   - duplicate_pct — % of records that collide on Name / Email
#   - staleness_pct — % of records older than 180d since LastModifiedDate
# then rolls those into a 0-100 composite score. Sample size is bounded
# per-object (default 500 records) so a run stays under a minute even on
# large orgs. All computation lives in app/services/data_quality.py; the
# snapshots below are pure state — never mutated by analytics.


class DataQualityRun(Base, TimestampMixin):
    """One row per data-quality computation.

    Header row for a run. Object-level scores hang off `object_scores`.
    Kept append-only so the trends UI can chart score-over-time per
    object without needing a separate history table.
    """
    __tablename__ = "data_quality_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Objects analysed on this run. Skipped objects (system-owned, no
    # LastModifiedDate, or explicitly excluded) don't count against total.
    objects_analyzed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    objects_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Composite averages across every analysed object. The dashboard's
    # top-level KPI ("Org data-quality score") reads from `avg_score`.
    avg_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_completeness: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_duplicate_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_staleness_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Configuration snapshot at run time so historical numbers stay
    # explainable when the defaults change.
    sample_size: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    staleness_threshold_days: Mapped[int] = mapped_column(
        Integer, default=180, nullable=False
    )

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(Text)

    object_scores = relationship(
        "ObjectQualityScore",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_data_quality_run_org_time", "organization_id", "snapshot_at"),
    )


class ObjectQualityScore(Base, TimestampMixin):
    """Per-object data-quality metrics for one run.

    Everything the frontend needs to render the per-object detail card
    lives on this row. Fields are stored in absolute form (counts +
    percentages) so downstream code doesn't have to re-divide.
    """
    __tablename__ = "object_quality_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("data_quality_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    object_name: Mapped[str] = mapped_column(String(80), nullable=False)  # API name
    object_label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Sample scope — what did we actually inspect?
    record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sampled_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Composite score (0-100). Weights: completeness 0.5, dupes 0.3,
    # staleness 0.2 — see DataQualityService.compute_score.
    score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Component scores, all 0-100 for uniform charting.
    completeness_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    duplicate_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    staleness_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Supporting counts + evidence samples for the detail card.
    fields_inspected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fields_with_gaps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duplicate_clusters: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stale_record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Free-form evidence — top offenders for each component so the
    # detail card can show "worst-populated fields", "top duplicate
    # clusters", "oldest untouched records" without a second query.
    # Shape: {"gap_fields": [...], "duplicate_examples": [...],
    #         "stale_examples": [...]}
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("DataQualityRun", back_populates="object_scores")

    __table_args__ = (
        Index(
            "ix_obj_quality_org_run_object", "organization_id", "run_id", "object_name"
        ),
        UniqueConstraint("run_id", "object_name", name="uq_obj_quality_run_object"),
    )


# ============================================================================
# Change-risk radar — SetupAuditTrail ingest + blast-radius scoring
# ============================================================================
#
# Ingest-per-run pattern mirroring DataQualityRun. Each run pulls the
# org's SetupAuditTrail rows since a configurable cutoff (default 30d)
# and scores every event by "blast radius" — how broadly the change
# could affect users / data / access. High-blast events surface at the
# top of the timeline UI so admins can spot risky changes at a glance.
# All computation lives in app/services/change_risk_radar.py; the
# snapshots below are pure state.


class ChangeAuditRun(Base, TimestampMixin):
    """One row per SetupAuditTrail pull.

    Header row; per-event rows hang off `events`. Kept append-only so
    the frontend can chart event volume + high-blast counts over time
    without a separate history table.
    """
    __tablename__ = "change_audit_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Cutoff used for this pull — anything with CreatedDate < since
    # was excluded. Stored so historical runs stay explainable.
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    events_ingested: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    high_blast_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unique_actors: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_blast_radius: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Aggregate rollups so the UI can render the "top 5 sections" and
    # "top 5 actors" cards without a second query. Shape:
    #   {"by_section": {"Manage Users": 42, ...},
    #    "by_actor":   {"admin@acme.com": 17, ...}}
    rollups: Mapped[dict] = mapped_column(JSON, default=dict)

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(Text)

    events = relationship(
        "ChangeAuditEvent",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_change_audit_run_org_time", "organization_id", "snapshot_at"),
    )


class ChangeAuditEvent(Base, TimestampMixin):
    """One row per SetupAuditTrail event pulled on a run.

    Preserves the SF-native shape (created_at, section, display, actor)
    so consultants can drill in without a second SF call. `blast_radius`
    is our composite 0-100 score; `blast_tier` classifies it into
    low / medium / high / critical bands for badge rendering.
    """
    __tablename__ = "change_audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("change_audit_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Salesforce's own IDs / metadata — kept verbatim so the frontend
    # can deep-link back into the Setup UI when useful.
    sf_event_id: Mapped[str] = mapped_column(String(18), nullable=False)
    created_at_sf: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    actor_id: Mapped[Optional[str]] = mapped_column(String(18))
    actor_name: Mapped[Optional[str]] = mapped_column(String(255))

    # Categorisation. `section` is SF's own bucket (Manage Users,
    # Sharing Rules, Metadata Deploy, etc.) — the primary driver of
    # the base blast-radius score.
    section: Mapped[Optional[str]] = mapped_column(String(120))
    action: Mapped[Optional[str]] = mapped_column(String(120))
    display: Mapped[str] = mapped_column(Text, nullable=False)
    delegate_user: Mapped[Optional[str]] = mapped_column(String(120))

    # Composite score + band. See app/services/change_risk_radar.py
    # for the scoring model.
    blast_radius: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    blast_tier: Mapped[str] = mapped_column(String(16), default="low", nullable=False)

    # Free-form JSON for scorer-emitted rationale (e.g. what triggered
    # the "+15 delete modifier"). Renders in the timeline drilldown.
    reasoning: Mapped[dict] = mapped_column(JSON, default=dict)

    # Reviewer-attached context. `notes` is free-form text explaining
    # what happened / why it was OK / what to follow up on. `ticket_url`
    # links to the change-management record (Jira, ServiceNow, etc.) —
    # the URL is the source of truth outside this tool. Both nullable
    # so unclaimed events stay clean in the UI.
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ticket_url: Mapped[Optional[str]] = mapped_column(
        String(2048), nullable=True
    )

    run = relationship("ChangeAuditRun", back_populates="events")

    __table_args__ = (
        Index(
            "ix_change_audit_event_org_time",
            "organization_id", "created_at_sf",
        ),
        Index(
            "ix_change_audit_event_run", "run_id",
        ),
        UniqueConstraint(
            "run_id", "sf_event_id", name="uq_change_audit_run_sfid"
        ),
    )


# ============================================================================
# Managed-package sprawl — AppExchange inventory + usage detection
# ============================================================================
#
# Third additive analytics engine in the Newton Phase-1 roadmap.
# Pulls every managed package installed in the org, counts components
# per namespace (ApexClass / Flow / CustomObject), joins license usage
# where available, and tiers each package as Active / Under-used /
# Unused so consulting engagements can quantify "you're paying for X
# but nobody's using it". All state hangs off the two tables below;
# service logic lives in app/services/package_sprawl.py.


class PackageSprawlRun(Base, TimestampMixin):
    """One row per package-sprawl pull.

    Header + rollups so the KPI strip renders from a single row + the
    per-package drill-down hangs off `packages`.
    """
    __tablename__ = "package_sprawl_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    packages_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    packages_active: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    packages_underused: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    packages_unused: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # % of packages that returned any component or licence usage.
    # Drives the "utilisation" KPI on the dashboard.
    avg_utilization_pct: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False
    )

    # Total licence-seat counts across every analysed package. Rendered
    # as "N of M seats used" on the summary strip.
    total_licenses_allowed: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    total_licenses_used: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(Text)

    packages = relationship(
        "InstalledPackage",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_package_sprawl_run_org_time", "organization_id", "snapshot_at"),
    )


class InstalledPackage(Base, TimestampMixin):
    """One row per InstalledSubscriberPackage for this run.

    Everything the frontend needs to render the per-package card lives
    on this row — component counts, licence data, tier band, evidence
    JSON. No FK back into SF-owned metadata; the sf_package_id + name
    are stored verbatim so pulls stay disconnected from the sync.
    """
    __tablename__ = "installed_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("package_sprawl_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    # SF identifiers verbatim so consultants can deep-link back into
    # Setup ("Installed Packages") without needing our IDs.
    sf_package_id: Mapped[str] = mapped_column(String(18), nullable=False)
    sf_version_id: Mapped[Optional[str]] = mapped_column(String(18))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    namespace_prefix: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)

    # Version metadata — used to spot deprecated / beta packages that
    # should probably be uninstalled.
    version_name: Mapped[Optional[str]] = mapped_column(String(255))
    version_number: Mapped[Optional[str]] = mapped_column(String(60))
    is_beta: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deprecated: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    is_managed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Component counts per namespace. -1 = query not attempted (e.g.
    # namespace was empty). 0 = queried and returned nothing.
    apex_class_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    flow_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    custom_object_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Licence data if `PackageLicense` was queryable for this namespace.
    # None = licence object had no matching row (not all packages have
    # AppExchange licences).
    licenses_allowed: Mapped[Optional[int]] = mapped_column(Integer)
    licenses_used: Mapped[Optional[int]] = mapped_column(Integer)

    # Real wiring signals — added v2 to replace shallow inventory
    # scoring with actual reference / activity detection.
    #
    # dependency_count: MetadataComponentDependency rows pointing INTO
    #   this package's namespace. Non-zero = customer code (Apex / LWC /
    #   Flow / Validation Rule) actually references package components.
    # record_count_total: sum of COUNT(*) across every package-brought
    #   custom object. Non-zero = someone's actually storing data here.
    # async_job_count: AsyncApexJob rows whose ApexClass sits in the
    #   package's namespace. Non-zero = the package's Apex is running.
    # scheduled_job_count: CronTrigger rows for scheduled Apex jobs
    #   named "<namespace>.<JobName>". Non-zero = the package has
    #   scheduled jobs still on the books.
    #
    # None = the underlying query failed for that signal (missing perms
    # / no Tooling access). Zero = we successfully queried and got no
    # rows.
    dependency_count: Mapped[Optional[int]] = mapped_column(Integer)
    record_count_total: Mapped[Optional[int]] = mapped_column(Integer)
    async_job_count: Mapped[Optional[int]] = mapped_column(Integer)
    scheduled_job_count: Mapped[Optional[int]] = mapped_column(Integer)

    # Tier classification: 'active' | 'underused' | 'unused'.
    # Computed by PackageSprawlService — see the scoring rules there.
    utilization_tier: Mapped[str] = mapped_column(
        String(16), default="unused", nullable=False
    )

    # Free-form evidence blob: what pushed the package into its tier,
    # any related SetupAuditTrail activity, etc. Rendered as tooltip
    # or drilldown on the frontend.
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("PackageSprawlRun", back_populates="packages")

    __table_args__ = (
        Index(
            "ix_installed_package_org_run",
            "organization_id", "run_id",
        ),
        UniqueConstraint(
            "run_id", "sf_package_id", name="uq_installed_package_run_sfid"
        ),
    )


# ============================================================================
# Report & Dashboard Sprawl
# ============================================================================
#
# Inventory + tier scoring for Reports + Dashboards. Mirror of the
# Managed-Package Sprawl pattern: one snapshot per run, one row per
# item, tier + evidence computed at snapshot time.
#
# Tiers (precedence: orphaned > duplicate > zombie > live):
#   - orphaned:  owner is inactive
#   - duplicate: normalised name matches ≥1 sibling in the same run
#   - zombie:    LastReferencedDate > 12 months ago (or never referenced)
#   - live:      referenced within the last 12 months


class ReportSprawlRun(Base, TimestampMixin):
    """One run of the Report & Dashboard Sprawl analyser.

    All the rollup counters are stored on this row so /latest is a
    single-row read — the per-item detail lives on ReportInventoryItem
    and only loads when the user opens the drilldown.
    """
    __tablename__ = "report_sprawl_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    reports_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dashboards_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    items_live: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_zombie: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_orphaned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_duplicate: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Aggregate signals for the KPI strip.
    items_never_referenced: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    # Mean of `days_since_last_view` across items that have any view
    # history. Nullable — an empty org (no items) has nothing to average.
    avg_days_since_last_view: Mapped[Optional[int]] = mapped_column(Integer)
    # Distinct normalised-name buckets that have ≥2 items — the number
    # of duplicate GROUPS, not the total duplicate item count.
    duplicate_groups: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(String(500))

    items = relationship(
        "ReportInventoryItem",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_report_sprawl_run_org_time", "organization_id", "snapshot_at"),
    )


class ReportInventoryItem(Base, TimestampMixin):
    """One row per Report or Dashboard captured at snapshot time.

    Deliberately unified — reports + dashboards share almost every
    field the sprawl scorer needs, and it means the API can return
    them in one list. `item_type` discriminates.
    """
    __tablename__ = "report_inventory_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("report_sprawl_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    item_type: Mapped[str] = mapped_column(String(16), nullable=False)  # report | dashboard
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    developer_name: Mapped[Optional[str]] = mapped_column(String(255))
    folder_name: Mapped[Optional[str]] = mapped_column(String(255))
    folder_id: Mapped[Optional[str]] = mapped_column(String(18))

    owner_sf_id: Mapped[Optional[str]] = mapped_column(String(18))
    owner_name: Mapped[Optional[str]] = mapped_column(String(255))
    # Nullable because we may not have resolved the owner (managed by
    # someone in a synced-out portion of the org). None means "unknown"
    # not "active" — the tier scorer treats None as inactive to fail safe.
    owner_is_active: Mapped[Optional[bool]] = mapped_column(Boolean)

    description: Mapped[Optional[str]] = mapped_column(String(1000))
    report_format: Mapped[Optional[str]] = mapped_column(String(32))

    # Salesforce timestamps — kept as UTC datetimes.
    created_at_sf: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_referenced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Snapshot-time computed values (avoid recomputing on every read).
    # None when no view history — frontend renders "never viewed".
    days_since_last_view: Mapped[Optional[int]] = mapped_column(Integer)

    # Tier: 'live' | 'zombie' | 'orphaned' | 'duplicate'.
    tier: Mapped[str] = mapped_column(String(16), default="live", nullable=False)
    # Hash of the normalised name; groups items by dedup key so the
    # frontend can render duplicate clusters. NULL when the item's name
    # was too short or empty to normalise usefully.
    duplicate_group_key: Mapped[Optional[str]] = mapped_column(String(64))

    # Per-item evidence: normalised_name, tier_reason, sibling ids, etc.
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("ReportSprawlRun", back_populates="items")

    __table_args__ = (
        Index("ix_report_item_org_run", "organization_id", "run_id"),
        Index("ix_report_item_dupe", "run_id", "duplicate_group_key"),
        UniqueConstraint(
            "run_id", "sf_id", name="uq_report_item_run_sfid"
        ),
    )


# ============================================================================
# Automation Sprawl — Flow + ApexTrigger inventory
# ============================================================================
#
# Mirror of the Report Sprawl + Package Sprawl pattern applied to
# automation. One row per Flow / ApexTrigger, tiered by:
#
#   broken > orphaned > dormant > active
#
#   - broken:   Flow IsOutOfDate=True (active version doesn't match
#               latest saved), OR ApexTrigger IsValid=False (doesn't
#               compile against current schema).
#   - orphaned: LastModifiedBy is an inactive user.
#   - dormant:  currently active but LastModifiedDate >12 months ago.
#               Proxy for "nobody has touched this in a year".
#   - active:   modified within the last 12 months + owner active.


class AutomationSprawlRun(Base, TimestampMixin):
    """Header row + rollup counters per run. Single-row read for the
    KPI strip; per-item detail lives on AutomationInventoryItem."""
    __tablename__ = "automation_sprawl_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    flows_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    triggers_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    items_active: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_dormant: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_orphaned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_broken: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Mean of days-since-last-modified across items that were modified
    # at least once. Nullable when no items exist.
    avg_days_since_modified: Mapped[Optional[int]] = mapped_column(Integer)
    # Distinct normalised-name buckets with ≥2 members. Same idea as
    # duplicate_groups on ReportSprawlRun.
    duplicate_groups: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(String(500))

    # Per-source raw counts + error captures ({"flows": {"raw_count": N,
    # "error": "..."}, "triggers": {...}, "users": {...}}). Written on
    # every run so a "0 items" outcome is never a silent failure — the
    # frontend can render exactly which SF query returned what.
    source_diagnostics: Mapped[dict] = mapped_column(JSON, default=dict)

    items = relationship(
        "AutomationInventoryItem",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_automation_sprawl_run_org_time",
            "organization_id",
            "snapshot_at",
        ),
    )


class AutomationInventoryItem(Base, TimestampMixin):
    """One row per Flow or ApexTrigger captured at snapshot time.

    Unified schema — item_type discriminates. Flow-only fields
    (process_type, trigger_type) are NULL for triggers, and vice
    versa (target_object is NULL for flows without a trigger object).
    """
    __tablename__ = "automation_inventory_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("automation_sprawl_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    item_type: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # 'flow' | 'trigger'
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_name: Mapped[Optional[str]] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    namespace_prefix: Mapped[Optional[str]] = mapped_column(String(120))

    # Flow-specific
    process_type: Mapped[Optional[str]] = mapped_column(String(64))
    trigger_type: Mapped[Optional[str]] = mapped_column(String(64))
    # Trigger-specific
    target_object: Mapped[Optional[str]] = mapped_column(String(120))
    api_version: Mapped[Optional[str]] = mapped_column(String(16))
    length_without_comments: Mapped[Optional[int]] = mapped_column(Integer)

    # State flags. `is_active` is what Salesforce currently runs;
    # `is_valid` is compile / schema-validity for triggers or
    # IsOutOfDate inverted for flows.
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean)
    is_valid: Mapped[Optional[bool]] = mapped_column(Boolean)

    # Owner (last modifier) — mirrors ReportInventoryItem.
    owner_sf_id: Mapped[Optional[str]] = mapped_column(String(18))
    owner_name: Mapped[Optional[str]] = mapped_column(String(255))
    owner_is_active: Mapped[Optional[bool]] = mapped_column(Boolean)

    last_modified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    days_since_modified: Mapped[Optional[int]] = mapped_column(Integer)

    tier: Mapped[str] = mapped_column(
        String(16), default="active", nullable=False
    )
    duplicate_group_key: Mapped[Optional[str]] = mapped_column(String(64))

    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("AutomationSprawlRun", back_populates="items")

    __table_args__ = (
        Index(
            "ix_automation_item_org_run",
            "organization_id",
            "run_id",
        ),
        Index(
            "ix_automation_item_dupe",
            "run_id",
            "duplicate_group_key",
        ),
        UniqueConstraint(
            "run_id",
            "sf_id",
            name="uq_automation_item_run_sfid",
        ),
    )


# ============================================================================
# Integration Sprawl — Connected Apps + Named Credentials + External Data
#                       Sources + Auth Providers + Remote Site Settings
# ============================================================================
#
# Fourth sprawl surface (after Package / Report / Automation). Same
# inventory-plus-tier-scoring pattern applied to the five integration
# surfaces Salesforce exposes.
#
# Tiers (precedence: broken > stale > overprovisioned > healthy):
#   - broken:          IsActive=False OR recent auth failures on the
#                      matching LoginHistory application
#   - stale:           no LoginHistory activity in 180 days (for
#                      inbound OAuth apps + SSO providers) OR outbound
#                      integration inactive with no recent usage
#                      signal — a fossil in the org
#   - overprovisioned: reserved for v2; currently maps to unknown
#   - healthy:         active + recent activity (or, for outbound-only
#                      surfaces without LoginHistory join, active +
#                      recent LastModifiedDate)


class IntegrationSprawlRun(Base, TimestampMixin):
    """Header row + rollup counters per Integration Sprawl run.
    Mirror of ReportSprawlRun / AutomationSprawlRun."""
    __tablename__ = "integration_sprawl_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Per-type counts.
    connected_apps_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    named_credentials_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    external_data_sources_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    auth_providers_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    remote_sites_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_total: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Per-tier counts.
    items_healthy: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_stale: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_broken: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    items_unknown: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # LoginHistory summary for the KPI strip.
    logins_180d: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    failed_logins_180d: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(String(500))
    source_diagnostics: Mapped[dict] = mapped_column(
        JSON, default=dict
    )

    items = relationship(
        "IntegrationInventoryItem",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_integration_sprawl_run_org_time",
            "organization_id",
            "snapshot_at",
        ),
    )


class IntegrationInventoryItem(Base, TimestampMixin):
    """One row per integration surface at snapshot time.

    `integration_type` discriminates across the five sources — treated
    uniformly for tier scoring + KPI rollups. Type-specific fields
    (endpoint URL for outbound; auth-provider ProviderType; etc.) live
    in the `evidence` JSON so we don't sprout dozens of nullable
    per-type columns."""
    __tablename__ = "integration_inventory_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(
        String(36), nullable=False
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("integration_sprawl_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    # 'connected_app' | 'named_credential' | 'external_data_source' |
    # 'auth_provider' | 'remote_site'
    integration_type: Mapped[str] = mapped_column(
        String(32), nullable=False
    )
    # 'inbound' | 'outbound' | 'sso'
    direction: Mapped[str] = mapped_column(String(16), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    developer_name: Mapped[Optional[str]] = mapped_column(String(255))
    endpoint: Mapped[Optional[str]] = mapped_column(String(500))
    namespace_prefix: Mapped[Optional[str]] = mapped_column(String(120))

    # State flags — nullable per type (some surfaces don't have an
    # IsActive concept, in which case we treat as active).
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean)

    # LoginHistory rollup — only populated for surfaces we can join
    # against by name (ConnectedApplication, AuthProvider).
    login_count_180d: Mapped[Optional[int]] = mapped_column(Integer)
    failed_login_count_180d: Mapped[Optional[int]] = mapped_column(
        Integer
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )

    # Tier: 'healthy' | 'stale' | 'broken' | 'unknown'
    tier: Mapped[str] = mapped_column(
        String(16), default="unknown", nullable=False
    )

    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("IntegrationSprawlRun", back_populates="items")

    __table_args__ = (
        Index(
            "ix_integration_item_org_run",
            "organization_id",
            "run_id",
        ),
        UniqueConstraint(
            "run_id",
            "sf_id",
            name="uq_integration_item_run_sfid",
        ),
    )


# ============================================================================
# License-to-Persona Fit / Right-Sizing
# ============================================================================
#
# Per-user "does the license SKU match the actual usage?" analysis.
# Cross-references each user's ownership footprint (Opportunity /
# Case / Lead / Account / Contact record counts), effective object
# access, profile persona, and login recency against the assigned
# UserLicense.
#
# Fit categories:
#   right_sized  — persona matches SKU capability
#   overbuilt    — user has richer SKU than their actual usage warrants
#                  (e.g., Salesforce full → could work on Platform)
#   wrong_cloud  — user has Sales Cloud SKU but works exclusively in
#                  Service objects (or vice versa)
#   underused    — user has a paid SKU but hasn't logged in in 90+ days
#   inactive     — user is deactivated but still holds a paid seat
#                  (shouldn't happen but does)
#   unknown      — insufficient evidence to classify. Fail-safe.
#
# Reuses the existing LicensePriceBook (defined below alongside
# Org Analyzer) for per-SKU monthly cost.


class LicenseFitRun(Base, TimestampMixin):
    """One run of the License-to-Persona Fit analyser.

    Rollup counters live on this row so /latest is a single-row read.
    Per-user assessments live on LicenseFitAssessment.
    """
    __tablename__ = "license_fit_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    users_assessed: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_right_sized: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_overbuilt: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_wrong_cloud: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_underused: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_inactive_billed: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    users_unknown: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # The headline number. Sum of `annual_savings_cents` across every
    # non-right_sized assessment. Stored in cents to avoid FP drift.
    total_annual_savings_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    # Current spend across all assessed users (per the price book).
    total_current_annual_cost_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(String(500))
    source_diagnostics: Mapped[dict] = mapped_column(JSON, default=dict)

    assessments = relationship(
        "LicenseFitAssessment",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_license_fit_run_org_time",
            "organization_id",
            "snapshot_at",
        ),
    )


class LicenseFitAssessment(Base, TimestampMixin):
    """One row per active user per run. Captures the persona verdict,
    the current SKU, the recommended SKU, and the projected annual
    savings from switching."""
    __tablename__ = "license_fit_assessments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False)
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("license_fit_runs.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    user_name: Mapped[Optional[str]] = mapped_column(String(255))
    user_username: Mapped[Optional[str]] = mapped_column(String(255))
    user_is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    user_profile_name: Mapped[Optional[str]] = mapped_column(String(255))
    user_department: Mapped[Optional[str]] = mapped_column(String(255))
    user_title: Mapped[Optional[str]] = mapped_column(String(255))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    days_since_login: Mapped[Optional[int]] = mapped_column(Integer)

    # License SKU as reported by UserLicense (via Profile.user_license_id).
    current_license_name: Mapped[Optional[str]] = mapped_column(String(255))
    current_monthly_cost_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Persona verdict + fit category (see LicenseFitRun docstring).
    persona: Mapped[str] = mapped_column(
        String(32), default="unknown", nullable=False
    )
    fit_category: Mapped[str] = mapped_column(
        String(32), default="unknown", nullable=False
    )
    confidence: Mapped[str] = mapped_column(
        String(16), default="low", nullable=False
    )  # high | medium | low

    # Recommendation. None when the assessment is right_sized OR when
    # confidence is too low to recommend a change.
    recommended_license_name: Mapped[Optional[str]] = mapped_column(
        String(255)
    )
    recommended_monthly_cost_cents: Mapped[Optional[int]] = mapped_column(
        Integer
    )
    annual_savings_cents: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Per-user usage signals used in the decision — persisted so the
    # drilldown can show "why did we classify this way".
    accounts_owned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    opportunities_owned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    cases_owned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    leads_owned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    contacts_owned: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )

    # Free-form evidence blob (rationale, per-object edit access
    # summary, tiebreakers used, etc.).
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)

    run = relationship("LicenseFitRun", back_populates="assessments")

    __table_args__ = (
        Index(
            "ix_license_fit_assessment_org_run",
            "organization_id",
            "run_id",
        ),
        Index(
            "ix_license_fit_assessment_savings",
            "run_id",
            "annual_savings_cents",
        ),
        UniqueConstraint(
            "run_id",
            "user_sf_id",
            name="uq_license_fit_assessment_run_user",
        ),
    )


# ============================================================================
# GAEA Optimal Org Restructure — role-hierarchy + PSet consolidation
# ============================================================================
#
# Fully additive to the equity engine. Reads GAEA outputs (utility per user,
# equity index) as a scoring signal. Never modifies equity_recommendations
# or the Recommendation table.
#
# Four tables, all migrated in c4e8f2a9b7d1 -> e5f9b2c8a4d6:
#
#   RestructureRun                        - header + rollup KPIs per generation
#     └── RestructureMove                 - one row per proposed move
#     └── RestructurePlan                 - named collections of accepted moves
#     └── RestructurePreservationConstraint - per-user, per-object hard pins
#
# See product_roadmap in memory + docstrings below for scope.


class RestructureMoveType(str, PyEnum):
    """The 7 move types v1 of the Restructure feature can propose.

    First two are object/field-level (touch PermissionSet only). The rest
    are record-level (touch the role hierarchy). Both matter — a client-
    facing restructure isn't complete without the role-hierarchy axis.
    """
    MERGE_PERMISSION_SETS = "MERGE_PERMISSION_SETS"
    RETIRE_UNUSED_PS = "RETIRE_UNUSED_PS"
    REASSIGN_TO_ROLE = "REASSIGN_TO_ROLE"
    MERGE_ROLES = "MERGE_ROLES"
    FLATTEN_ROLE_LEVEL = "FLATTEN_ROLE_LEVEL"
    REPARENT_ROLE = "REPARENT_ROLE"
    REASSIGN_MANAGER = "REASSIGN_MANAGER"


class RestructureMoveStatus(str, PyEnum):
    """Move review state. Consultant clicks Accept / Reject / Edit in the
    Studio UI; edited moves get their impact re-simulated.
    """
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EDITED = "edited"


class RestructurePlanStatus(str, PyEnum):
    """Plan lifecycle. A Studio can have multiple drafts (A vs B) but
    only one approved plan per run at a time.
    """
    DRAFT = "draft"
    APPROVED = "approved"
    ARCHIVED = "archived"


class RestructureRun(Base, TimestampMixin):
    """One row per POST /restructure/run. Header + rollup KPIs so the
    Studio's top strip renders from a single row, drilldown hangs off
    the `moves` relationship.

    Both `current_*` (org today) and `projected_*` (org after every
    proposed move is accepted) are stored on this row. The projected
    KPIs are the "if we did everything" ceiling — the consultant will
    typically accept a subset, but the ceiling is the top-of-page hook.
    """
    __tablename__ = "restructure_runs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Pinned GAEA state — the equity snapshot this run was scored
    # against. Nullable so runs made before the equity engine has ever
    # fired still work; they just won't have equity deltas to show.
    gaea_snapshot_id: Mapped[Optional[str]] = mapped_column(String(36))

    # 'running' | 'complete' | 'error' — the run isn't backgrounded in
    # v1 (Restructure runs are synchronous like Package Sprawl) but the
    # column is here for when we move to async.
    status: Mapped[str] = mapped_column(
        String(16), default="running", nullable=False
    )
    actor_email: Mapped[Optional[str]] = mapped_column(String(255))
    moves_generated: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    error: Mapped[Optional[str]] = mapped_column(Text)

    # Current-state KPIs at snapshot time (before any accepted moves).
    # equity_index nullable when GAEA hasn't ever run for this org.
    # monthly_license_cost nullable when we lack licence data.
    current_equity_index: Mapped[Optional[float]] = mapped_column(Float)
    current_ps_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    current_role_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    current_user_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    current_monthly_license_cost: Mapped[Optional[float]] = mapped_column(Float)

    # Projected KPIs — org if every proposed move were accepted.
    projected_equity_index: Mapped[Optional[float]] = mapped_column(Float)
    projected_ps_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    projected_role_count: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    projected_monthly_license_cost: Mapped[Optional[float]] = mapped_column(Float)

    # Free-form JSON — pattern-miner thresholds, probe sample size,
    # random seeds. Recorded so re-runs with identical config are
    # deterministic and post-hoc audits can see what knobs were used.
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    moves = relationship(
        "RestructureMove",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    plans = relationship(
        "RestructurePlan",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    constraints = relationship(
        "RestructurePreservationConstraint",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index(
            "ix_restructure_run_org_time",
            "organization_id", "snapshot_at",
        ),
    )


class RestructureMove(Base, TimestampMixin):
    """One row per proposed structural change on an org.

    Every field the Studio card needs lives here so the frontend renders
    without a second fetch. Deep-analysis (Option B bounded probing)
    columns are nullable until the on-demand probe endpoint has been hit
    for this move — the default view uses Option A symbolic scoring.
    """
    __tablename__ = "restructure_moves"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("restructure_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # One of RestructureMoveType. Stored as a string (not an Enum
    # column) so adding new move types in v2 doesn't require a
    # schema migration — the app-layer enum enforces validity.
    move_type: Mapped[str] = mapped_column(String(40), nullable=False)
    move_status: Mapped[str] = mapped_column(
        String(16), default="proposed", nullable=False
    )

    # Primary component (the "main" thing changed) + human-readable name.
    # For a MERGE_ROLES move this is the surviving role; for a
    # RETIRE_UNUSED_PS it's the PSet being dropped; and so on.
    primary_component_id: Mapped[Optional[str]] = mapped_column(String(64))
    primary_component_name: Mapped[Optional[str]] = mapped_column(String(255))
    # SF IDs of every other component + user this move touches.
    affected_component_ids: Mapped[list] = mapped_column(JSON, default=list)
    affected_user_ids: Mapped[list] = mapped_column(JSON, default=list)

    # Access-preservation percentages (0-100). Object-level and field-
    # level tracked separately because a merge that preserves object
    # access can still change field-level FLS in edge cases.
    object_access_preserved_pct: Mapped[Optional[float]] = mapped_column(Float)
    field_access_preserved_pct: Mapped[Optional[float]] = mapped_column(Float)

    # Impact deltas. Sign conventions in the docstring on their columns
    # in the migration; short version:
    #   equity_delta       > 0  = move improves equity
    #   cost_delta_monthly < 0  = move saves the client money
    #   complexity_delta   < 0  = fewer PSets / roles to manage
    equity_delta: Mapped[Optional[float]] = mapped_column(Float)
    cost_delta_monthly: Mapped[Optional[float]] = mapped_column(Float)
    complexity_delta: Mapped[Optional[int]] = mapped_column(Integer)
    sharing_rules_simplified: Mapped[Optional[int]] = mapped_column(Integer)

    # Blast tier + score (mirrors the change-risk-radar model).
    blast_tier: Mapped[str] = mapped_column(
        String(16), default="low", nullable=False
    )
    blast_score: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False
    )

    # Option B deep-analysis fields. NULL until the on-demand endpoint
    # /moves/{id}/deep-analyze has been hit for this row. When populated,
    # gives the consultant concrete counts like "user X will lose
    # visibility of ~2,400 Opportunities".
    records_gained_by_object: Mapped[Optional[dict]] = mapped_column(JSON)
    records_lost_by_object: Mapped[Optional[dict]] = mapped_column(JSON)
    deep_analysis_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    probe_sample_size: Mapped[Optional[int]] = mapped_column(Integer)

    # Which preservation constraints this move violates if accepted.
    # Surfaced on the move card as a red badge; blocks Accept if any
    # element is non-empty (consultant must waive to proceed).
    constraint_violations: Mapped[list] = mapped_column(JSON, default=list)

    rationale: Mapped[Optional[str]] = mapped_column(Text)
    consultant_notes: Mapped[Optional[str]] = mapped_column(Text)

    run = relationship("RestructureRun", back_populates="moves")

    __table_args__ = (
        Index("ix_restructure_move_run", "run_id"),
        Index(
            "ix_restructure_move_run_type_status",
            "run_id", "move_type", "move_status",
        ),
    )


class RestructurePlan(Base, TimestampMixin):
    """A named, ordered collection of accepted moves.

    Consultants can maintain multiple drafts per run (Plan A / Plan B)
    to explore trade-offs before committing to one. The `accepted_move_ids`
    list preserves the order the consultant chose for execution — the
    export sequences the manual Setup steps in that order.
    """
    __tablename__ = "restructure_plans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("restructure_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default="draft", nullable=False
    )
    # Ordered list of RestructureMove IDs. JSON so we don't need a
    # join-table for what's really a list-per-plan. Order matters —
    # this is the execution sequence.
    accepted_move_ids: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(255))
    updated_by: Mapped[Optional[str]] = mapped_column(String(255))

    run = relationship("RestructureRun", back_populates="plans")

    __table_args__ = (
        Index("ix_restructure_plan_run", "run_id"),
    )


class RestructurePreservationConstraint(Base, TimestampMixin):
    """Per-user, per-object hard pin.

    "Priya must retain Account object access." Populated by the
    consultant in the Studio UI. When a proposed move would violate a
    constraint, the move row gets that constraint's ID in
    `constraint_violations`, blocking Accept until the consultant
    explicitly waives.

    Per-user, per-record granularity is a v2 addition — see
    future_v2_items in memory for context.
    """
    __tablename__ = "restructure_preservation_constraints"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("restructure_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_sf_id: Mapped[str] = mapped_column(String(18), nullable=False)
    object_type: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(255))

    run = relationship("RestructureRun", back_populates="constraints")

    __table_args__ = (
        Index("ix_restructure_constraint_run", "run_id"),
        UniqueConstraint(
            "run_id", "user_sf_id", "object_type",
            name="uq_restructure_constraint_run_user_object",
        ),
    )


# ---------------------------------------------------------------------------
# Compliance Scorecards (Roadmap #8)
# ---------------------------------------------------------------------------
# One row per (org, framework, run). The results blob is the full
# per-control payload — passed/failed, metric, evidence bullets,
# recommendation, deep-link. Kept in a single JSON column instead of a
# child table so a run is atomic and the frontend renders in one query.


class ComplianceScorecardRun(Base, TimestampMixin):
    """One run of the Compliance Scorecard for a given framework."""
    __tablename__ = "compliance_scorecard_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # SOX / SOC2 / HIPAA / GDPR / PCI. Kept as a string so we can add
    # more frameworks (ISO 27001, NIST CSF, etc.) without a migration.
    framework: Mapped[str] = mapped_column(String(20), nullable=False)

    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
    )
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    actor_email: Mapped[Optional[str]] = mapped_column(String(255))

    # Roll-up counts. The frontend header ("18 / 22 controls passing")
    # reads these; the per-control detail comes from `results`.
    controls_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_passed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    controls_not_applicable: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # results: List[{control_id, name, passed, status, metric,
    #   metric_value, evidence, recommendation, deep_link,
    #   category, severity}]
    results: Mapped[list] = mapped_column(JSON, default=list)

    __table_args__ = (
        Index("ix_compliance_run_org", "organization_id"),
        Index("ix_compliance_run_framework", "framework"),
        Index("ix_compliance_run_snapshot", "snapshot_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<ComplianceScorecardRun(framework={self.framework}, "
            f"score={self.score_pct:.1f}%, "
            f"{self.controls_passed}/{self.controls_total} passed)>"
        )
