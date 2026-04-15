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

from app.db.base import Base, TimestampMixin


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
    access_token: Mapped[Optional[str]] = mapped_column(Text)  # TODO: Encrypt in production
    refresh_token: Mapped[Optional[str]] = mapped_column(Text)  # TODO: Encrypt in production
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


class AuditLog(Base, TimestampMixin):
    """Audit log for key operations"""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"))

    action: Mapped[str] = mapped_column(String(100), nullable=False)  # sync_started, analysis_run, etc.
    actor: Mapped[Optional[str]] = mapped_column(String(100))  # user or system
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_audit_org", "organization_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_timestamp", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog(action={self.action}, timestamp={self.timestamp})>"
