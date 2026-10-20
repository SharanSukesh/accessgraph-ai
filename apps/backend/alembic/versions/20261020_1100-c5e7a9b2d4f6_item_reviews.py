"""item_reviews

Revision ID: c5e7a9b2d4f6
Revises: b3d6f8a1c4e7
Create Date: 2026-10-20 11:00:00.000000

Reviewer feedback on findings, anomalies and Priority Actions (roadmap item
10): useful, not useful or expected, with a reason. Erased with the org.
"""
from alembic import op
import sqlalchemy as sa


revision = "c5e7a9b2d4f6"
down_revision = "b3d6f8a1c4e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "item_reviews",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("item_key", sa.String(length=255), nullable=False),
        sa.Column("module", sa.String(length=40), nullable=False),
        sa.Column("group", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reviewer", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_item_review_org_key", "item_reviews", ["organization_id", "item_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_item_review_org_key", table_name="item_reviews")
    op.drop_table("item_reviews")
