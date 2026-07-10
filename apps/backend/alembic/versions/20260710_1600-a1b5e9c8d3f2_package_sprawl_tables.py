"""package_sprawl_tables

Revision ID: a1b5e9c8d3f2
Revises: f8c3d2b1a4e6
Create Date: 2026-07-10 16:00:00.000000

Adds two tables for the Managed-Package Sprawl feature:

  - package_sprawl_runs
      One row per pull. Header + rollups.
  - installed_packages
      One row per installed managed package for a given run.

Strictly additive — no existing table or column touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b5e9c8d3f2'
down_revision: Union[str, None] = 'f8c3d2b1a4e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'package_sprawl_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('snapshot_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('packages_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('packages_active', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'packages_underused', sa.Integer(), nullable=False, server_default='0'
        ),
        sa.Column('packages_unused', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'avg_utilization_pct', sa.Float(), nullable=False, server_default='0'
        ),
        sa.Column(
            'total_licenses_allowed', sa.Integer(), nullable=False, server_default='0'
        ),
        sa.Column(
            'total_licenses_used', sa.Integer(), nullable=False, server_default='0'
        ),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
    )
    op.create_index(
        'ix_package_sprawl_run_org_time',
        'package_sprawl_runs',
        ['organization_id', 'snapshot_at'],
    )

    op.create_table(
        'installed_packages',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'run_id',
            sa.String(length=36),
            sa.ForeignKey('package_sprawl_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('sf_package_id', sa.String(length=18), nullable=False),
        sa.Column('sf_version_id', sa.String(length=18), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('namespace_prefix', sa.String(length=120), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('version_name', sa.String(length=255), nullable=True),
        sa.Column('version_number', sa.String(length=60), nullable=True),
        sa.Column('is_beta', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            'is_deprecated', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            'is_managed', sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            'apex_class_count', sa.Integer(), nullable=False, server_default='0'
        ),
        sa.Column('flow_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'custom_object_count', sa.Integer(), nullable=False, server_default='0'
        ),
        sa.Column('licenses_allowed', sa.Integer(), nullable=True),
        sa.Column('licenses_used', sa.Integer(), nullable=True),
        sa.Column(
            'utilization_tier',
            sa.String(length=16),
            nullable=False,
            server_default='unused',
        ),
        sa.Column('evidence', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.UniqueConstraint(
            'run_id', 'sf_package_id', name='uq_installed_package_run_sfid'
        ),
    )
    op.create_index(
        'ix_installed_package_org_run',
        'installed_packages',
        ['organization_id', 'run_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_installed_package_org_run', table_name='installed_packages'
    )
    op.drop_table('installed_packages')
    op.drop_index(
        'ix_package_sprawl_run_org_time', table_name='package_sprawl_runs'
    )
    op.drop_table('package_sprawl_runs')
