"""installed_packages_wiring_signals

Revision ID: b9d7e4c1a3f5
Revises: a1b5e9c8d3f2
Create Date: 2026-07-11 10:00:00.000000

Adds four wiring-signal columns to installed_packages, replacing the
old inventory-only tiering with real reference detection:

  - dependency_count        — MetadataComponentDependency edges pointing
                              INTO the package's namespace
  - record_count_total      — sum of record counts across all package-
                              brought custom objects
  - async_job_count         — AsyncApexJob rows with an ApexClass in
                              the package's namespace
  - scheduled_job_count     — CronTrigger rows for scheduled Apex jobs
                              named "<namespace>.<JobName>"

All four are nullable Integer — None means "we couldn't query it
this run" (missing perms / no Tooling access) vs 0 which means "we
did query and got no rows". The service treats None as "no signal".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9d7e4c1a3f5'
down_revision: Union[str, None] = 'a1b5e9c8d3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'installed_packages',
        sa.Column('dependency_count', sa.Integer(), nullable=True),
    )
    op.add_column(
        'installed_packages',
        sa.Column('record_count_total', sa.Integer(), nullable=True),
    )
    op.add_column(
        'installed_packages',
        sa.Column('async_job_count', sa.Integer(), nullable=True),
    )
    op.add_column(
        'installed_packages',
        sa.Column('scheduled_job_count', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('installed_packages', 'scheduled_job_count')
    op.drop_column('installed_packages', 'async_job_count')
    op.drop_column('installed_packages', 'record_count_total')
    op.drop_column('installed_packages', 'dependency_count')
