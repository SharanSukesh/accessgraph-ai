"""access_drafts

Revision ID: d7f9b1c3e5a8
Revises: c5e7a9b2d4f6
Create Date: 2026-10-20 12:00:00.000000

What-if scenarios (roadmap item 15): staged permission changes against a
snapshot, stored in Newton, never sent to Salesforce. Erased with the org.
"""
from alembic import op
import sqlalchemy as sa


revision = "d7f9b1c3e5a8"
down_revision = "c5e7a9b2d4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "access_drafts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("base_snapshot_id", sa.String(length=36), nullable=False),
        sa.Column("operations", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_access_draft_org", "access_drafts", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_access_draft_org", table_name="access_drafts")
    op.drop_table("access_drafts")
