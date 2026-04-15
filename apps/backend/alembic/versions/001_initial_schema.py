"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-04-15 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create organizations table
    op.create_table(
        'organizations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('domain', sa.String(255)),
        sa.Column('is_demo', sa.Boolean, nullable=False, default=False),
        sa.Column('settings', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Create salesforce_connections table
    op.create_table(
        'salesforce_connections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('instance_url', sa.String(255), nullable=False),
        sa.Column('organization_id_sf', sa.String(18)),
        sa.Column('access_token', sa.Text),
        sa.Column('refresh_token', sa.Text),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_sf_conn_org', 'salesforce_connections', ['organization_id'])

    # Create sync_jobs table
    op.create_table(
        'sync_jobs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.Column('error_message', sa.Text),
        sa.Column('sync_metadata', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_sync_job_org', 'sync_jobs', ['organization_id'])
    op.create_index('ix_sync_job_status', 'sync_jobs', ['status'])

    # Create users_snapshot table
    op.create_table(
        'users_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255)),
        sa.Column('user_type', sa.String(50)),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('profile_id', sa.String(18)),
        sa.Column('user_role_id', sa.String(18)),
        sa.Column('department', sa.String(255)),
        sa.Column('title', sa.String(255)),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_user_org_sf_id'),
    )
    op.create_index('ix_user_org', 'users_snapshot', ['organization_id'])
    op.create_index('ix_user_sf_id', 'users_snapshot', ['salesforce_id'])
    op.create_index('ix_user_profile', 'users_snapshot', ['profile_id'])
    op.create_index('ix_user_role', 'users_snapshot', ['user_role_id'])

    # Create roles_snapshot table
    op.create_table(
        'roles_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('parent_role_id', sa.String(18)),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_role_org_sf_id'),
    )
    op.create_index('ix_role_org', 'roles_snapshot', ['organization_id'])

    # Create profiles_snapshot table
    op.create_table(
        'profiles_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_profile_org_sf_id'),
    )
    op.create_index('ix_profile_org', 'profiles_snapshot', ['organization_id'])

    # Create permission_sets_snapshot table
    op.create_table(
        'permission_sets_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('label', sa.String(255), nullable=False),
        sa.Column('is_owned_by_profile', sa.Boolean, nullable=False, default=False),
        sa.Column('profile_id', sa.String(18)),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_ps_org_sf_id'),
    )
    op.create_index('ix_ps_org', 'permission_sets_snapshot', ['organization_id'])
    op.create_index('ix_ps_profile', 'permission_sets_snapshot', ['profile_id'])

    # Create permission_set_assignments_snapshot table
    op.create_table(
        'permission_set_assignments_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('assignee_id', sa.String(18), nullable=False),
        sa.Column('permission_set_id', sa.String(18), nullable=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_psa_org_sf_id'),
    )
    op.create_index('ix_psa_org', 'permission_set_assignments_snapshot', ['organization_id'])
    op.create_index('ix_psa_assignee', 'permission_set_assignments_snapshot', ['assignee_id'])
    op.create_index('ix_psa_ps', 'permission_set_assignments_snapshot', ['permission_set_id'])

    # Create permission_set_groups_snapshot table
    op.create_table(
        'permission_set_groups_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('developer_name', sa.String(255), nullable=False),
        sa.Column('master_label', sa.String(255), nullable=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_psg_org_sf_id'),
    )
    op.create_index('ix_psg_org', 'permission_set_groups_snapshot', ['organization_id'])

    # Create permission_set_group_components_snapshot table
    op.create_table(
        'permission_set_group_components_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('permission_set_group_id', sa.String(18), nullable=False),
        sa.Column('permission_set_id', sa.String(18), nullable=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_psgc_org_sf_id'),
    )
    op.create_index('ix_psgc_org', 'permission_set_group_components_snapshot', ['organization_id'])
    op.create_index('ix_psgc_psg', 'permission_set_group_components_snapshot', ['permission_set_group_id'])

    # Create object_permissions_snapshot table
    op.create_table(
        'object_permissions_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('parent_id', sa.String(18), nullable=False),
        sa.Column('sobject_type', sa.String(255), nullable=False),
        sa.Column('permissions_read', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_create', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_edit', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_delete', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_view_all_records', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_modify_all_records', sa.Boolean, nullable=False, default=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_objperm_org_sf_id'),
    )
    op.create_index('ix_objperm_org', 'object_permissions_snapshot', ['organization_id'])
    op.create_index('ix_objperm_parent', 'object_permissions_snapshot', ['parent_id'])
    op.create_index('ix_objperm_object', 'object_permissions_snapshot', ['sobject_type'])

    # Create field_permissions_snapshot table
    op.create_table(
        'field_permissions_snapshot',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sync_job_id', sa.String(36), sa.ForeignKey('sync_jobs.id', ondelete='SET NULL')),
        sa.Column('salesforce_id', sa.String(18), nullable=False),
        sa.Column('parent_id', sa.String(18), nullable=False),
        sa.Column('sobject_type', sa.String(255), nullable=False),
        sa.Column('field', sa.String(255), nullable=False),
        sa.Column('permissions_read', sa.Boolean, nullable=False, default=False),
        sa.Column('permissions_edit', sa.Boolean, nullable=False, default=False),
        sa.Column('raw_data', sa.JSON, nullable=False, default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('organization_id', 'salesforce_id', name='uq_fldperm_org_sf_id'),
    )
    op.create_index('ix_fldperm_org', 'field_permissions_snapshot', ['organization_id'])
    op.create_index('ix_fldperm_parent', 'field_permissions_snapshot', ['parent_id'])
    op.create_index('ix_fldperm_field', 'field_permissions_snapshot', ['field'])

    # Create access_anomalies table
    op.create_table(
        'access_anomalies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(18), nullable=False),
        sa.Column('anomaly_score', sa.Float, nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('reasons', sa.JSON, nullable=False, default=[]),
        sa.Column('features', sa.JSON, nullable=False, default={}),
        sa.Column('peer_stats', sa.JSON, nullable=False, default={}),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_anomaly_org', 'access_anomalies', ['organization_id'])
    op.create_index('ix_anomaly_user', 'access_anomalies', ['user_id'])
    op.create_index('ix_anomaly_severity', 'access_anomalies', ['severity'])
    op.create_index('ix_anomaly_score', 'access_anomalies', ['anomaly_score'])

    # Create risk_scores table
    op.create_table(
        'risk_scores',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(18), nullable=False),
        sa.Column('risk_score', sa.Float, nullable=False),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('factors', sa.JSON, nullable=False, default=[]),
        sa.Column('reason_text', sa.Text, nullable=False),
        sa.Column('calculated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_risk_org', 'risk_scores', ['organization_id'])
    op.create_index('ix_risk_entity', 'risk_scores', ['entity_type', 'entity_id'])
    op.create_index('ix_risk_level', 'risk_scores', ['risk_level'])
    op.create_index('ix_risk_score', 'risk_scores', ['risk_score'])

    # Create recommendations table
    op.create_table(
        'recommendations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rec_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('target_entity_type', sa.String(50), nullable=False),
        sa.Column('target_entity_id', sa.String(18), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('rationale', sa.Text, nullable=False),
        sa.Column('impact_summary', sa.JSON, nullable=False, default={}),
        sa.Column('affected_access', sa.JSON, nullable=False, default={}),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_rec_org', 'recommendations', ['organization_id'])
    op.create_index('ix_rec_target', 'recommendations', ['target_entity_type', 'target_entity_id'])
    op.create_index('ix_rec_type', 'recommendations', ['rec_type'])
    op.create_index('ix_rec_status', 'recommendations', ['status'])
    op.create_index('ix_rec_severity', 'recommendations', ['severity'])

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('organization_id', sa.String(36), sa.ForeignKey('organizations.id', ondelete='CASCADE')),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('actor', sa.String(100)),
        sa.Column('details', sa.JSON, nullable=False, default={}),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_audit_org', 'audit_logs', ['organization_id'])
    op.create_index('ix_audit_action', 'audit_logs', ['action'])
    op.create_index('ix_audit_timestamp', 'audit_logs', ['timestamp'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('recommendations')
    op.drop_table('risk_scores')
    op.drop_table('access_anomalies')
    op.drop_table('field_permissions_snapshot')
    op.drop_table('object_permissions_snapshot')
    op.drop_table('permission_set_group_components_snapshot')
    op.drop_table('permission_set_groups_snapshot')
    op.drop_table('permission_set_assignments_snapshot')
    op.drop_table('permission_sets_snapshot')
    op.drop_table('profiles_snapshot')
    op.drop_table('roles_snapshot')
    op.drop_table('users_snapshot')
    op.drop_table('sync_jobs')
    op.drop_table('salesforce_connections')
    op.drop_table('organizations')
