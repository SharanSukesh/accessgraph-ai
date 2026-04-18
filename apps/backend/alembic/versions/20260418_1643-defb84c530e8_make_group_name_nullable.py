"""make_group_name_nullable

Revision ID: defb84c530e8
Revises: e2af425a8407
Create Date: 2026-04-18 16:43:36.994815

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'defb84c530e8'
down_revision: Union[str, None] = 'e2af425a8407'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make name column nullable in group_snapshots table
    op.alter_column('group_snapshots', 'name',
                    existing_type=sa.String(length=255),
                    nullable=True)


def downgrade() -> None:
    # Revert: make name column non-nullable
    op.alter_column('group_snapshots', 'name',
                    existing_type=sa.String(length=255),
                    nullable=False)
