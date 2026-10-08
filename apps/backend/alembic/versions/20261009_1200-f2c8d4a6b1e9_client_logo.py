"""brand_settings client logo columns

Revision ID: f2c8d4a6b1e9
Revises: e7b2c5d8a3f1
Create Date: 2026-10-09 12:00:00.000000

Adds the client's logo next to the consultancy's so the PDF report can
carry a two-logo letterhead.
"""
from alembic import op
import sqlalchemy as sa


revision = "f2c8d4a6b1e9"
down_revision = "e7b2c5d8a3f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brand_settings", sa.Column("client_logo_bytes", sa.LargeBinary(), nullable=True))
    op.add_column("brand_settings", sa.Column("client_logo_mime", sa.String(length=64), nullable=True))
    op.add_column("brand_settings", sa.Column("client_logo_source", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("brand_settings", "client_logo_source")
    op.drop_column("brand_settings", "client_logo_mime")
    op.drop_column("brand_settings", "client_logo_bytes")
