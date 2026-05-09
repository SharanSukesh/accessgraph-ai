"""fix_equity_table_timestamp_defaults

Revision ID: a4b2c5d8e1f3
Revises: f9a3b8c1d4e7
Create Date: 2026-05-09 21:10:00.000000

The previous migration (f9a3b8c1d4e7) created equity_snapshots and
vip_designations with `created_at`/`updated_at` columns marked NOT NULL
but without `server_default=NOW()`. The TimestampMixin on the SQLAlchemy
model defines server_default, but server_default only fires when SQLAlchemy
itself creates the table from metadata — alembic op.create_table needs the
default repeated explicitly. Result: any INSERT that omits the timestamps
fails on Postgres with a NotNullViolation.

The application-side fix (set created_at/updated_at explicitly in
EquityRecommendationService) is enough to unblock today, but this migration
is the proper long-term repair so the tables match every other timestamped
table in the schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4b2c5d8e1f3'
down_revision: Union[str, None] = 'f9a3b8c1d4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres-specific syntax. SQLite is not affected since SQLite already
    # tolerates NULL timestamps when no default is set (column behavior
    # diverges from Postgres). Production runs Postgres, so this is the
    # only env that needs the fix.
    for table in ("equity_snapshots", "vip_designations"):
        op.alter_column(
            table, "created_at",
            server_default=sa.text("now()"),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        op.alter_column(
            table, "updated_at",
            server_default=sa.text("now()"),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )


def downgrade() -> None:
    for table in ("equity_snapshots", "vip_designations"):
        op.alter_column(
            table, "created_at",
            server_default=None,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
        op.alter_column(
            table, "updated_at",
            server_default=None,
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )
