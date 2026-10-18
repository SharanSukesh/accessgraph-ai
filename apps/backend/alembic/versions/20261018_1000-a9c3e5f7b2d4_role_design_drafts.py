"""role_design_drafts

Revision ID: a9c3e5f7b2d4
Revises: f2c8d4a6b1e9
Create Date: 2026-10-18 10:00:00.000000

Role hierarchy redesign drafts (roadmap 35b): stored in Newton, never
sent to Salesforce, erased with the org.
"""
from alembic import op
import sqlalchemy as sa


revision = "a9c3e5f7b2d4"
down_revision = "f2c8d4a6b1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "role_design_drafts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("base", sa.JSON(), nullable=False),
        sa.Column("operations", sa.JSON(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_role_design_draft_org", "role_design_drafts", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_role_design_draft_org", table_name="role_design_drafts")
    op.drop_table("role_design_drafts")
