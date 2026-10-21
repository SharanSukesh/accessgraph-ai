"""firm_settings and engagement_roadmaps

Revision ID: e9a1c3d5f7b2
Revises: d7f9b1c3e5a8
Create Date: 2026-10-20 18:00:00.000000

Priced roadmap builder (P1): the firm's rate card and playbooks
(firm-level, not client data) and each client's roadmap (erased with the
org).
"""
from alembic import op
import sqlalchemy as sa


revision = "e9a1c3d5f7b2"
down_revision = "d7f9b1c3e5a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "firm_settings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("firm_id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("firm_id", "key", name="uq_firm_setting_key"),
    )
    op.create_table(
        "engagement_roadmaps",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("packages", sa.JSON(), nullable=False),
        sa.Column("rate_overrides", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_engagement_roadmap_org", "engagement_roadmaps", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_engagement_roadmap_org", table_name="engagement_roadmaps")
    op.drop_table("engagement_roadmaps")
    op.drop_table("firm_settings")
