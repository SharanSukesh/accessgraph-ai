"""add_track_column_to_recommendations

Revision ID: b6e4f7a9c2d5
Revises: a4b2c5d8e1f3
Create Date: 2026-05-12 11:00:00.000000

Adds a `track` column to recommendations so the UI can group rows into
high-level buckets (SECURITY vs EQUITY) without inferring from rec_type
strings.

  - SECURITY: existing rule-based anomaly/risk recs. Action is revoke
    or review. Severity ranges Low → Critical. Surfaces in the existing
    Recommendations page + Anomalies page.
  - EQUITY:  GAEA-driven equity recommendations (rec_type =
    grant_for_equity). Action is grant. Severity always Info. Surfaces
    in the dedicated Equity dashboard page.

Existing rows are backfilled in a single pass:
  rec_type = 'grant_for_equity'  → track = 'equity'
  otherwise                       → track = 'security'

After backfill the column is set NOT NULL and a default of 'security'
is attached so callers that don't set it explicitly still land in the
security track. This matches the SQLAlchemy model.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6e4f7a9c2d5'
down_revision: Union[str, None] = 'a4b2c5d8e1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add nullable first so we can backfill before tightening to NOT NULL.
    op.add_column(
        'recommendations',
        sa.Column('track', sa.String(length=20), nullable=True),
    )

    # Backfill: GAEA recs → equity, everything else → security.
    op.execute(
        "UPDATE recommendations SET track = 'equity' "
        "WHERE rec_type = 'grant_for_equity'"
    )
    op.execute(
        "UPDATE recommendations SET track = 'security' "
        "WHERE track IS NULL"
    )

    # Tighten to NOT NULL with default 'security'. Wrap in batch_alter_table
    # so SQLite (which can't ALTER COLUMN in place) takes the recreate-table
    # path; Postgres still uses the direct ALTER.
    with op.batch_alter_table('recommendations') as batch_op:
        batch_op.alter_column(
            'track',
            existing_type=sa.String(length=20),
            nullable=False,
            server_default='security',
        )

    op.create_index('ix_rec_track', 'recommendations', ['track'])


def downgrade() -> None:
    op.drop_index('ix_rec_track', table_name='recommendations')
    with op.batch_alter_table('recommendations') as batch_op:
        batch_op.drop_column('track')
