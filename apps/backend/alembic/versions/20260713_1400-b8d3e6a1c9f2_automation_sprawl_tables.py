"""automation_sprawl_tables — Automation Sprawl feature

Revision ID: b8d3e6a1c9f2
Revises: a7c2f9b3e8d4
Create Date: 2026-07-13 14:00:00.000000

Adds two tables that back the /automation-sprawl feature. Mirrors
the Report Sprawl pattern (one run header + one row per inventoried
item). Fully additive — nothing existing is modified.

Tables:

  automation_sprawl_runs
    One row per POST /automation-sprawl/run. Header + rollup
    counters for the KPI strip: totals by type (flows vs triggers),
    tier breakdown (active/dormant/orphaned/broken), avg staleness,
    dup group count.

  automation_inventory_items
    One row per Flow OR ApexTrigger captured at snapshot time.
    Discriminated by `item_type`. Tier is computed by
    AutomationSprawlService using precedence
    broken > orphaned > dormant > active.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b8d3e6a1c9f2"
down_revision = "a7c2f9b3e8d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- automation_sprawl_runs ---------------------------------------
    op.create_table(
        "automation_sprawl_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "organization_id",
            sa.String(36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "snapshot_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "flows_total", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "triggers_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_total", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "items_active", sa.Integer, nullable=False, server_default="0"
        ),
        sa.Column(
            "items_dormant",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_orphaned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_broken",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("avg_days_since_modified", sa.Integer, nullable=True),
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
        "ix_automation_sprawl_run_org_time",
        "automation_sprawl_runs",
        ["organization_id", "snapshot_at"],
    )

    # -- automation_inventory_items -----------------------------------
    op.create_table(
        "automation_inventory_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey(
                "automation_sprawl_runs.id", ondelete="CASCADE"
            ),
            nullable=False,
        ),
        sa.Column("sf_id", sa.String(18), nullable=False),
        sa.Column("item_type", sa.String(16), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("api_name", sa.String(255), nullable=True),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("namespace_prefix", sa.String(120), nullable=True),
        sa.Column("process_type", sa.String(64), nullable=True),
        sa.Column("trigger_type", sa.String(64), nullable=True),
        sa.Column("target_object", sa.String(120), nullable=True),
        sa.Column("api_version", sa.String(16), nullable=True),
        sa.Column("length_without_comments", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=True),
        sa.Column("is_valid", sa.Boolean, nullable=True),
        sa.Column("owner_sf_id", sa.String(18), nullable=True),
        sa.Column("owner_name", sa.String(255), nullable=True),
        sa.Column("owner_is_active", sa.Boolean, nullable=True),
        sa.Column(
            "last_modified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("days_since_modified", sa.Integer, nullable=True),
        sa.Column(
            "tier",
            sa.String(16),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "duplicate_group_key", sa.String(64), nullable=True
        ),
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
            "run_id", "sf_id", name="uq_automation_item_run_sfid"
        ),
    )
    op.create_index(
        "ix_automation_item_org_run",
        "automation_inventory_items",
        ["organization_id", "run_id"],
    )
    op.create_index(
        "ix_automation_item_dupe",
        "automation_inventory_items",
        ["run_id", "duplicate_group_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_automation_item_dupe",
        table_name="automation_inventory_items",
    )
    op.drop_index(
        "ix_automation_item_org_run",
        table_name="automation_inventory_items",
    )
    op.drop_table("automation_inventory_items")
    op.drop_index(
        "ix_automation_sprawl_run_org_time",
        table_name="automation_sprawl_runs",
    )
    op.drop_table("automation_sprawl_runs")
