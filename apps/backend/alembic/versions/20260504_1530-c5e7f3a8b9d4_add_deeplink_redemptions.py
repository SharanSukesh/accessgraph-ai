"""add_deeplink_redemptions

Revision ID: c5e7f3a8b9d4
Revises: a8c4d2e9f1b2
Create Date: 2026-05-04 15:30:00.000000

Records redemption of deep-link JWTs issued to managed-package Setup-page
quick actions. Used to prevent replay: a token can only be redeemed once.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5e7f3a8b9d4'
down_revision: Union[str, None] = 'a8c4d2e9f1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'deeplink_redemptions',
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('organization_id', sa.String(length=36), nullable=False),
        sa.Column('sf_user_id', sa.String(length=18), nullable=False),
        sa.Column('resource_type', sa.String(length=32), nullable=False),
        sa.Column('resource_id', sa.String(length=255), nullable=False),
        sa.Column('redeemed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ['organization_id'], ['organizations.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('jti'),
    )
    op.create_index(
        'ix_deeplink_redemptions_org',
        'deeplink_redemptions',
        ['organization_id'],
    )
    op.create_index(
        'ix_deeplink_redemptions_expires',
        'deeplink_redemptions',
        ['expires_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_deeplink_redemptions_expires', table_name='deeplink_redemptions')
    op.drop_index('ix_deeplink_redemptions_org', table_name='deeplink_redemptions')
    op.drop_table('deeplink_redemptions')
