"""org_analyzer_v18_polish_schema

Revision ID: c5d9e2f7b8a4
Revises: b8e3f1d7c4a2
Create Date: 2026-06-26 10:00:00.000000

v1.8 polish bundle — three additive schema changes:
  - org_analysis_snapshots.executive_summary  (Text, nullable)
      Plain-English paragraph composed at run time; surfaced on the
      Org Analyzer Overview tab + PDF cover page.
  - org_findings.is_resolved / resolved_at / resolved_by  (Boolean + audit)
      Mirrors the existing is_ignored shape. Set by the "Apply fix"
      Salesforce write-back endpoint when a finding has been actioned.
  - brand_settings  (new table, one row per organization)
      Per-org firm logo + accent color for white-labeling the PDF.
      logo bytes stored on the row to keep deployment simple (no
      object-store dep).

Strictly additive — nothing changes existing behaviour.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d9e2f7b8a4'
down_revision: Union[str, None] = 'b8e3f1d7c4a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'org_analysis_snapshots',
        sa.Column('executive_summary', sa.Text(), nullable=True),
    )

    op.add_column(
        'org_findings',
        sa.Column(
            'is_resolved', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        'org_findings',
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'org_findings',
        sa.Column('resolved_by', sa.String(length=255), nullable=True),
    )
    op.create_index(
        'ix_org_finding_is_resolved',
        'org_findings',
        ['is_resolved'],
    )

    op.create_table(
        'brand_settings',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
            unique=True,
        ),
        sa.Column('firm_name', sa.String(length=255), nullable=True),
        sa.Column('accent_hex', sa.String(length=7), nullable=True),
        sa.Column('logo_bytes', sa.LargeBinary(), nullable=True),
        sa.Column('logo_mime', sa.String(length=64), nullable=True),
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
    )


def downgrade() -> None:
    op.drop_table('brand_settings')
    op.drop_index('ix_org_finding_is_resolved', table_name='org_findings')
    op.drop_column('org_findings', 'resolved_by')
    op.drop_column('org_findings', 'resolved_at')
    op.drop_column('org_findings', 'is_resolved')
    op.drop_column('org_analysis_snapshots', 'executive_summary')
