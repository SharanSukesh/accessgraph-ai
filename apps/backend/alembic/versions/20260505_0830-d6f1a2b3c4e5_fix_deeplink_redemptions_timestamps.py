"""fix_deeplink_redemptions_timestamps

Revision ID: d6f1a2b3c4e5
Revises: c5e7f3a8b9d4
Create Date: 2026-05-05 08:30:00.000000

The original deeplink_redemptions migration created created_at / updated_at
as NOT NULL with no server_default. The model declares them with
server_default=func.now() via TimestampMixin, but ORM-generated INSERTs
omit those columns expecting the DB to provide the default. Without the
default, every redemption INSERT fails with NotNullViolation
(IntegrityError subclass), which our code path treats as a duplicate jti
and returns 410.

This migration adds the defaults so future inserts succeed cleanly.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd6f1a2b3c4e5'
down_revision: Union[str, None] = 'c5e7f3a8b9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'deeplink_redemptions',
        'created_at',
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        'deeplink_redemptions',
        'updated_at',
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'deeplink_redemptions',
        'created_at',
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        'deeplink_redemptions',
        'updated_at',
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
