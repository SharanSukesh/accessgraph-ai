"""purge raw business-record ids from share/team snapshots

Revision ID: c3f8a1d6e2b4
Revises: b1e4d7a2c9f3
Create Date: 2026-10-08 11:00:00.000000

Account/Opportunity ids in these tables are now stored as keyed hashes
(app/core/pseudonymize.py). Rows written before that hold raw Salesforce
record ids; they are dropped here and rebuilt, hashed, on the next sync.
"""
from alembic import op


revision = "c3f8a1d6e2b4"
down_revision = "b1e4d7a2c9f3"
branch_labels = None
depends_on = None

TABLES = (
    "account_share_snapshots",
    "opportunity_share_snapshots",
    "account_team_member_snapshots",
    "opportunity_team_member_snapshots",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"DELETE FROM {table}")


def downgrade() -> None:
    pass
