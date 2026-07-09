"""data_quality_tables

Revision ID: d7e4a1b6c8f0
Revises: c5d9e2f7b8a4
Create Date: 2026-07-10 10:00:00.000000

Adds two new tables for the per-object Data Quality Score feature:

  - data_quality_runs
      One row per computation. Header stats + config snapshot so old
      runs stay explainable when the defaults change.
  - object_quality_scores
      One row per (run, object). Score + components + evidence blob.

Strictly additive — no existing tables or columns touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7e4a1b6c8f0'
down_revision: Union[str, None] = 'c5d9e2f7b8a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'data_quality_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('snapshot_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('objects_analyzed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('objects_skipped', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('avg_completeness', sa.Float(), nullable=False, server_default='0'),
        sa.Column('avg_duplicate_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('avg_staleness_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('sample_size', sa.Integer(), nullable=False, server_default='500'),
        sa.Column(
            'staleness_threshold_days', sa.Integer(), nullable=False, server_default='180'
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
        'ix_data_quality_run_org_time',
        'data_quality_runs',
        ['organization_id', 'snapshot_at'],
    )

    op.create_table(
        'object_quality_scores',
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
            sa.ForeignKey('data_quality_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('object_name', sa.String(length=80), nullable=False),
        sa.Column('object_label', sa.String(length=255), nullable=False),
        sa.Column('is_custom', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('record_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sampled_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('completeness_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('duplicate_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('staleness_pct', sa.Float(), nullable=False, server_default='0'),
        sa.Column('fields_inspected', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('fields_with_gaps', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duplicate_clusters', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('stale_record_count', sa.Integer(), nullable=False, server_default='0'),
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
        sa.UniqueConstraint('run_id', 'object_name', name='uq_obj_quality_run_object'),
    )
    op.create_index(
        'ix_obj_quality_org_run_object',
        'object_quality_scores',
        ['organization_id', 'run_id', 'object_name'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_obj_quality_org_run_object', table_name='object_quality_scores'
    )
    op.drop_table('object_quality_scores')
    op.drop_index('ix_data_quality_run_org_time', table_name='data_quality_runs')
    op.drop_table('data_quality_runs')
