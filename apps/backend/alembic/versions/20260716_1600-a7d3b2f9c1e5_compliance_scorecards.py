"""compliance_scorecards — one-click auditor-ready control mapping

Revision ID: a7d3b2f9c1e5
Revises: f3a1c8e5d2b7
Create Date: 2026-07-16 16:00:00.000000

Backs Roadmap #8 (Compliance Scorecards). A single table stores every
run: framework, rollup counts, and a JSON `results` blob with the full
per-control payload. One table (not two) so a run is atomic and the
detail render is a single query.
"""
from alembic import op
import sqlalchemy as sa


revision = "a7d3b2f9c1e5"
down_revision = "f3a1c8e5d2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_scorecard_runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "organization_id", sa.String(length=36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("framework", sa.String(length=20), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("controls_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("controls_passed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("controls_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("controls_not_applicable", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("results", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index(
        "ix_compliance_run_org", "compliance_scorecard_runs",
        ["organization_id"], unique=False,
    )
    op.create_index(
        "ix_compliance_run_framework", "compliance_scorecard_runs",
        ["framework"], unique=False,
    )
    op.create_index(
        "ix_compliance_run_snapshot", "compliance_scorecard_runs",
        ["snapshot_at"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_compliance_run_snapshot", table_name="compliance_scorecard_runs")
    op.drop_index("ix_compliance_run_framework", table_name="compliance_scorecard_runs")
    op.drop_index("ix_compliance_run_org", table_name="compliance_scorecard_runs")
    op.drop_table("compliance_scorecard_runs")
