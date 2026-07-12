"""restructure_tables — GAEA Optimal Org Restructure feature

Revision ID: e5f9b2c8a4d6
Revises: c4e8f2a9b7d1
Create Date: 2026-07-12 15:00:00.000000

Adds four new tables that back the /restructure feature. The feature is
fully additive to GAEA — no existing table or column is modified.

Table shape summary (see app/domain/models.py for authoritative field
docs):

  restructure_runs
    Header + rollup KPIs per generation. One row per POST /restructure/run.
    Both `current_*` (org today) and `projected_*` (org after all moves
    accepted) so the Studio KPI strip renders from a single row.

  restructure_moves
    One row per proposed move. Move type is one of 7 enums. Impact block
    covers object/field access preservation + equity/cost/complexity
    deltas + blast tier. Deep-analysis (Option B bounded record probing)
    columns are nullable until the on-demand probe is run for that move.

  restructure_plans
    Named collections of accepted moves. Consultants can maintain
    multiple drafts (Plan A vs Plan B) per run. `accepted_move_ids`
    JSON preserves order the consultant chose for execution.

  restructure_preservation_constraints
    Per-user, per-object hard constraints ("Priya must retain Account
    object access"). Per-user, per-record is a v2 addition — see
    future_v2_items in memory.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f9b2c8a4d6'
down_revision: Union[str, None] = 'c4e8f2a9b7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # restructure_runs — the parent row for each generation.
    # ------------------------------------------------------------------
    op.create_table(
        'restructure_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'snapshot_at',
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        # Pinned GAEA state. Nullable because runs made when the equity
        # engine has never fired should still work — we just won't have
        # equity deltas to show.
        sa.Column('gaea_snapshot_id', sa.String(length=36), nullable=True),

        sa.Column('status', sa.String(length=16), nullable=False, server_default='running'),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
        sa.Column('moves_generated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),

        # Current-state KPIs at snapshot time (before any accepted moves).
        sa.Column('current_equity_index', sa.Float(), nullable=True),
        sa.Column('current_ps_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_role_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_user_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_monthly_license_cost', sa.Float(), nullable=True),

        # Projected KPIs assuming every proposed move is accepted. The
        # consultant will typically accept a subset so these are the
        # "if we did everything" ceiling, useful as the top-of-page hook.
        sa.Column('projected_equity_index', sa.Float(), nullable=True),
        sa.Column('projected_ps_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('projected_role_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('projected_monthly_license_cost', sa.Float(), nullable=True),

        # Free-form JSON — pattern-miner thresholds, probe sample size,
        # random seeds. Recorded so re-running with same config is
        # deterministic and audits can see what knobs were used.
        sa.Column('config', sa.JSON(), nullable=False, server_default='{}'),

        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_restructure_run_org_time',
        'restructure_runs',
        ['organization_id', 'snapshot_at'],
    )

    # ------------------------------------------------------------------
    # restructure_moves — one row per proposed move.
    # ------------------------------------------------------------------
    op.create_table(
        'restructure_moves',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'run_id',
            sa.String(length=36),
            sa.ForeignKey('restructure_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),

        # One of: MERGE_PERMISSION_SETS, RETIRE_UNUSED_PS,
        # REASSIGN_TO_ROLE, MERGE_ROLES, FLATTEN_ROLE_LEVEL,
        # REPARENT_ROLE, REASSIGN_MANAGER
        sa.Column('move_type', sa.String(length=40), nullable=False),
        sa.Column(
            'move_status',
            sa.String(length=16),
            nullable=False,
            server_default='proposed',
        ),

        # Primary SF component being changed + display name.
        sa.Column('primary_component_id', sa.String(length=64), nullable=True),
        sa.Column('primary_component_name', sa.String(length=255), nullable=True),
        # SF IDs of every other component / user affected by this move.
        sa.Column('affected_component_ids', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('affected_user_ids', sa.JSON(), nullable=False, server_default='[]'),

        # Access-preservation percentages (0-100). Object-level and
        # field-level tracked separately so a merge that preserves object
        # access but changes field-level FLS surfaces distinctly.
        sa.Column('object_access_preserved_pct', sa.Float(), nullable=True),
        sa.Column('field_access_preserved_pct', sa.Float(), nullable=True),

        # Impact deltas. equity_delta is +ve when the move improves the
        # equity index. cost_delta_monthly is -ve when the move saves
        # money. complexity_delta is -ve when the org gets simpler
        # (fewer PSets/roles).
        sa.Column('equity_delta', sa.Float(), nullable=True),
        sa.Column('cost_delta_monthly', sa.Float(), nullable=True),
        sa.Column('complexity_delta', sa.Integer(), nullable=True),
        sa.Column('sharing_rules_simplified', sa.Integer(), nullable=True),

        # Blast tier + score (parallel to change-risk-radar's model).
        sa.Column('blast_tier', sa.String(length=16), nullable=False, server_default='low'),
        sa.Column('blast_score', sa.Float(), nullable=False, server_default='0'),

        # Option B deep-analysis fields. NULL until the on-demand
        # /moves/{id}/deep-analyze endpoint has been hit for this row.
        sa.Column('records_gained_by_object', sa.JSON(), nullable=True),
        sa.Column('records_lost_by_object', sa.JSON(), nullable=True),
        sa.Column('deep_analysis_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('probe_sample_size', sa.Integer(), nullable=True),

        # Which preservation constraints this move would violate if
        # accepted — surfaced on the move card as a red badge.
        sa.Column('constraint_violations', sa.JSON(), nullable=False, server_default='[]'),

        sa.Column('rationale', sa.Text(), nullable=True),
        sa.Column('consultant_notes', sa.Text(), nullable=True),

        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_restructure_move_run', 'restructure_moves', ['run_id'],
    )
    op.create_index(
        'ix_restructure_move_run_type_status',
        'restructure_moves',
        ['run_id', 'move_type', 'move_status'],
    )

    # ------------------------------------------------------------------
    # restructure_plans — named collections of accepted moves.
    # ------------------------------------------------------------------
    op.create_table(
        'restructure_plans',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'run_id',
            sa.String(length=36),
            sa.ForeignKey('restructure_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='draft'),
        # Ordered list of move IDs — the consultant's chosen execution
        # sequence. JSON so we don't need a join-table for what's really
        # a list-per-plan.
        sa.Column('accepted_move_ids', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column('updated_by', sa.String(length=255), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index('ix_restructure_plan_run', 'restructure_plans', ['run_id'])

    # ------------------------------------------------------------------
    # restructure_preservation_constraints — per-user, per-object.
    # ------------------------------------------------------------------
    op.create_table(
        'restructure_preservation_constraints',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column(
            'run_id',
            sa.String(length=36),
            sa.ForeignKey('restructure_runs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'organization_id',
            sa.String(length=36),
            sa.ForeignKey('organizations.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('user_sf_id', sa.String(length=18), nullable=False),
        sa.Column('object_type', sa.String(length=120), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=255), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Same (user, object) can't be pinned twice for one run.
        sa.UniqueConstraint(
            'run_id', 'user_sf_id', 'object_type',
            name='uq_restructure_constraint_run_user_object',
        ),
    )
    op.create_index(
        'ix_restructure_constraint_run',
        'restructure_preservation_constraints',
        ['run_id'],
    )


def downgrade() -> None:
    op.drop_index(
        'ix_restructure_constraint_run',
        table_name='restructure_preservation_constraints',
    )
    op.drop_table('restructure_preservation_constraints')

    op.drop_index('ix_restructure_plan_run', table_name='restructure_plans')
    op.drop_table('restructure_plans')

    op.drop_index(
        'ix_restructure_move_run_type_status', table_name='restructure_moves',
    )
    op.drop_index('ix_restructure_move_run', table_name='restructure_moves')
    op.drop_table('restructure_moves')

    op.drop_index('ix_restructure_run_org_time', table_name='restructure_runs')
    op.drop_table('restructure_runs')
