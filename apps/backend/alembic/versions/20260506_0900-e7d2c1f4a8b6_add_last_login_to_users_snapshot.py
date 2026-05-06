"""add_last_login_to_users_snapshot

Revision ID: e7d2c1f4a8b6
Revises: d6f1a2b3c4e5
Create Date: 2026-05-06 09:00:00.000000

Adds last_login_at column to users_snapshot. Powers the
last_login_days_ago feature in the v2 anomaly detector — closes the
DORMANT_POWERFUL blind spot identified in REPORT.md § 7.2.

Nullable because:
  - some users genuinely never logged in (rare but real)
  - existing snapshot rows from pre-v2 syncs have no LastLoginDate yet;
    they get populated on next sync. The detector treats NULL as "very
    long time ago" so dormancy is the conservative default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7d2c1f4a8b6'
down_revision: Union[str, None] = 'd6f1a2b3c4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users_snapshot',
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users_snapshot', 'last_login_at')
