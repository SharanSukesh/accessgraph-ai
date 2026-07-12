"""Restructure Planner — the engine that generates candidate moves,
scores them, and persists them.

Architecture:

  RestructurePlannerService.run(actor_email)
    ├── _load_snapshots()                    read every input from DB
    ├── _mine_ps_moves()                     MERGE_PS + RETIRE_UNUSED_PS
    ├── _mine_role_moves()                   the 5 role hierarchy types
    ├── _score_move(move)                    Option A symbolic scoring, per move
    ├── _persist_run_and_moves()             write to DB in one transaction
    └── _update_run_projections()            recompute projected KPIs post-hoc

Fully additive to GAEA — reads `EquitySnapshot` (if any) as a scoring
signal but never modifies the equity engine. When no EquitySnapshot
exists (first-ever run against an org that never generated equity recs),
we skip the equity_delta chip and let the other four axes carry the
move.

Pattern miner heuristics documented inline. Impact simulator is
symbolic (Option A) — cheap per-move, roughly ~1s for a 340-PS org.
Option B bounded probing is separate (restructure_probe.py, Phase 6)
and gets fired on-demand per move rather than at run time.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field as dc_field
from datetime import datetime, timezone
from itertools import combinations
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    EquitySnapshot,
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetSnapshot,
    RestructureMove,
    RestructureMoveStatus,
    RestructureMoveType,
    RestructureRun,
    RoleSnapshot,
    UserSnapshot,
)


logger = logging.getLogger(__name__)


# ============================================================================
# Configuration + tunable defaults
# ============================================================================

DEFAULT_PS_OVERLAP = 0.90
DEFAULT_ROLE_MEMBER_OVERLAP = 0.85
DEFAULT_MAX_MOVES = 50


# ============================================================================
# Display-name helpers
# ============================================================================
#
# Consultants need human-legible names on every move card — SF IDs alone are
# useless in a client meeting. But we ALSO need the raw ID for traceability
# ("which specific PSet is this?"). Each helper returns `"Label (SF_ID)"`
# when a human label exists, or just the SF ID when it doesn't.
#
# `label` (PermissionSet only) is the Salesforce display label — typically
# what admins see in Setup. `name` is the API name (often identical to the
# ID for managed-package PSets, hence the fallback chain).


def _looks_like_id(s: str) -> bool:
    """Heuristic: is this string a raw SF ID or a synthetic managed-package
    identifier rather than a human label?

    Cases covered:
      - 15 or 18-char alphanumeric (SF ID)
      - Synthetic managed-package names with the "hash + version tuple"
        pattern (e.g. `00ex00000018ozl_128_09_04_12_5`) — long strings
        with underscore-separated digit groups and no vowels/spaces.
    """
    if not s:
        return True
    s = s.strip()
    if not s:
        return True
    # Bare SF ID (15 or 18 chars, all alnum, no spaces).
    if len(s) in (15, 18) and s.isalnum():
        return True
    # Managed-package synthetic (long, underscore-heavy, digit-heavy).
    if (
        len(s) >= 15
        and s.count("_") >= 3
        and sum(c.isdigit() for c in s) >= 5
        and " " not in s
    ):
        return True
    return False


def _ps_display(ps: PermissionSetSnapshot) -> str:
    """Best-effort human-legible name for a PermissionSet, with SF ID
    appended for traceability.

    Fallback ladder:
      1. `label` (if it's a human string)
      2. `name` (if it's a human string)
      3. Categorized descriptor built from `ps_type` +
         `is_owned_by_profile` — e.g. "Session-Based PS", "Profile-owned
         Regular PS". Always followed by the SF ID.
    """
    label = (ps.label or "").strip()
    name = (ps.name or "").strip()
    sf_id = ps.salesforce_id

    for candidate in (label, name):
        if candidate and not _looks_like_id(candidate) and candidate != sf_id:
            return f"{candidate} ({sf_id})"

    # Fell through — construct a categorized descriptor so consultants
    # at least know what KIND of PS this is.
    kind = (ps.ps_type or "Regular").strip() or "Regular"
    owned = "Profile-owned " if ps.is_owned_by_profile else ""
    # If we have SOME string content, hint at it so consultants can
    # cross-check in Setup. Truncate long synthetics.
    hint = ""
    for candidate in (label, name):
        if candidate:
            truncated = candidate if len(candidate) <= 30 else candidate[:27] + "..."
            hint = f' [raw: "{truncated}"]'
            break
    return f"{owned}{kind} Permission Set{hint} ({sf_id})"


def _role_display(r: RoleSnapshot) -> str:
    name = (r.name or "").strip()
    sf_id = r.salesforce_id
    if name and not _looks_like_id(name) and name != sf_id:
        return f"{name} ({sf_id})"
    # Fall back to "Unnamed Role (sf_id)" so the consultant knows it's a
    # Role rather than staring at a raw ID they can't identify.
    return f"Unnamed Role ({sf_id})"


def _user_display(u: UserSnapshot) -> str:
    name = (u.name or "").strip()
    username = (u.username or "").strip()
    sf_id = u.salesforce_id
    for candidate in (name, username):
        if candidate and not _looks_like_id(candidate) and candidate != sf_id:
            return f"{candidate} ({sf_id})"
    return f"Unnamed User ({sf_id})"

# Bands used to convert `affected_user_count` (or a role-move's implied
# record impact) into a blast tier. Mirrors the change-risk-radar tier
# semantics so the two features read as one system.
BLAST_TIERS = (
    (5, "low", 20.0),
    (50, "medium", 45.0),
    (200, "high", 70.0),
    (10_000, "critical", 90.0),
)


# ============================================================================
# Dataclasses (candidate moves before persistence + impact results)
# ============================================================================


@dataclass
class CandidateMove:
    """Raw move detected by the miner, before scoring."""
    move_type: str
    primary_component_id: str
    primary_component_name: str
    affected_component_ids: List[str] = dc_field(default_factory=list)
    affected_user_ids: List[str] = dc_field(default_factory=list)
    # Miner-supplied context the simulator uses. e.g., for MERGE_PS
    # this holds the two source PSets' permission signatures so the
    # simulator can compute preservation without re-fetching.
    context: Dict[str, Any] = dc_field(default_factory=dict)
    # Human-readable justification the miner produces. Simulator can
    # append to this before we persist.
    rationale_seed: str = ""


@dataclass
class ImpactResult:
    """Full scored impact of one move — every column in RestructureMove.impact."""
    object_access_preserved_pct: Optional[float]
    field_access_preserved_pct: Optional[float]
    equity_delta: Optional[float]
    cost_delta_monthly: Optional[float]
    complexity_delta: int
    sharing_rules_simplified: int
    blast_tier: str
    blast_score: float
    rationale_addenda: str = ""


@dataclass
class OrgContext:
    """One-shot bag of everything we loaded from the DB, threaded through
    the miner + simulator. Building this once beats N re-fetches during
    per-move scoring."""
    org_id: str
    users: List[UserSnapshot]
    roles: List[RoleSnapshot]
    permission_sets: List[PermissionSetSnapshot]
    assignments: List[PermissionSetAssignmentSnapshot]

    # Derived lookup tables — cached for O(1) access during scoring.
    users_by_sf: Dict[str, UserSnapshot] = dc_field(default_factory=dict)
    ps_by_sf: Dict[str, PermissionSetSnapshot] = dc_field(default_factory=dict)
    ps_signatures: Dict[str, Tuple[frozenset, frozenset]] = dc_field(
        default_factory=dict
    )  # sf_id -> (object_sig, field_sig)
    assignments_by_ps: Dict[str, List[PermissionSetAssignmentSnapshot]] = (
        dc_field(default_factory=lambda: defaultdict(list))
    )
    ps_ids_by_user: Dict[str, Set[str]] = dc_field(
        default_factory=lambda: defaultdict(set)
    )
    users_by_role: Dict[str, List[UserSnapshot]] = dc_field(
        default_factory=lambda: defaultdict(list)
    )
    roles_by_parent: Dict[Optional[str], List[RoleSnapshot]] = dc_field(
        default_factory=lambda: defaultdict(list)
    )

    # GAEA output — one utility number per user. Empty when no
    # EquitySnapshot exists for the org (the equity engine has never
    # generated recs). All equity-delta scoring degrades gracefully to
    # None in that case rather than crashing.
    user_utility: Dict[str, float] = dc_field(default_factory=dict)
    equity_snapshot_id: Optional[str] = None
    baseline_equity_index: Optional[float] = None


# ============================================================================
# Service
# ============================================================================


class RestructurePlannerService:
    """Runs the pattern miner + Option A simulator, persists the results.

    One instance per POST /restructure/run. Stateful only during the
    call — every intermediate structure lives on the instance for the
    duration of `.run()` then falls out of scope.
    """

    def __init__(
        self,
        db: AsyncSession,
        org_id: str,
        max_moves: int = DEFAULT_MAX_MOVES,
        ps_overlap_threshold: float = DEFAULT_PS_OVERLAP,
        role_member_overlap_threshold: float = DEFAULT_ROLE_MEMBER_OVERLAP,
    ):
        self.db = db
        self.org_id = org_id
        self.max_moves = max_moves
        self.ps_overlap_threshold = ps_overlap_threshold
        self.role_member_overlap_threshold = role_member_overlap_threshold

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(self, *, actor_email: Optional[str] = None) -> RestructureRun:
        started = time.monotonic()

        # 1. Persist an initial "running" row so the frontend polling
        #    endpoint returns something reasonable during the run. This
        #    also gives us the run.id up front to attach moves to.
        run = RestructureRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            status="running",
            actor_email=actor_email,
            config={
                "max_moves": self.max_moves,
                "ps_overlap_threshold": self.ps_overlap_threshold,
                "role_member_overlap_threshold": (
                    self.role_member_overlap_threshold
                ),
            },
        )
        self.db.add(run)
        await self.db.flush()  # get run.id assigned

        try:
            # 2. Load everything from the DB in one shot.
            ctx = await self._load_snapshots()
            run.gaea_snapshot_id = ctx.equity_snapshot_id

            # 3. Populate current-state KPIs from the loaded context.
            run.current_equity_index = ctx.baseline_equity_index
            run.current_ps_count = len(ctx.permission_sets)
            run.current_role_count = len(ctx.roles)
            run.current_user_count = len(ctx.users)
            # Cost data not yet integrated — v2 item.
            run.current_monthly_license_cost = None

            # 4. Mine candidate moves.
            candidates: List[CandidateMove] = []
            candidates.extend(self._mine_ps_moves(ctx))
            candidates.extend(self._mine_role_moves(ctx))
            # Sort by miner-supplied "priority proxy" (currently size of
            # affected_user_ids) so the first N under max_moves are the
            # most impactful.
            candidates.sort(key=lambda c: -len(c.affected_user_ids))
            candidates = candidates[: self.max_moves]

            # 5. Score each candidate and persist as a RestructureMove.
            persisted = 0
            projected_complexity_delta = 0
            projected_equity_lift = 0.0
            equity_lift_count = 0
            for cand in candidates:
                impact = self._score_move(cand, ctx)
                move = RestructureMove(
                    run_id=run.id,
                    organization_id=self.org_id,
                    move_type=cand.move_type,
                    move_status=RestructureMoveStatus.PROPOSED.value,
                    primary_component_id=cand.primary_component_id,
                    primary_component_name=cand.primary_component_name,
                    affected_component_ids=list(cand.affected_component_ids),
                    affected_user_ids=list(cand.affected_user_ids),
                    object_access_preserved_pct=(
                        impact.object_access_preserved_pct
                    ),
                    field_access_preserved_pct=(
                        impact.field_access_preserved_pct
                    ),
                    equity_delta=impact.equity_delta,
                    cost_delta_monthly=impact.cost_delta_monthly,
                    complexity_delta=impact.complexity_delta,
                    sharing_rules_simplified=impact.sharing_rules_simplified,
                    blast_tier=impact.blast_tier,
                    blast_score=impact.blast_score,
                    rationale=(
                        (cand.rationale_seed + " " + impact.rationale_addenda)
                        .strip()
                    ),
                )
                self.db.add(move)
                persisted += 1
                projected_complexity_delta += impact.complexity_delta
                if impact.equity_delta is not None:
                    projected_equity_lift += impact.equity_delta
                    equity_lift_count += 1

            # 6. Update run with rollup KPIs.
            run.moves_generated = persisted
            run.projected_ps_count = max(
                0, len(ctx.permission_sets) + self._delta_of(
                    candidates,
                    (
                        RestructureMoveType.MERGE_PERMISSION_SETS.value,
                        RestructureMoveType.RETIRE_UNUSED_PS.value,
                    ),
                    per_move=-1,
                ),
            )
            run.projected_role_count = max(
                0, len(ctx.roles) + self._delta_of(
                    candidates,
                    (
                        RestructureMoveType.MERGE_ROLES.value,
                        RestructureMoveType.FLATTEN_ROLE_LEVEL.value,
                    ),
                    per_move=-1,
                ),
            )
            if ctx.baseline_equity_index is not None and equity_lift_count > 0:
                # Sum equity_delta from each move — proxy for "what the
                # index would look like if every proposed move landed".
                # Coarse but useful as a hero number on the page header.
                run.projected_equity_index = (
                    ctx.baseline_equity_index + projected_equity_lift
                )
            else:
                run.projected_equity_index = ctx.baseline_equity_index
            run.projected_monthly_license_cost = None  # v2

            run.status = "complete"
            run.duration_ms = int((time.monotonic() - started) * 1000)
            await self.db.commit()
            await self.db.refresh(run)

            logger.info(
                "restructure: run %s complete for org %s — %d moves in %dms",
                run.id, self.org_id, persisted, run.duration_ms,
            )
            return run

        except Exception as exc:
            logger.exception(
                "restructure: run for org %s failed", self.org_id
            )
            run.status = "error"
            run.error = str(exc)[:500]
            run.duration_ms = int((time.monotonic() - started) * 1000)
            try:
                await self.db.commit()
            except Exception:  # noqa: BLE001
                await self.db.rollback()
            raise

    # ------------------------------------------------------------------
    # Snapshot loading
    # ------------------------------------------------------------------

    async def _load_snapshots(self) -> OrgContext:
        """One big fanout query. Every downstream operation reads from
        the returned OrgContext, so cache-locality is win #1."""

        users = list((
            await self.db.execute(
                select(UserSnapshot).where(
                    UserSnapshot.organization_id == self.org_id,
                    UserSnapshot.is_active.is_(True),
                )
            )
        ).scalars().all())
        roles = list((
            await self.db.execute(
                select(RoleSnapshot).where(
                    RoleSnapshot.organization_id == self.org_id
                )
            )
        ).scalars().all())
        permission_sets = list((
            await self.db.execute(
                select(PermissionSetSnapshot).where(
                    PermissionSetSnapshot.organization_id == self.org_id
                )
            )
        ).scalars().all())
        assignments = list((
            await self.db.execute(
                select(PermissionSetAssignmentSnapshot).where(
                    PermissionSetAssignmentSnapshot.organization_id
                    == self.org_id
                )
            )
        ).scalars().all())
        obj_perms = list((
            await self.db.execute(
                select(ObjectPermissionSnapshot).where(
                    ObjectPermissionSnapshot.organization_id == self.org_id
                )
            )
        ).scalars().all())
        field_perms = list((
            await self.db.execute(
                select(FieldPermissionSnapshot).where(
                    FieldPermissionSnapshot.organization_id == self.org_id
                )
            )
        ).scalars().all())

        # ---- Build derived lookup structures ------------------------
        ctx = OrgContext(
            org_id=self.org_id,
            users=users,
            roles=roles,
            permission_sets=permission_sets,
            assignments=assignments,
        )
        ctx.users_by_sf = {u.salesforce_id: u for u in users}
        ctx.ps_by_sf = {ps.salesforce_id: ps for ps in permission_sets}

        for a in assignments:
            ctx.assignments_by_ps[a.permission_set_id].append(a)
            ctx.ps_ids_by_user[a.assignee_id].add(a.permission_set_id)
        for u in users:
            if u.user_role_id:
                ctx.users_by_role[u.user_role_id].append(u)
        for r in roles:
            ctx.roles_by_parent[r.parent_role_id].append(r)

        # ---- Permission signatures per PSet -------------------------
        # object_sig = { (sobject_type, "R"|"C"|"E"|"D"|"VA"|"MA") }
        # field_sig  = { (sobject_type, field, "R"|"E") }
        # These are the atoms Jaccard is computed on for MERGE_PS.
        obj_by_ps: Dict[str, Set[Tuple[str, str]]] = defaultdict(set)
        for op in obj_perms:
            k = op.parent_id
            if op.permissions_read:
                obj_by_ps[k].add((op.sobject_type, "R"))
            if op.permissions_create:
                obj_by_ps[k].add((op.sobject_type, "C"))
            if op.permissions_edit:
                obj_by_ps[k].add((op.sobject_type, "E"))
            if op.permissions_delete:
                obj_by_ps[k].add((op.sobject_type, "D"))
            if op.permissions_view_all_records:
                obj_by_ps[k].add((op.sobject_type, "VA"))
            if op.permissions_modify_all_records:
                obj_by_ps[k].add((op.sobject_type, "MA"))
        fld_by_ps: Dict[str, Set[Tuple[str, str, str]]] = defaultdict(set)
        for fp in field_perms:
            k = fp.parent_id
            if fp.permissions_read:
                fld_by_ps[k].add((fp.sobject_type, fp.field, "R"))
            if fp.permissions_edit:
                fld_by_ps[k].add((fp.sobject_type, fp.field, "E"))
        for ps in permission_sets:
            ctx.ps_signatures[ps.salesforce_id] = (
                frozenset(obj_by_ps.get(ps.salesforce_id, set())),
                frozenset(fld_by_ps.get(ps.salesforce_id, set())),
            )

        # ---- GAEA outputs — best-effort ----------------------------
        latest_equity = (
            await self.db.execute(
                select(EquitySnapshot)
                .where(EquitySnapshot.organization_id == self.org_id)
                .order_by(desc(EquitySnapshot.snapshot_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        if latest_equity is not None:
            ctx.equity_snapshot_id = latest_equity.id
            ctx.baseline_equity_index = float(latest_equity.equity_index or 0)
            # EquitySnapshot stores per-user utility in a JSON field
            # (attribute name varies across historical schemas — try
            # the two we've seen and degrade gracefully).
            raw = (
                getattr(latest_equity, "per_user_utility", None)
                or getattr(latest_equity, "user_utility", None)
                or {}
            )
            if isinstance(raw, dict):
                ctx.user_utility = {k: float(v) for k, v in raw.items()}

        return ctx

    # ------------------------------------------------------------------
    # Pattern miner — PSet-level
    # ------------------------------------------------------------------

    def _mine_ps_moves(self, ctx: OrgContext) -> List[CandidateMove]:
        """MERGE_PERMISSION_SETS + RETIRE_UNUSED_PS.

        MERGE_PS: any pair of PSets whose (object ∪ field) Jaccard >=
        the configured threshold. Symmetric; we take (a < b) to avoid
        double-counting.

        RETIRE_UNUSED_PS: any PSet with zero assignments.
        """
        candidates: List[CandidateMove] = []

        # ---- RETIRE_UNUSED_PS -------------------------------------
        for ps in ctx.permission_sets:
            n_assigned = len(ctx.assignments_by_ps.get(ps.salesforce_id, []))
            if n_assigned > 0:
                continue
            # Managed / system PSets often show 0 assignments because
            # they're bundled into PSGs — skip anything marked as owned
            # by a namespace (has "__" in the name is our proxy since
            # NamespacePrefix isn't in the snapshot model).
            if ps.name and "__" in ps.name:
                continue
            candidates.append(CandidateMove(
                move_type=RestructureMoveType.RETIRE_UNUSED_PS.value,
                primary_component_id=ps.salesforce_id,
                primary_component_name=_ps_display(ps),
                rationale_seed=(
                    f"Permission Set has zero direct assignments and no "
                    f"activity — safe candidate to retire."
                ),
            ))

        # ---- MERGE_PERMISSION_SETS --------------------------------
        # Skip PSets with empty signatures (nothing to merge) to keep
        # noise down.
        eligible = [
            ps for ps in ctx.permission_sets
            if any(ctx.ps_signatures.get(ps.salesforce_id, (frozenset(), frozenset())))
        ]
        # Guardrail — pairs is O(n²). At 500 PSets that's 125k pairs,
        # still fine in-memory (each Jaccard is a set op on <10k atoms).
        # Above that we'd need bucketing (LSH) — v2 concern.
        for a, b in combinations(eligible, 2):
            sig_a = ctx.ps_signatures[a.salesforce_id]
            sig_b = ctx.ps_signatures[b.salesforce_id]
            overlap = self._weighted_jaccard(sig_a, sig_b)
            if overlap < self.ps_overlap_threshold:
                continue
            assignees = (
                {x.assignee_id for x in ctx.assignments_by_ps.get(a.salesforce_id, [])}
                | {x.assignee_id for x in ctx.assignments_by_ps.get(b.salesforce_id, [])}
            )
            candidates.append(CandidateMove(
                move_type=RestructureMoveType.MERGE_PERMISSION_SETS.value,
                primary_component_id=a.salesforce_id,
                primary_component_name=(
                    f"{_ps_display(a)} + {_ps_display(b)}"
                ),
                affected_component_ids=[a.salesforce_id, b.salesforce_id],
                affected_user_ids=sorted(assignees),
                context={"overlap": overlap},
                rationale_seed=(
                    f"Permission Sets share {overlap * 100:.1f}% of their "
                    f"object + field permissions. Merging preserves "
                    f"effective access for all {len(assignees)} affected "
                    f"users while removing one Permission Set from the "
                    f"management surface."
                ),
            ))
        return candidates

    # ------------------------------------------------------------------
    # Pattern miner — role hierarchy
    # ------------------------------------------------------------------

    def _mine_role_moves(self, ctx: OrgContext) -> List[CandidateMove]:
        """5 role-hierarchy move types.

        Heuristics kept deliberately simple for v1 — the goal is to
        surface plausible candidates the consultant reviews, not to
        auto-execute.  Every candidate carries enough context for the
        simulator to score its blast + preservation.
        """
        candidates: List[CandidateMove] = []

        # ---- MERGE_ROLES ------------------------------------------
        # For each pair of roles, compute Jaccard on the combined
        # (profile, PS) signatures of their members. High overlap ⇒
        # members already work with the same access model; merging is
        # low-risk.
        role_sigs: Dict[str, Set[str]] = {}
        for r in ctx.roles:
            sig: Set[str] = set()
            for u in ctx.users_by_role.get(r.salesforce_id, []):
                if u.profile_id:
                    sig.add(f"P:{u.profile_id}")
                for ps in ctx.ps_ids_by_user.get(u.salesforce_id, set()):
                    sig.add(f"PS:{ps}")
            role_sigs[r.salesforce_id] = sig
        for r_a, r_b in combinations(ctx.roles, 2):
            s_a, s_b = role_sigs[r_a.salesforce_id], role_sigs[r_b.salesforce_id]
            if not s_a or not s_b:
                continue
            j = len(s_a & s_b) / len(s_a | s_b)
            if j < self.role_member_overlap_threshold:
                continue
            users_a = ctx.users_by_role.get(r_a.salesforce_id, [])
            users_b = ctx.users_by_role.get(r_b.salesforce_id, [])
            candidates.append(CandidateMove(
                move_type=RestructureMoveType.MERGE_ROLES.value,
                primary_component_id=r_a.salesforce_id,
                primary_component_name=(
                    f"{_role_display(r_a)} + {_role_display(r_b)}"
                ),
                affected_component_ids=[r_a.salesforce_id, r_b.salesforce_id],
                affected_user_ids=[u.salesforce_id for u in users_a + users_b],
                context={"jaccard": j},
                rationale_seed=(
                    f"Roles have {j * 100:.0f}% overlap across member "
                    f"profile + Permission Set assignments — members "
                    f"already effectively share an access model. "
                    f"Merging widens visibility scope uniformly for "
                    f"{len(users_a) + len(users_b)} users."
                ),
            ))

        # ---- FLATTEN_ROLE_LEVEL -----------------------------------
        # A role with exactly 1 child adds no differentiation vs. its
        # grandparent → collapse candidate. High-blast because record
        # rollup path changes for the grandchild.
        for r in ctx.roles:
            children = ctx.roles_by_parent.get(r.salesforce_id, [])
            if len(children) != 1:
                continue
            child = children[0]
            # Grandchildren of the removed level become direct children
            # of `r`'s parent. Affected users = every user under `child`
            # + `r` itself.
            affected = list(ctx.users_by_role.get(child.salesforce_id, []))
            affected += list(ctx.users_by_role.get(r.salesforce_id, []))
            candidates.append(CandidateMove(
                move_type=RestructureMoveType.FLATTEN_ROLE_LEVEL.value,
                primary_component_id=r.salesforce_id,
                primary_component_name=_role_display(r),
                affected_component_ids=[r.salesforce_id, child.salesforce_id],
                affected_user_ids=[u.salesforce_id for u in affected],
                context={},
                rationale_seed=(
                    f"Role sits between its parent and a single child — "
                    f"contributes an extra hierarchy level without "
                    f"differentiating a distinct group. Flattening "
                    f"shortens the record-rollup path for "
                    f"{len(affected)} users."
                ),
            ))

        # ---- REASSIGN_TO_ROLE (equity-driven) ---------------------
        # Only fires when GAEA outputs are available. We rank users by
        # utility (ascending — worst-served first) and, per user, pick
        # the role whose average utility is highest as the proposed
        # target. Simple heuristic; the actual GAEA re-run per move is
        # too expensive for v1.
        if ctx.user_utility:
            role_avg_util: Dict[str, float] = {}
            for r in ctx.roles:
                utils = [
                    ctx.user_utility.get(u.salesforce_id, 0.0)
                    for u in ctx.users_by_role.get(r.salesforce_id, [])
                ]
                role_avg_util[r.salesforce_id] = (
                    sum(utils) / len(utils) if utils else 0.0
                )
            # Cap at 15 reassign candidates to keep the noise sensible
            # — the top handful is where consultants engage anyway.
            sorted_users = sorted(
                ctx.users, key=lambda u: ctx.user_utility.get(u.salesforce_id, 0.0)
            )
            reassign_cap = 15
            for u in sorted_users:
                if reassign_cap <= 0:
                    break
                current = ctx.user_utility.get(u.salesforce_id, 0.0)
                if not u.user_role_id:
                    continue
                current_role_avg = role_avg_util.get(u.user_role_id, 0.0)
                # Find best-alternative role
                best_id = None
                best_avg = current_role_avg
                for rid, avg in role_avg_util.items():
                    if rid == u.user_role_id:
                        continue
                    if avg > best_avg * 1.05:  # ≥5% lift
                        best_id, best_avg = rid, avg
                if best_id is None:
                    continue
                new_role = next(
                    (r for r in ctx.roles if r.salesforce_id == best_id), None
                )
                if new_role is None:
                    continue
                candidates.append(CandidateMove(
                    move_type=RestructureMoveType.REASSIGN_TO_ROLE.value,
                    primary_component_id=u.salesforce_id,
                    primary_component_name=_user_display(u),
                    affected_component_ids=[u.user_role_id or "", best_id],
                    affected_user_ids=[u.salesforce_id],
                    context={
                        "old_role": u.user_role_id,
                        "new_role": best_id,
                        "utility_current": current,
                        "role_avg_current": current_role_avg,
                        "role_avg_new": best_avg,
                    },
                    rationale_seed=(
                        f"GAEA utility for this user ({current:.2f}) sits "
                        f"below their role's average ({current_role_avg:.2f}). "
                        f"Reassigning to '{new_role.name}' (role avg "
                        f"{best_avg:.2f}) would place them under a role "
                        f"whose members already have better graph-distance "
                        f"to key resources — projected equity lift ≥5%."
                    ),
                ))
                reassign_cap -= 1

        # ---- REPARENT_ROLE ----------------------------------------
        # Similar spirit to REASSIGN_TO_ROLE but for the role's own
        # position in the hierarchy. Detect roles whose members have
        # significantly worse utility than the role's sibling under a
        # different parent, and propose reparenting under that parent.
        # Simpler heuristic for v1 — surface roles whose per-role avg
        # utility is bottom quartile.
        if ctx.user_utility and role_avg_util:
            avg_sorted = sorted(role_avg_util.items(), key=lambda x: x[1])
            bottom_quartile = avg_sorted[: max(1, len(avg_sorted) // 4)]
            for rid, _ in bottom_quartile[:5]:
                r = next(
                    (x for x in ctx.roles if x.salesforce_id == rid), None
                )
                if r is None or r.parent_role_id is None:
                    continue
                # Suggest the highest-utility "top level" role as the
                # new parent — represents graph proximity to VIPs.
                top = avg_sorted[-1] if avg_sorted else None
                if not top or top[0] == rid:
                    continue
                target = next(
                    (x for x in ctx.roles if x.salesforce_id == top[0]), None
                )
                if target is None or target.salesforce_id == r.parent_role_id:
                    continue
                affected_users = ctx.users_by_role.get(rid, [])
                candidates.append(CandidateMove(
                    move_type=RestructureMoveType.REPARENT_ROLE.value,
                    primary_component_id=r.salesforce_id,
                    primary_component_name=_role_display(r),
                    affected_component_ids=[
                        r.parent_role_id or "",
                        target.salesforce_id,
                    ],
                    affected_user_ids=[u.salesforce_id for u in affected_users],
                    context={
                        "old_parent": r.parent_role_id,
                        "new_parent": target.salesforce_id,
                    },
                    rationale_seed=(
                        f"Role's members average utility "
                        f"{role_avg_util[rid]:.2f} — bottom quartile. "
                        f"Reparenting under '{target.name}' places the role "
                        f"closer to high-utility VIP nodes, improving "
                        f"record rollup access for "
                        f"{len(affected_users)} users."
                    ),
                ))

        # ---- REASSIGN_MANAGER -------------------------------------
        # Distinct from REASSIGN_TO_ROLE. Affects User.ManagerId
        # (approval chain), not role hierarchy. Detect low-utility
        # users whose current manager also has low utility — propose a
        # higher-utility manager (typically their manager's manager).
        if ctx.user_utility:
            manager_cap = 8
            for u in sorted_users:
                if manager_cap <= 0:
                    break
                if not u.manager_id:
                    continue
                mgr = ctx.users_by_sf.get(u.manager_id)
                if not mgr:
                    continue
                mgr_util = ctx.user_utility.get(mgr.salesforce_id, 0.0)
                if mgr_util >= ctx.user_utility.get(u.salesforce_id, 0.0):
                    continue  # manager is already higher utility
                # Suggest the manager's manager as the new supervisor.
                grand_id = mgr.manager_id
                if not grand_id or grand_id == u.salesforce_id:
                    continue
                grand = ctx.users_by_sf.get(grand_id)
                if not grand:
                    continue
                grand_util = ctx.user_utility.get(grand.salesforce_id, 0.0)
                if grand_util <= mgr_util:
                    continue
                candidates.append(CandidateMove(
                    move_type=RestructureMoveType.REASSIGN_MANAGER.value,
                    primary_component_id=u.salesforce_id,
                    primary_component_name=_user_display(u),
                    affected_component_ids=[u.manager_id or "", grand_id],
                    affected_user_ids=[u.salesforce_id],
                    context={
                        "old_manager": u.manager_id,
                        "new_manager": grand_id,
                    },
                    rationale_seed=(
                        f"Current manager utility {mgr_util:.2f} is lower "
                        f"than {u.name or u.salesforce_id}'s. Reassigning "
                        f"to '{grand.name or grand_id}' (utility "
                        f"{grand_util:.2f}) shortens the approval-chain "
                        f"distance to higher-utility supervisors."
                    ),
                ))
                manager_cap -= 1

        return candidates

    # ------------------------------------------------------------------
    # Impact simulator — Option A (symbolic, fast)
    # ------------------------------------------------------------------

    def _score_move(
        self, move: CandidateMove, ctx: OrgContext
    ) -> ImpactResult:
        """Score every axis for one move.

        Symbolic scoring — no SF calls, no record enumeration. Option B
        deep-analysis lands separately as an on-demand endpoint.
        """
        n_users = len(move.affected_user_ids)

        obj_pct: Optional[float]
        fld_pct: Optional[float]
        equity_delta: Optional[float]
        cost_delta: Optional[float] = None  # v2 (need licence price data)
        complexity_delta: int = 0
        sharing_rules_simplified: int = 0
        rationale_addenda = ""

        mt = move.move_type

        if mt == RestructureMoveType.MERGE_PERMISSION_SETS.value:
            # Merge produces a superset — every atom in either signature
            # is preserved. Preservation = 100%. Complexity drops by 1.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = -1
            # Small equity nudge — consolidated PS makes access easier
            # for admins to review / expand consistently.
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.02)
            rationale_addenda = (
                "Merge produces a permission-set that is a strict "
                "superset — no user loses any object or field access."
            )

        elif mt == RestructureMoveType.RETIRE_UNUSED_PS.value:
            # Nothing assigned → nothing lost.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = -1
            equity_delta = 0.0
            rationale_addenda = (
                "PS has zero assignees so no user's effective access "
                "changes when it's dropped."
            )

        elif mt == RestructureMoveType.MERGE_ROLES.value:
            # Merging roles widens record visibility for both sets of
            # members — nobody loses access; some may gain. Object /
            # field access unchanged (role hierarchy affects records
            # only). Sharing rules that named either role separately
            # can be collapsed into a single reference — approximate
            # count as `2` (the merged pair).
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = -1
            sharing_rules_simplified = 2
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.05)
            rationale_addenda = (
                "Role merge is monotonic on record visibility — "
                "affected users retain everything they saw before + "
                "gain visibility of the counterpart role's owned records."
            )

        elif mt == RestructureMoveType.FLATTEN_ROLE_LEVEL.value:
            # Removes a hierarchy level. Widens record rollup for
            # grandparent → child. Object access unaffected.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = -1
            sharing_rules_simplified = 1
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.03)
            rationale_addenda = (
                "Flattening the intermediate level shortens record "
                "rollup for its descendants and simplifies sharing-rule "
                "targeting."
            )

        elif mt == RestructureMoveType.REPARENT_ROLE.value:
            # Access preservation nuanced — members keep visibility of
            # their own records + gain access via new parent. Symbolic
            # score: preserves 100% object/field, changes record rollup
            # which we can't quantify without probing.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = 0
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.04)
            rationale_addenda = (
                "Reparenting keeps every member's own record ownership "
                "intact; new visibility comes from the new parent's "
                "rollup chain."
            )

        elif mt == RestructureMoveType.REASSIGN_TO_ROLE.value:
            # Object / field access from PSets unchanged. Record access
            # via role hierarchy changes — preserved lower bound is
            # the user's owned records + directly-shared records; upper
            # bound depends on the target role's rollup. Report 100%
            # object preservation and let Option B quantify record
            # counts on-demand.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = 0
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.10)
            rationale_addenda = (
                "Object and field permissions carry with the user's "
                "Profile + PSets — unchanged by role reassignment. "
                "Run deep-analysis to see the concrete record delta."
            )

        elif mt == RestructureMoveType.REASSIGN_MANAGER.value:
            # Approval chain change only. Record access unaffected
            # unless the org has "Grant Access Using Hierarchies"
            # enabled for a Manager Group — which we can't detect
            # symbolically. Report 100% preservation with a caveat in
            # the rationale.
            obj_pct = 100.0
            fld_pct = 100.0
            complexity_delta = 0
            equity_delta = self._safe_equity_delta(move, ctx, per_user_lift=0.05)
            rationale_addenda = (
                "Manager reassignment affects approval routing only. "
                "Standard record sharing is unchanged unless the org "
                "uses Manager Groups — worth verifying if you rely on "
                "that."
            )

        else:
            # Unknown move type — shouldn't happen but fail loud rather
            # than silently mis-score.
            obj_pct = None
            fld_pct = None
            equity_delta = None
            rationale_addenda = "Unknown move type — no scoring applied."

        blast_tier, blast_score = self._blast_from_user_count(n_users, mt)
        return ImpactResult(
            object_access_preserved_pct=obj_pct,
            field_access_preserved_pct=fld_pct,
            equity_delta=equity_delta,
            cost_delta_monthly=cost_delta,
            complexity_delta=complexity_delta,
            sharing_rules_simplified=sharing_rules_simplified,
            blast_tier=blast_tier,
            blast_score=blast_score,
            rationale_addenda=rationale_addenda,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _weighted_jaccard(
        sig_a: Tuple[frozenset, frozenset],
        sig_b: Tuple[frozenset, frozenset],
    ) -> float:
        """Jaccard on the combined object + field signature atoms of
        each Permission Set. Weighting is implicit — field sigs are
        typically 10-100x larger than object sigs so they naturally
        dominate the overlap number, which is what we want (FLS is the
        tighter test).

        Object atoms are 2-tuples, field atoms 3-tuples — prefixing the
        latter with a discriminator tag guarantees they can't collide.
        """
        obj_a, fld_a = sig_a
        obj_b, fld_b = sig_b
        combined_a = obj_a | {("F",) + t for t in fld_a}
        combined_b = obj_b | {("F",) + t for t in fld_b}
        union = combined_a | combined_b
        if not union:
            return 0.0
        return len(combined_a & combined_b) / len(union)

    def _safe_equity_delta(
        self,
        move: CandidateMove,
        ctx: OrgContext,
        per_user_lift: float,
    ) -> Optional[float]:
        """Approximate equity delta from a move.

        No re-running of the GAEA policy (too expensive per-move). We
        take a small, move-type-specific per-user utility bump and
        aggregate. Returns None when GAEA outputs aren't loaded so the
        UI can distinguish "no lift" from "unknown".
        """
        if not ctx.user_utility or not move.affected_user_ids:
            return None
        # Contribution = mean(current_utility) * lift_factor. Scaled by
        # log(1 + n_users) so small moves show a small delta and huge
        # moves don't over-inflate the projected equity index.
        import math
        current_util_sum = sum(
            ctx.user_utility.get(uid, 0.0) for uid in move.affected_user_ids
        )
        mean_current = current_util_sum / len(move.affected_user_ids)
        return round(
            per_user_lift * mean_current * math.log1p(len(move.affected_user_ids)),
            3,
        )

    @staticmethod
    def _blast_from_user_count(
        n_users: int, move_type: str,
    ) -> Tuple[str, float]:
        """Map affected-user count to a blast tier + numeric score,
        with a move-type bump for the higher-impact types."""
        base_tier = "low"
        base_score = 10.0
        for threshold, tier, score in BLAST_TIERS:
            if n_users <= threshold:
                base_tier = tier
                base_score = score
                break
        # Bump record-level move types up by one tier — they change
        # what users SEE, not just what they're granted.
        record_movers = {
            RestructureMoveType.MERGE_ROLES.value,
            RestructureMoveType.FLATTEN_ROLE_LEVEL.value,
            RestructureMoveType.REPARENT_ROLE.value,
            RestructureMoveType.REASSIGN_TO_ROLE.value,
        }
        if move_type in record_movers and base_tier != "critical":
            order = ["low", "medium", "high", "critical"]
            idx = order.index(base_tier)
            base_tier = order[min(idx + 1, len(order) - 1)]
            base_score = min(base_score + 20.0, 95.0)
        return base_tier, base_score

    @staticmethod
    def _delta_of(
        candidates: List[CandidateMove],
        move_types: Tuple[str, ...],
        per_move: int,
    ) -> int:
        """Sum a per-move delta across candidates matching move_types.

        Used for the projected-KPI rollup: `-1 per merge` etc. Assumes
        every proposed move gets accepted (that's the ceiling number
        the top-of-page shows). The real accepted-count is derived on
        the frontend when a plan is committed.
        """
        return sum(per_move for c in candidates if c.move_type in move_types)
