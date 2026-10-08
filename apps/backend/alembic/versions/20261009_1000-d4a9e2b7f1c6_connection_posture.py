"""salesforce_connections.connected_as

Revision ID: d4a9e2b7f1c6
Revises: c3f8a1d6e2b4
Create Date: 2026-10-09 10:00:00.000000

Records which Salesforce user authorised each client-org connection and
whether that user holds elevated permissions, so Newton can steer clients
toward a read-only integration user.
"""
from alembic import op
import sqlalchemy as sa


revision = "d4a9e2b7f1c6"
down_revision = "c3f8a1d6e2b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("salesforce_connections", sa.Column("connected_as", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("salesforce_connections", "connected_as")
