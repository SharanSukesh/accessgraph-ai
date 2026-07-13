"""auth_tokens table — account activation + password reset

Revision ID: f4a9c1e8b7d3
Revises: d5f8a2b4e7c9
Create Date: 2026-07-13 18:00:00.000000

Single-use tokens for the account-activation email flow (admin creates
OrgUser → email sent → user clicks link → sets password) and for
password resets. Additive to the existing org_users table (which
already has password_hash + is_email_verified columns reserved).
"""
from alembic import op
import sqlalchemy as sa


revision = "f4a9c1e8b7d3"
down_revision = "d5f8a2b4e7c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("org_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(24), nullable=False),
        sa.Column(
            "expires_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_auth_token_lookup", "auth_tokens", ["token"])
    op.create_index("ix_auth_token_user", "auth_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_token_user", table_name="auth_tokens")
    op.drop_index("ix_auth_token_lookup", table_name="auth_tokens")
    op.drop_table("auth_tokens")
