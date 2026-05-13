"""add_delegated_approver_and_opp_teams

Revision ID: d2f8b1a5c6e3
Revises: c8d3a6f1b4e9
Create Date: 2026-05-14 10:00:00.000000

Phase 2 (v1.6) of the equity track: two schema additions feeding two new
edge types in the heterogeneous user graph.

  - users_snapshot.delegated_approver_id (with index) — populated from
    User.DelegatedApproverId on next sync. Powers the `delegated_approver`
    edge type, second-strongest user-to-user supervisory tie.
  - opportunity_team_member_snapshots — new table mirroring the existing
    account_team_member_snapshots shape. Populated from OpportunityTeamMember
    on next sync (wrapped in try/except in the orchestrator because Sales
    Cloud team selling isn't enabled on every org). Powers the
    `opportunity_team` edge type.

No data backfill needed — both fields are optional/nullable. Existing rows
keep NULL until the next sync writes through.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2f8b1a5c6e3'
down_revision: Union[str, None] = 'c8d3a6f1b4e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users_snapshot.delegated_approver_id
    op.add_column(
        'users_snapshot',
        sa.Column('delegated_approver_id', sa.String(length=18), nullable=True),
    )
    op.create_index(
        'ix_user_delegated_approver',
        'users_snapshot',
        ['delegated_approver_id'],
    )

    # opportunity_team_member_snapshots
    op.create_table(
        'opportunity_team_member_snapshots',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('salesforce_id', sa.String(length=18), nullable=False),
        sa.Column('opportunity_id', sa.String(length=18), nullable=False),
        sa.Column('user_id', sa.String(length=18), nullable=False),
        sa.Column('team_member_role', sa.String(length=100), nullable=True),
        sa.Column(
            'opportunity_access_level', sa.String(length=20), nullable=True
        ),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('snapshot_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.UniqueConstraint(
            'organization_id',
            'salesforce_id',
            'snapshot_date',
            name='uq_opp_team_org_sf_snapshot',
        ),
    )
    op.create_index(
        'ix_opp_team_org',
        'opportunity_team_member_snapshots',
        ['organization_id'],
    )
    op.create_index(
        'ix_opp_team_opportunity',
        'opportunity_team_member_snapshots',
        ['opportunity_id'],
    )
    op.create_index(
        'ix_opp_team_user',
        'opportunity_team_member_snapshots',
        ['user_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_opp_team_user', table_name='opportunity_team_member_snapshots'
    )
    op.drop_index(
        'ix_opp_team_opportunity', table_name='opportunity_team_member_snapshots'
    )
    op.drop_index(
        'ix_opp_team_org', table_name='opportunity_team_member_snapshots'
    )
    op.drop_table('opportunity_team_member_snapshots')
    op.drop_index('ix_user_delegated_approver', table_name='users_snapshot')
    op.drop_column('users_snapshot', 'delegated_approver_id')
