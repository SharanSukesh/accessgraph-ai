"""report_sprawl_tables — Report & Dashboard Sprawl feature

Revision ID: a7c2f9b3e8d4
Revises: e5f9b2c8a4d6
Create Date: 2026-07-13 10:00:00.000000

Adds two tables that back the /report-sprawl feature. Mirrors the
Managed-Package Sprawl pattern (one run header + one row per
inventoried item). Fully additive — nothing existing is modified.

Tables:

  report_sprawl_runs
    One row per POST /report-sprawl/run. Header + rollup counters for
    the KPI strip: totals by type (reports vs dashboards), tier
    breakdown (live/zombie/orphaned/duplicate), avg staleness, dup
    group count.

  report_inventory_items
    One row per Report OR Dashboard captured at snapshot time.
    Discriminated by `item_type`. Tier is computed by
    ReportSprawlService using precedence
    orphaned > duplicate > zombie > live.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7c2f9b3e8d4"
down_revision = "e5f9b2c8a4d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- report_sprawl_runs --------------------------------------------
    op.create_table(
        "report_sprawl_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "reports_total", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "dashboards_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_total", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "items_live", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "items_zombie", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "items_orphaned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_duplicate",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_never_referenced",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("avg_days_since_last_view", sa.Integer, nullable=True),
        sa.Column(
            "duplicate_groups",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_report_sprawl_run_org_time",
        "report_sprawl_runs",
        ["organization_id", "snapshot_at"],
    )

    # -- report_inventory_items ---------------------------------------
    op.create_table(
        "report_inventory_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("report_sprawl_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sf_id", sa.String(18), nullable=False),
        sa.Column("item_type", sa.String(16), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("developer_name", sa.String(255), nullable=True),
        sa.Column("folder_name", sa.String(255), nullable=True),
        sa.Column("folder_id", sa.String(18), nullable=True),
        sa.Column("owner_sf_id", sa.String(18), nullable=True),
        sa.Column("owner_name", sa.String(255), nullable=True),
        sa.Column("owner_is_active", sa.Boolean, nullable=True),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("report_format", sa.String(32), nullable=True),
        sa.Column(
            "created_at_sf", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "last_referenced_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_modified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("days_since_last_view", sa.Integer, nullable=True),
        sa.Column(
            "tier",
            sa.String(16),
            nullable=False,
            server_default="live",
        ),
        sa.Column("duplicate_group_key", sa.String(64), nullable=True),
        sa.Column(
            "evidence", sa.JSON, nullable=False, server_default="{}"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "run_id", "sf_id", name="uq_report_item_run_sfid"
        ),
    )
    op.create_index(
        "ix_report_item_org_run",
        "report_inventory_items",
        ["organization_id", "run_id"],
    )
    op.create_index(
        "ix_report_item_dupe",
        "report_inventory_items",
        ["run_id", "duplicate_group_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_report_item_dupe", table_name="report_inventory_items"
    )
    op.drop_index(
        "ix_report_item_org_run", table_name="report_inventory_items"
    )
    op.drop_table("report_inventory_items")
    op.drop_index(
        "ix_report_sprawl_run_org_time", table_name="report_sprawl_runs"
    )
    op.drop_table("report_sprawl_runs")
