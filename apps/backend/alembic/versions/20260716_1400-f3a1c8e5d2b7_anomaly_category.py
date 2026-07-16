"""anomaly_category — split access-anomalies by detector

Revision ID: f3a1c8e5d2b7
Revises: e2b9c7d4f6a1
Create Date: 2026-07-16 14:00:00.000000

Adds `category` to `access_anomalies` so the frontend can filter and
count session-anomaly rows (LoginHistory-based rule detector) separately
from the original access-anomaly rows (ML detector on permission
features). All existing rows are backfilled as "access".
"""
from alembic import op
import sqlalchemy as sa


revision = "f3a1c8e5d2b7"
down_revision = "e2b9c7d4f6a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "access_anomalies",
        sa.Column(
            "category",
            sa.String(length=20),
            nullable=False,
            server_default="access",
        ),
    )
    op.create_index(
        "ix_anomaly_category",
        "access_anomalies",
        ["category"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_anomaly_category", table_name="access_anomalies")
    op.drop_column("access_anomalies", "category")
