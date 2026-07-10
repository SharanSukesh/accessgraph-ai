"""change_audit_tables

Revision ID: f8c3d2b1a4e6
Revises: d7e4a1b6c8f0
Create Date: 2026-07-10 14:00:00.000000

Adds two tables for the Change-Risk Radar feature:

  - change_audit_runs
      One row per SetupAuditTrail pull. Header + rollups.
  - change_audit_events
      One row per SF audit event. Blast-radius score + tier.

Strictly additive — no existing table or column touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8c3d2b1a4e6'
down_revision: Union[str, None] = 'd7e4a1b6c8f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'change_audit_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('snapshot_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('since', sa.DateTime(timezone=True), nullable=False),
        sa.Column('events_ingested', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('high_blast_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unique_actors', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_blast_radius', sa.Float(), nullable=False, server_default='0'),
        sa.Column('rollups', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
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
        'ix_change_audit_run_org_time',
        'change_audit_runs',
        ['organization_id', 'snapshot_at'],
    )

    op.create_table(
        'change_audit_events',
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
            sa.ForeignKey('change_audit_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('sf_event_id', sa.String(length=18), nullable=False),
        sa.Column('created_at_sf', sa.DateTime(timezone=True), nullable=False),
        sa.Column('actor_id', sa.String(length=18), nullable=True),
        sa.Column('actor_name', sa.String(length=255), nullable=True),
        sa.Column('section', sa.String(length=120), nullable=True),
        sa.Column('action', sa.String(length=120), nullable=True),
        sa.Column('display', sa.Text(), nullable=False),
        sa.Column('delegate_user', sa.String(length=120), nullable=True),
        sa.Column('blast_radius', sa.Float(), nullable=False, server_default='0'),
        sa.Column(
            'blast_tier',
            sa.String(length=16),
            nullable=False,
            server_default='low',
        ),
        sa.Column('reasoning', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
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
            'run_id', 'sf_event_id', name='uq_change_audit_run_sfid'
        ),
    )
    op.create_index(
        'ix_change_audit_event_org_time',
        'change_audit_events',
        ['organization_id', 'created_at_sf'],
    )
    op.create_index(
        'ix_change_audit_event_run',
        'change_audit_events',
        ['run_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_change_audit_event_run', table_name='change_audit_events'
    )
    op.drop_index(
        'ix_change_audit_event_org_time', table_name='change_audit_events'
    )
    op.drop_table('change_audit_events')
    op.drop_index(
        'ix_change_audit_run_org_time', table_name='change_audit_runs'
    )
    op.drop_table('change_audit_runs')
