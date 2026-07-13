"""license_fit_tables — License-to-Persona Fit feature

Revision ID: d5f8a2b4e7c9
Revises: c9e4f7d2a1b8
Create Date: 2026-07-14 10:00:00.000000

Adds two tables for the License-to-Persona Fit right-sizing feature.
Reuses the existing LicensePriceBook table (from Org Analyzer) for
per-SKU pricing — no duplication.
"""
from alembic import op
import sqlalchemy as sa


revision = "d5f8a2b4e7c9"
down_revision = "c9e4f7d2a1b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- license_fit_runs ---------------------------------------------
    op.create_table(
        "license_fit_runs",
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
            "users_assessed",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_right_sized",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_overbuilt",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_wrong_cloud",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_underused",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_inactive_billed",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "users_unknown",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_annual_savings_cents",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_current_annual_cost_cents",
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
        "ix_license_fit_run_org_time",
        "license_fit_runs",
        ["organization_id", "snapshot_at"],
    )

    # -- license_fit_assessments --------------------------------------
    op.create_table(
        "license_fit_assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("license_fit_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_sf_id", sa.String(18), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=True),
        sa.Column("user_username", sa.String(255), nullable=True),
        sa.Column(
            "user_is_active",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("user_profile_name", sa.String(255), nullable=True),
        sa.Column("user_department", sa.String(255), nullable=True),
        sa.Column("user_title", sa.String(255), nullable=True),
        sa.Column(
            "last_login_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("days_since_login", sa.Integer, nullable=True),
        sa.Column(
            "current_license_name", sa.String(255), nullable=True
        ),
        sa.Column(
            "current_monthly_cost_cents",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "persona",
            sa.String(32),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column(
            "fit_category",
            sa.String(32),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column(
            "confidence",
            sa.String(16),
            nullable=False,
            server_default="low",
        ),
        sa.Column(
            "recommended_license_name", sa.String(255), nullable=True
        ),
        sa.Column(
            "recommended_monthly_cost_cents",
            sa.Integer,
            nullable=True,
        ),
        sa.Column(
            "annual_savings_cents",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "accounts_owned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "opportunities_owned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "cases_owned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "leads_owned",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "contacts_owned",
            sa.Integer,
            nullable=False,
            server_default="0",
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
            "run_id",
            "user_sf_id",
            name="uq_license_fit_assessment_run_user",
        ),
    )
    op.create_index(
        "ix_license_fit_assessment_org_run",
        "license_fit_assessments",
        ["organization_id", "run_id"],
    )
    op.create_index(
        "ix_license_fit_assessment_savings",
        "license_fit_assessments",
        ["run_id", "annual_savings_cents"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_license_fit_assessment_savings",
        table_name="license_fit_assessments",
    )
    op.drop_index(
        "ix_license_fit_assessment_org_run",
        table_name="license_fit_assessments",
    )
    op.drop_table("license_fit_assessments")
    op.drop_index(
        "ix_license_fit_run_org_time",
        table_name="license_fit_runs",
    )
    op.drop_table("license_fit_runs")
