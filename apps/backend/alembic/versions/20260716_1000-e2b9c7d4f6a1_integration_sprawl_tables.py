"""integration_sprawl_tables — Integration Blast Radius feature

Revision ID: e2b9c7d4f6a1
Revises: f4a9c1e8b7d3
Create Date: 2026-07-16 10:00:00.000000

Two tables backing the Integration Sprawl feature. Same shape as the
Report Sprawl and Automation Sprawl pairs — one run header + one row
per inventoried integration.

Sources covered by integration_type:
  connected_app         — inbound OAuth apps
  named_credential      — outbound HTTP callouts
  external_data_source  — Salesforce Connect / OData
  auth_provider         — SSO / social login
  remote_site           — legacy outbound URL whitelist
"""
from alembic import op
import sqlalchemy as sa


revision = "e2b9c7d4f6a1"
down_revision = "f4a9c1e8b7d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- integration_sprawl_runs --------------------------------------
    op.create_table(
        "integration_sprawl_runs",
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
            "connected_apps_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "named_credentials_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "external_data_sources_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "auth_providers_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "remote_sites_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_total",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_healthy",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "items_stale",
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
        sa.Column(
            "items_unknown",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "logins_180d",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "failed_logins_180d",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error", sa.String(500), nullable=True),
        sa.Column(
            "source_diagnostics",
            sa.JSON,
            nullable=False,
            server_default="{}",
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
    )
    op.create_index(
        "ix_integration_sprawl_run_org_time",
        "integration_sprawl_runs",
        ["organization_id", "snapshot_at"],
    )

    # -- integration_inventory_items ----------------------------------
    op.create_table(
        "integration_inventory_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey(
                "integration_sprawl_runs.id", ondelete="CASCADE"
            ),
            nullable=False,
        ),
        sa.Column("sf_id", sa.String(18), nullable=False),
        sa.Column("integration_type", sa.String(32), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("developer_name", sa.String(255), nullable=True),
        sa.Column("endpoint", sa.String(500), nullable=True),
        sa.Column("namespace_prefix", sa.String(120), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=True),
        sa.Column("login_count_180d", sa.Integer, nullable=True),
        sa.Column(
            "failed_login_count_180d", sa.Integer, nullable=True
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "tier",
            sa.String(16),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column(
            "evidence",
            sa.JSON,
            nullable=False,
            server_default="{}",
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
            "run_id", "sf_id", name="uq_integration_item_run_sfid"
        ),
    )
    op.create_index(
        "ix_integration_item_org_run",
        "integration_inventory_items",
        ["organization_id", "run_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_integration_item_org_run",
        table_name="integration_inventory_items",
    )
    op.drop_table("integration_inventory_items")
    op.drop_index(
        "ix_integration_sprawl_run_org_time",
        table_name="integration_sprawl_runs",
    )
    op.drop_table("integration_sprawl_runs")
