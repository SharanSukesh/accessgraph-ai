"""org_snapshots

Revision ID: b3d6f8a1c4e7
Revises: a9c3e5f7b2d4
Create Date: 2026-10-20 10:00:00.000000

Versioned snapshots (roadmap item 21): each sync becomes an immutable
snapshot, and each configuration row is stored once per version with the
snapshots it was valid in. Erased with the org; pruned with retention
except baselines.
"""
from alembic import op
import sqlalchemy as sa


revision = "b3d6f8a1c4e7"
down_revision = "a9c3e5f7b2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("sync_job_id", sa.String(length=36), nullable=True),
        sa.Column("privacy_mode", sa.String(length=20), nullable=True),
        sa.Column("counts", sa.JSON(), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("coverage", sa.JSON(), nullable=False),
        sa.Column("is_baseline", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("baseline_note", sa.String(length=500), nullable=True),
        sa.Column("baseline_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_org_snapshot_org_seq", "org_snapshots", ["organization_id", "seq"], unique=True)
    op.create_table(
        "snapshot_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity", sa.String(length=40), nullable=False),
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("hash", sa.String(length=64), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("first_seq", sa.Integer(), nullable=False),
        sa.Column("last_seq", sa.Integer(), nullable=False),
    )
    op.create_index("ix_snapshot_item_org_range", "snapshot_items", ["organization_id", "last_seq", "first_seq"])
    op.create_index("ix_snapshot_item_org_entity_key", "snapshot_items", ["organization_id", "entity", "key"])


def downgrade() -> None:
    op.drop_index("ix_snapshot_item_org_entity_key", table_name="snapshot_items")
    op.drop_index("ix_snapshot_item_org_range", table_name="snapshot_items")
    op.drop_table("snapshot_items")
    op.drop_index("ix_org_snapshot_org_seq", table_name="org_snapshots")
    op.drop_table("org_snapshots")
