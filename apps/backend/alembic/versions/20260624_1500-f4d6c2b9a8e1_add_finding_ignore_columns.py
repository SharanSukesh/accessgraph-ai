"""add_finding_ignore_columns

Revision ID: f4d6c2b9a8e1
Revises: e3a7b9c5d2f8
Create Date: 2026-06-24 15:00:00.000000

Lets a consultant flag a finding as intentional / known / out-of-scope
without permanently deleting it. Ignored findings:
  - hide by default in the dashboard (toggle reveals them)
  - drop out of the total-savings calculation
  - retain a `ignore_reason` text + actor for audit

Strictly additive — four nullable columns on org_findings.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4d6c2b9a8e1'
down_revision: Union[str, None] = 'e3a7b9c5d2f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'org_findings',
        sa.Column(
            'is_ignored', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        'org_findings',
        sa.Column('ignored_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'org_findings',
        sa.Column('ignored_by', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'org_findings',
        sa.Column('ignore_reason', sa.Text(), nullable=True),
    )
    op.create_index(
        'ix_org_finding_is_ignored',
        'org_findings',
        ['is_ignored'],
    )


def downgrade() -> None:
    op.drop_index('ix_org_finding_is_ignored', table_name='org_findings')
    op.drop_column('org_findings', 'ignore_reason')
    op.drop_column('org_findings', 'ignored_by')
    op.drop_column('org_findings', 'ignored_at')
    op.drop_column('org_findings', 'is_ignored')
