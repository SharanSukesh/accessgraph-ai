"""automation/report sprawl: inactive + unknown_usage tier counters

Revision ID: e7b2c5d8a3f1
Revises: d4a9e2b7f1c6
Create Date: 2026-10-09 11:00:00.000000

Automation Sprawl gains an `inactive` tier for deactivated flows and
triggers, and Report Sprawl an `unknown_usage` tier for dashboards (no
org-wide usage date exists for them). The existing items_broken /
items_dormant columns are kept and surfaced as needs_attention /
unchanged by the ORM, so historical runs stay readable.
"""
from alembic import op
import sqlalchemy as sa


revision = "e7b2c5d8a3f1"
down_revision = "d4a9e2b7f1c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automation_sprawl_runs",
        sa.Column("items_inactive", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "report_sprawl_runs",
        sa.Column("items_unknown_usage", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("report_sprawl_runs", "items_unknown_usage")
    op.drop_column("automation_sprawl_runs", "items_inactive")
