"""automation_source_diagnostics — per-run diagnostic capture

Revision ID: c9e4f7d2a1b8
Revises: b8d3e6a1c9f2
Create Date: 2026-07-13 16:00:00.000000

Adds `source_diagnostics` JSON column to automation_sprawl_runs so
every run persists exactly what each SF source returned (raw counts +
error captures for flows, triggers, and user lookups). Lets the
frontend explain a "0 items" outcome instead of silently rendering
an empty result set.
"""
from alembic import op
import sqlalchemy as sa


revision = "c9e4f7d2a1b8"
down_revision = "b8d3e6a1c9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "automation_sprawl_runs",
        sa.Column(
            "source_diagnostics",
            sa.JSON,
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("automation_sprawl_runs", "source_diagnostics")
