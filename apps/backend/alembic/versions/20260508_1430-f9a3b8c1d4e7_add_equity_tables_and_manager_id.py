"""add_equity_tables_and_manager_id

Revision ID: f9a3b8c1d4e7
Revises: e7d2c1f4a8b6
Create Date: 2026-05-08 14:30:00.000000

Adds the schema for the RL-driven equity recommendations track:
  - users_snapshot.manager_id (User.ManagerId from Salesforce, single
    targeted addition to enable v1 of the equity policy's R definition)
  - vip_designations: admin overrides for the VIP set (pin/unpin)
  - equity_snapshots: per-run diagnostic metrics (Equity Index, per-dept
    utilities, edge-type counts) feeding the equity dashboard

The RecommendationType enum gains a new value ('grant_for_equity'); since
the column is stored as a String/Enum with native_enum=False, no DB-level
DDL is required for the enum extension itself — the new value just
becomes valid at the application layer.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f9a3b8c1d4e7'
down_revision: Union[str, None] = 'e7d2c1f4a8b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) manager_id column on users_snapshot (FK is logical, not enforced —
    # mirrors profile_id/user_role_id which are also bare salesforce_id refs)
    op.add_column(
        'users_snapshot',
        sa.Column('manager_id', sa.String(length=18), nullable=True),
    )
    op.create_index('ix_user_manager', 'users_snapshot', ['manager_id'])

    # 2) vip_designations
    op.create_table(
        'vip_designations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_sf_id', sa.String(length=18), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('designated_by', sa.String(length=36), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('organization_id', 'user_sf_id', name='uq_vip_designation_org_user'),
    )
    op.create_index('ix_vip_designation_org', 'vip_designations', ['organization_id'])

    # 3) equity_snapshots
    op.create_table(
        'equity_snapshots',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('organization_id', sa.String(length=36),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('snapshot_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('equity_index', sa.Float(), nullable=False),
        sa.Column('disparity', sa.Float(), nullable=False),
        sa.Column('most_disadvantaged_group', sa.String(length=255), nullable=True),
        sa.Column('vip_count', sa.Integer(), nullable=False),
        sa.Column('per_dept_utilities', sa.JSON(), nullable=True),
        sa.Column('edge_type_counts', sa.JSON(), nullable=True),
        sa.Column('raw_metrics', sa.JSON(), nullable=True),
        sa.Column('recommendations_generated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        'ix_equity_snapshot_org_time',
        'equity_snapshots',
        ['organization_id', 'snapshot_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_equity_snapshot_org_time', table_name='equity_snapshots')
    op.drop_table('equity_snapshots')
    op.drop_index('ix_vip_designation_org', table_name='vip_designations')
    op.drop_table('vip_designations')
    op.drop_index('ix_user_manager', table_name='users_snapshot')
    op.drop_column('users_snapshot', 'manager_id')
