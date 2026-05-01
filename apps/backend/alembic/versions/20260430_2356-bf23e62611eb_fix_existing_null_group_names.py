"""fix_existing_null_group_names

This data migration fixes existing group_snapshots records that have NULL names.
These records were created before the NOT NULL constraint was added.

For each group with a NULL name, we generate a descriptive fallback name using:
- The group type (e.g., "RoleAndSubordinates", "Queue")
- First 8 characters of the Salesforce ID for uniqueness
- Format: "{Type} Group ({ID})"

Example: "RoleAndSubordinates Group (00GgL000)"

Revision ID: bf23e62611eb
Revises: 31b86119bef3
Create Date: 2026-04-30 23:56:43.705597

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bf23e62611eb'
down_revision: Union[str, None] = '31b86119bef3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Fix existing NULL group names by updating them with descriptive fallback names"""

    # Update existing records with NULL names
    # Use PostgreSQL string concatenation to create descriptive names
    op.execute("""
        UPDATE group_snapshots
        SET name = group_type || ' Group (' || SUBSTRING(salesforce_id, 1, 8) || ')'
        WHERE name IS NULL
    """)


def downgrade() -> None:
    """
    Cannot safely downgrade - we don't know the original NULL values.
    This is a data cleanup migration and is not reversible.
    """
    pass
