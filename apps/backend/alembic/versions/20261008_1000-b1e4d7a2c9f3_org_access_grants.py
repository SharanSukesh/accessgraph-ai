"""org_access_grants + organizations.package_key_hash

Revision ID: b1e4d7a2c9f3
Revises: a7d3b2f9c1e5
Create Date: 2026-10-08 10:00:00.000000

Multi-org access for consultants: a Newton user can be granted access to
many client orgs (admins see all). package_key_hash authenticates the
Salesforce managed package's callouts, which previously sent no credential.
"""
from alembic import op
import sqlalchemy as sa


revision = "b1e4d7a2c9f3"
down_revision = "a7d3b2f9c1e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_access_grants",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "org_user_id", sa.String(length=36),
            sa.ForeignKey("org_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "organization_id", sa.String(length=36),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("granted_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("org_user_id", "organization_id", name="uq_org_access_grant"),
    )
    op.create_index("ix_org_access_grant_user", "org_access_grants", ["org_user_id"])
    op.create_index("ix_org_access_grant_org", "org_access_grants", ["organization_id"])
    op.add_column(
        "organizations",
        sa.Column("package_key_hash", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organizations", "package_key_hash")
    op.drop_index("ix_org_access_grant_org", table_name="org_access_grants")
    op.drop_index("ix_org_access_grant_user", table_name="org_access_grants")
    op.drop_table("org_access_grants")
