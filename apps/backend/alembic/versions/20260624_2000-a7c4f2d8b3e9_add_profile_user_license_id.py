"""add_profile_user_license_id

Revision ID: a7c4f2d8b3e9
Revises: f4d6c2b9a8e1
Create Date: 2026-06-24 20:00:00.000000

Adds Profile.UserLicenseId to the snapshot so the Org Analyzer can
attribute each user to their actual license SKU (Salesforce, Platform,
Chatter Free, …) instead of charging a flat $165/mo to everyone.

Strictly additive — one nullable column. Populated on next sync.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c4f2d8b3e9'
down_revision: Union[str, None] = 'f4d6c2b9a8e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'profiles_snapshot',
        sa.Column('user_license_id', sa.String(length=18), nullable=True),
    )
    op.create_index(
        'ix_profile_user_license',
        'profiles_snapshot',
        ['user_license_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_profile_user_license', table_name='profiles_snapshot')
    op.drop_column('profiles_snapshot', 'user_license_id')
