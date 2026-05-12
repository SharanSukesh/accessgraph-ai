"""fix_track_enum_casing

Revision ID: c8d3a6f1b4e9
Revises: b6e4f7a9c2d5
Create Date: 2026-05-12 18:30:00.000000

The previous migration (b6e4f7a9c2d5) backfilled `track` with lowercase
values ('security', 'equity') and set the server_default to 'security'.
But SQLAlchemy's Enum(RecommendationTrack, native_enum=False) stores
the enum *name* by default (uppercase: 'SECURITY' / 'EQUITY') and
raises LookupError on read when the stored value doesn't match a
name — same convention as rec_type, status, and severity in this
project.

This migration:
  - Coerces existing lowercase track values to uppercase enum names
  - Updates the server_default to 'SECURITY' (uppercase) to match

Idempotent on both fronts: CASE-based UPDATE only matches lowercase
rows, ALTER DEFAULT is a no-op if it already matches.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d3a6f1b4e9'
down_revision: Union[str, None] = 'b6e4f7a9c2d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE recommendations "
        "SET track = CASE "
        "    WHEN track = 'security' THEN 'SECURITY' "
        "    WHEN track = 'equity'   THEN 'EQUITY' "
        "    ELSE track END "
        "WHERE track IN ('security', 'equity')"
    )
    with op.batch_alter_table('recommendations') as batch_op:
        batch_op.alter_column(
            'track',
            existing_type=sa.String(length=20),
            existing_nullable=False,
            server_default='SECURITY',
        )


def downgrade() -> None:
    # Restore the lowercase convention if rolling back.
    with op.batch_alter_table('recommendations') as batch_op:
        batch_op.alter_column(
            'track',
            existing_type=sa.String(length=20),
            existing_nullable=False,
            server_default='security',
        )
    op.execute(
        "UPDATE recommendations "
        "SET track = CASE "
        "    WHEN track = 'SECURITY' THEN 'security' "
        "    WHEN track = 'EQUITY'   THEN 'equity' "
        "    ELSE track END "
        "WHERE track IN ('SECURITY', 'EQUITY')"
    )
