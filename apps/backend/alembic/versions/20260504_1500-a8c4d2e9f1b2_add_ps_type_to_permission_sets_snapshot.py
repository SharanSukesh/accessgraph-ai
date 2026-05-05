"""add_ps_type_to_permission_sets_snapshot

Revision ID: a8c4d2e9f1b2
Revises: 7df734125b01
Create Date: 2026-05-04 15:00:00.000000

Adds a ps_type column to permission_sets_snapshot to distinguish muting
permission sets (Type='Muting') from regular ones. Backfills NULL — old
rows synced before this change have no Type in their raw_data because
the SOQL didn't pull it. A re-sync populates the column for existing
customer orgs. NULL is treated as 'Regular' downstream.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8c4d2e9f1b2'
down_revision: Union[str, None] = '7df734125b01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'permission_sets_snapshot',
        sa.Column('ps_type', sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('permission_sets_snapshot', 'ps_type')
