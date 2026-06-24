"""add_price_book_is_billed

Revision ID: b8e3f1d7c4a2
Revises: a7c4f2d8b3e9
Create Date: 2026-06-25 09:00:00.000000

Per-row "Billed" override on the license price book. Drives the Org
Analyzer's hard suppression of savings for bundled / not-actually-billed
SKUs. Default true so behavior is unchanged for existing rows.

Strictly additive — one boolean column with a safe default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e3f1d7c4a2'
down_revision: Union[str, None] = 'a7c4f2d8b3e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'license_price_book',
        sa.Column(
            'is_billed',
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column('license_price_book', 'is_billed')
