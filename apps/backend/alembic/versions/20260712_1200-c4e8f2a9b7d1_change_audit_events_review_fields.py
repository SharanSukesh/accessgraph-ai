"""change_audit_events review fields (notes + ticket_url)

Revision ID: c4e8f2a9b7d1
Revises: b9d7e4c1a3f5
Create Date: 2026-07-12 12:00:00.000000

Adds two nullable columns to change_audit_events so a reviewer can
attach human context to any auto-detected change:

  - notes       - free-form text (why this was OK / what to follow
                  up on / who signed off / etc.)
  - ticket_url  - link to the approval / change-management record
                  (Jira, ServiceNow, an email thread — the URL is
                  the source of truth outside this tool)

Nullable and additive: existing events keep working, unfilled events
just render without a note or link.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e8f2a9b7d1'
down_revision: Union[str, None] = 'b9d7e4c1a3f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'change_audit_events',
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.add_column(
        'change_audit_events',
        # 2048 chars: room for a long Confluence deep-link with
        # query params. Anything longer probably isn't a URL.
        sa.Column('ticket_url', sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('change_audit_events', 'ticket_url')
    op.drop_column('change_audit_events', 'notes')
