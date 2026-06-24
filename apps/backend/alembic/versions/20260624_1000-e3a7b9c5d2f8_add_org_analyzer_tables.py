"""add_org_analyzer_tables

Revision ID: e3a7b9c5d2f8
Revises: d2f8b1a5c6e3
Create Date: 2026-06-24 10:00:00.000000

Org Analyzer feature — fourth analysis track alongside Anomaly, Risk,
Equity. Adds four tables:

  - org_analysis_snapshots — one row per analyzer run, carries headline
    counts + raw /limits payload + free-form metrics for trends
  - org_findings — one row per finding within a snapshot, polymorphic
    via FindingCategory + free-form `code` string for new rules
  - license_price_book — per-org license SKU → monthly cost cents,
    drives the dollar-impact estimates on license-waste findings
  - org_analyzer_runs — operational log of analyzer runs

Strictly additive. No existing tables touched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e3a7b9c5d2f8'
down_revision: Union[str, None] = 'd2f8b1a5c6e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ----- org_analysis_snapshots -----
    op.create_table(
        'org_analysis_snapshots',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('snapshot_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('findings_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('findings_by_severity', sa.JSON(), nullable=True),
        sa.Column('findings_by_category', sa.JSON(), nullable=True),
        sa.Column(
            'total_estimated_annual_savings_cents',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
        sa.Column('org_limits', sa.JSON(), nullable=True),
        sa.Column('metrics', sa.JSON(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
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
        'ix_org_analysis_snapshot_org_time',
        'org_analysis_snapshots',
        ['organization_id', 'snapshot_at'],
    )

    # ----- org_findings -----
    op.create_table(
        'org_findings',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'snapshot_id',
            sa.String(length=36),
            sa.ForeignKey('org_analysis_snapshots.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('category', sa.String(length=30), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('recommended_action', sa.Text(), nullable=True),
        sa.Column('affected_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_annual_savings_cents', sa.Integer(), nullable=True),
        sa.Column('evidence', sa.JSON(), nullable=True),
        sa.Column('sf_setup_deeplink', sa.String(length=500), nullable=True),
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
        'ix_org_finding_snapshot_category',
        'org_findings',
        ['organization_id', 'snapshot_id', 'category'],
    )
    op.create_index('ix_org_finding_severity', 'org_findings', ['severity'])

    # ----- license_price_book -----
    op.create_table(
        'license_price_book',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('license_name', sa.String(length=100), nullable=False),
        sa.Column('monthly_cost_cents', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.String(length=255), nullable=True),
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
            'organization_id', 'license_name', name='uq_price_book_org_license'
        ),
    )

    # ----- org_analyzer_runs -----
    op.create_table(
        'org_analyzer_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'snapshot_id',
            sa.String(length=36),
            sa.ForeignKey('org_analysis_snapshots.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
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
        'ix_analyzer_run_org_time',
        'org_analyzer_runs',
        ['organization_id', 'started_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_analyzer_run_org_time', table_name='org_analyzer_runs')
    op.drop_table('org_analyzer_runs')
    op.drop_table('license_price_book')
    op.drop_index('ix_org_finding_severity', table_name='org_findings')
    op.drop_index('ix_org_finding_snapshot_category', table_name='org_findings')
    op.drop_table('org_findings')
    op.drop_index(
        'ix_org_analysis_snapshot_org_time', table_name='org_analysis_snapshots'
    )
    op.drop_table('org_analysis_snapshots')
