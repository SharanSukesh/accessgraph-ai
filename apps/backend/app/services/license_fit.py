"""License-to-Persona Fit Service — right-sizing analysis for every
active Salesforce user.

Answers the CFO question: "which of our SF licenses is a user paying
for but not using, and what's the annual savings if we right-size?"

Approach (in order of preference, fall through to next signal):

  1. Behaviour: how many records of each type does the user OWN?
     Aggregate SOQL against Account / Opportunity / Case / Lead /
     Contact — cheap even in a 5M-record org, gives per-user counts.

  2. Access: which SObjects does the user's effective access
     (Profile PS ∪ direct PS ∪ PSG expansion) actually grant?
     Read + Edit on Opportunity/Lead → Sales-capable, Read + Edit
     on Case → Service-capable, etc.

  3. Login recency: user hasn't logged in in 90+ days → underused.
     Overrides any positive persona.

  4. Metadata fallback: profile name + user_type + license SKU as
     tiebreakers.

Personas (in evidence-required mode — sparse signal falls to
`unknown` rather than being force-classified):
  - sales
  - service
  - marketing
  - admin
  - platform (custom-app user who works exclusively in custom
    objects — no CRM footprint)
  - readonly (logs in, reads records, no writes)
  - inactive (deactivated OR not logged in 90d+)
  - unknown

Fit categories (mapped from persona × current SKU):
  - right_sized
  - overbuilt         — could downgrade to a cheaper SKU
  - wrong_cloud       — Sales SKU acting as Service (or vice versa)
  - underused         — paid seat, no recent activity
  - inactive_billed   — deactivated but still on a paid SKU
  - unknown

Reuses the existing `LicensePriceBook` table + `DEFAULT_PRICE_CATALOG`
for per-SKU monthly cost. No duplication of pricing logic.

Entrypoint:
    service = LicenseFitService(db, org_id)
    run = await service.run(actor_email=...)
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field as dc_field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    LicenseFitAssessment,
    LicenseFitRun,
    LicensePriceBook,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    SalesforceConnection,
    UserSnapshot,
)
from app.salesforce.client import SalesforceAPIClient
from app.services.org_analyzer import (
    DEFAULT_PRICE_BOOK_CENTS,
    _lookup_default_price,
)


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Days-since-last-login threshold. Above → underused / inactive.
UNDERUSED_DAYS_THRESHOLD = 90

# Minimum owned-record count to consider a persona "evidenced" by
# ownership (rather than just access). One-off records don't count as
# a job function.
PERSONA_EVIDENCE_MIN = 3

# SObjects we probe for owner counts. Adding Contact is cheap and
# helps distinguish Sales from Service.
PROBED_OBJECTS = ("Account", "Opportunity", "Case", "Lead", "Contact")


# ----------------------------------------------------------------------
# Result shape
# ----------------------------------------------------------------------


@dataclass
class ScoredUser:
    user_sf_id: str
    user_name: Optional[str]
    user_username: Optional[str]
    user_is_active: bool
    user_profile_name: Optional[str]
    user_department: Optional[str]
    user_title: Optional[str]
    last_login_at: Optional[datetime]
    days_since_login: Optional[int]
    current_license_name: Optional[str]
    current_monthly_cost_cents: int
    persona: str
    fit_category: str
    confidence: str
    recommended_license_name: Optional[str]
    recommended_monthly_cost_cents: Optional[int]
    annual_savings_cents: int
    accounts_owned: int
    opportunities_owned: int
    cases_owned: int
    leads_owned: int
    contacts_owned: int
    evidence: Dict[str, Any] = dc_field(default_factory=dict)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _days_between(
    reference: datetime, target: Optional[datetime]
) -> Optional[int]:
    if target is None:
        return None
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    delta = reference - target
    return max(delta.days, 0)


def _extract_sf_error(exc: Any) -> str:
    try:
        body = exc.response.json()
        if isinstance(body, list) and body:
            first = body[0]
            code = first.get("errorCode") or ""
            msg = first.get("message") or ""
            return f"{code}: {msg}" if code else msg
        if isinstance(body, dict):
            return str(
                body.get("message") or body.get("error_description") or body
            )
    except Exception:  # noqa: BLE001
        pass
    return str(exc)


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class LicenseFitService:
    """Runs the license-fit analysis for one org.

    Stateful only during .run() — every intermediate structure falls
    out of scope when the coroutine returns.
    """

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(
        self, *, actor_email: Optional[str] = None
    ) -> LicenseFitRun:
        import httpx  # local — needed for 401 detection

        started = time.monotonic()

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception(
                "license-fit: _client() failed for org %s", self.org_id
            )
            raise RuntimeError(
                f"Failed to build Salesforce client: {exc}"
            ) from exc

        diagnostics: Dict[str, Dict[str, Any]] = {
            "users": {"count": 0, "error": None},
            "profiles": {"count": 0, "error": None},
            "owner_counts": {},  # per-object subdict
            "price_book_source": "defaults",
        }

        # -- Users (from snapshot — already synced) -------------------
        users = list(
            (
                await self.db.execute(
                    select(UserSnapshot).where(
                        UserSnapshot.organization_id == self.org_id
                    )
                )
            )
            .scalars()
            .all()
        )
        diagnostics["users"]["count"] = len(users)

        # -- Profiles (for user_license_name resolution) --------------
        profiles = list(
            (
                await self.db.execute(
                    select(ProfileSnapshot).where(
                        ProfileSnapshot.organization_id == self.org_id
                    )
                )
            )
            .scalars()
            .all()
        )
        profiles_by_sf: Dict[str, ProfileSnapshot] = {
            p.salesforce_id: p for p in profiles
        }
        diagnostics["profiles"]["count"] = len(profiles)

        # -- Price book (reuses Org Analyzer's table) -----------------
        pb_rows = list(
            (
                await self.db.execute(
                    select(LicensePriceBook).where(
                        LicensePriceBook.organization_id == self.org_id
                    )
                )
            )
            .scalars()
            .all()
        )
        price_book: Dict[str, int] = {}
        # Start from defaults so orgs that haven't customised still
        # get sensible numbers.
        price_book.update(DEFAULT_PRICE_BOOK_CENTS)
        for row in pb_rows:
            if row.is_billed:
                price_book[row.license_name] = int(row.monthly_cost_cents)
            else:
                price_book[row.license_name] = 0
        if pb_rows:
            diagnostics["price_book_source"] = "org_override"

        # -- UserLicense (live — for canonical SKU name mapping) ------
        # Profile.user_license_id points at UserLicense.Id; we resolve
        # the human name here rather than storing it.
        user_licenses: Dict[str, Dict[str, Any]] = {}
        try:
            rows = await client.get_user_licenses()
            for row in rows:
                if row.get("Id"):
                    user_licenses[row["Id"]] = row
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                try:
                    client = await self._refresh_access_token()
                    rows = await client.get_user_licenses()
                    for row in rows:
                        if row.get("Id"):
                            user_licenses[row["Id"]] = row
                except Exception as refresh_exc:
                    logger.exception(
                        "license-fit: token refresh failed for org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh "
                        "failed. Please reconnect Salesforce."
                    ) from refresh_exc
            else:
                logger.warning(
                    "license-fit: UserLicense HTTP %s — SKU names "
                    "may fall back to Profile.name",
                    exc.response.status_code,
                )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "license-fit: UserLicense pull failed (%s)", exc
            )

        # -- Owner counts per object (behaviour signal) --------------
        owners_by_object: Dict[str, Dict[str, int]] = {}
        for obj_name in PROBED_OBJECTS:
            counts = await client.owner_counts_by_object(obj_name)
            owners_by_object[obj_name] = counts
            diagnostics["owner_counts"][obj_name] = len(counts)

        # -- Effective object access — pull ONCE via a batch query
        #    for the subset of objects that indicate persona. We don't
        #    need the full effective-access service here — just "does
        #    the user have any read+edit path to Opportunity / Case?".
        #    Pull all ObjectPermissionSnapshot rows for the org and
        #    join through PermissionSetAssignmentSnapshot.
        obj_perms = list(
            (
                await self.db.execute(
                    select(ObjectPermissionSnapshot).where(
                        ObjectPermissionSnapshot.organization_id
                        == self.org_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assignments = list(
            (
                await self.db.execute(
                    select(PermissionSetAssignmentSnapshot).where(
                        PermissionSetAssignmentSnapshot.organization_id
                        == self.org_id
                    )
                )
            )
            .scalars()
            .all()
        )

        # Build user → set of (object, R/E) pairs.
        # ObjectPermissionSnapshot.parent_id is the PermissionSet SF id.
        # Cross-ref with assignments: assignee_id → permission_set_id.
        obj_perms_by_ps: Dict[str, List[ObjectPermissionSnapshot]] = (
            defaultdict(list)
        )
        for op in obj_perms:
            obj_perms_by_ps[op.parent_id].append(op)
        ps_by_user: Dict[str, Set[str]] = defaultdict(set)
        for a in assignments:
            ps_by_user[a.assignee_id].add(a.permission_set_id)

        logger.warning(
            "license-fit: org=%s users=%d profiles=%d "
            "owner_counts_per_object=%s",
            self.org_id, len(users), len(profiles),
            {k: len(v) for k, v in owners_by_object.items()},
        )

        # -- Score every active user ---------------------------------
        now = datetime.now(timezone.utc)
        scored: List[ScoredUser] = []
        for user in users:
            item = self._score_user(
                user=user,
                profiles_by_sf=profiles_by_sf,
                user_licenses=user_licenses,
                owners_by_object=owners_by_object,
                obj_perms_by_ps=obj_perms_by_ps,
                ps_by_user=ps_by_user,
                price_book=price_book,
                now=now,
            )
            if item is not None:
                scored.append(item)

        # -- Sort by savings potential (highest first) so the
        #    consultant's list is naturally actionable.
        scored.sort(
            key=lambda s: (-s.annual_savings_cents, s.user_name or "")
        )

        # -- Rollups -------------------------------------------------
        counts: Dict[str, int] = defaultdict(int)
        total_savings = 0
        total_current = 0
        for s in scored:
            counts[s.fit_category] += 1
            total_savings += s.annual_savings_cents
            total_current += s.current_monthly_cost_cents * 12

        duration_ms = int((time.monotonic() - started) * 1000)

        # -- Persist -------------------------------------------------
        run = LicenseFitRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            users_assessed=len(scored),
            users_right_sized=counts["right_sized"],
            users_overbuilt=counts["overbuilt"],
            users_wrong_cloud=counts["wrong_cloud"],
            users_underused=counts["underused"],
            users_inactive_billed=counts["inactive_billed"],
            users_unknown=counts["unknown"],
            total_annual_savings_cents=total_savings,
            total_current_annual_cost_cents=total_current,
            duration_ms=duration_ms,
            error=None,
            source_diagnostics=diagnostics,
        )
        self.db.add(run)
        await self.db.flush()

        for s in scored:
            self.db.add(
                LicenseFitAssessment(
                    organization_id=self.org_id,
                    run_id=run.id,
                    user_sf_id=s.user_sf_id,
                    user_name=s.user_name,
                    user_username=s.user_username,
                    user_is_active=s.user_is_active,
                    user_profile_name=s.user_profile_name,
                    user_department=s.user_department,
                    user_title=s.user_title,
                    last_login_at=s.last_login_at,
                    days_since_login=s.days_since_login,
                    current_license_name=s.current_license_name,
                    current_monthly_cost_cents=s.current_monthly_cost_cents,
                    persona=s.persona,
                    fit_category=s.fit_category,
                    confidence=s.confidence,
                    recommended_license_name=s.recommended_license_name,
                    recommended_monthly_cost_cents=(
                        s.recommended_monthly_cost_cents
                    ),
                    annual_savings_cents=s.annual_savings_cents,
                    accounts_owned=s.accounts_owned,
                    opportunities_owned=s.opportunities_owned,
                    cases_owned=s.cases_owned,
                    leads_owned=s.leads_owned,
                    contacts_owned=s.contacts_owned,
                    evidence=s.evidence,
                )
            )

        await self.db.commit()
        logger.info(
            "license-fit: org=%s persisted run=%s users=%d "
            "savings=$%.0f/yr in %dms",
            self.org_id, run.id, len(scored),
            total_savings / 100.0, duration_ms,
        )
        return run

    # ------------------------------------------------------------------
    # Per-user scoring
    # ------------------------------------------------------------------

    def _score_user(
        self,
        *,
        user: UserSnapshot,
        profiles_by_sf: Dict[str, ProfileSnapshot],
        user_licenses: Dict[str, Dict[str, Any]],
        owners_by_object: Dict[str, Dict[str, int]],
        obj_perms_by_ps: Dict[str, List[ObjectPermissionSnapshot]],
        ps_by_user: Dict[str, Set[str]],
        price_book: Dict[str, int],
        now: datetime,
    ) -> Optional[ScoredUser]:
        # Resolve profile → user license name
        profile = (
            profiles_by_sf.get(user.profile_id) if user.profile_id else None
        )
        profile_name = profile.name if profile else None
        user_license_sf_id = (
            profile.user_license_id if profile else None
        )
        license_row = (
            user_licenses.get(user_license_sf_id)
            if user_license_sf_id
            else None
        )
        # Prefer MasterLabel (customer-facing) over Name (system).
        license_name = (
            (license_row or {}).get("MasterLabel")
            or (license_row or {}).get("Name")
        )

        # Cost lookup — org override → substring catalog → 0.
        current_cost = price_book.get(license_name or "", 0)
        if current_cost == 0 and license_name:
            catalog_hit = _lookup_default_price(license_name)
            if catalog_hit is not None:
                current_cost = catalog_hit

        # Ownership signal
        uid = user.salesforce_id
        accounts = owners_by_object.get("Account", {}).get(uid, 0)
        opps = owners_by_object.get("Opportunity", {}).get(uid, 0)
        cases = owners_by_object.get("Case", {}).get(uid, 0)
        leads = owners_by_object.get("Lead", {}).get(uid, 0)
        contacts = owners_by_object.get("Contact", {}).get(uid, 0)

        # Access signal — which objects does the user's PSet stack grant?
        access_objs: Set[str] = set()
        access_edit_objs: Set[str] = set()
        for ps_sf_id in ps_by_user.get(uid, set()):
            for op in obj_perms_by_ps.get(ps_sf_id, []):
                if op.permissions_read:
                    access_objs.add(op.sobject_type)
                if op.permissions_edit:
                    access_edit_objs.add(op.sobject_type)

        # Login signal
        days_since_login = _days_between(now, user.last_login_at)

        # Persona classification (evidence-required)
        persona, confidence, tie_reason = self._classify_persona(
            user=user,
            profile_name=profile_name,
            license_name=license_name,
            accounts=accounts,
            opps=opps,
            cases=cases,
            leads=leads,
            contacts=contacts,
            access_edit_objs=access_edit_objs,
            days_since_login=days_since_login,
        )

        # Fit category from persona × license SKU
        fit, recommended_name, recommended_cost, fit_reason = (
            self._classify_fit(
                persona=persona,
                license_name=license_name,
                current_cost=current_cost,
                days_since_login=days_since_login,
                user_is_active=user.is_active,
                price_book=price_book,
            )
        )

        # Savings only makes sense when we have BOTH a current cost
        # AND a lower recommended cost.
        annual_savings = 0
        if (
            recommended_cost is not None
            and recommended_cost < current_cost
        ):
            annual_savings = (current_cost - recommended_cost) * 12

        evidence: Dict[str, Any] = {
            "persona_reason": tie_reason,
            "fit_reason": fit_reason,
            "profile": profile_name,
            "access_edit_objects_top": sorted(
                list(access_edit_objs)
            )[:10],
        }

        return ScoredUser(
            user_sf_id=uid,
            user_name=user.name,
            user_username=user.username,
            user_is_active=bool(user.is_active),
            user_profile_name=profile_name,
            user_department=user.department,
            user_title=user.title,
            last_login_at=user.last_login_at,
            days_since_login=days_since_login,
            current_license_name=license_name,
            current_monthly_cost_cents=current_cost,
            persona=persona,
            fit_category=fit,
            confidence=confidence,
            recommended_license_name=recommended_name,
            recommended_monthly_cost_cents=recommended_cost,
            annual_savings_cents=annual_savings,
            accounts_owned=accounts,
            opportunities_owned=opps,
            cases_owned=cases,
            leads_owned=leads,
            contacts_owned=contacts,
            evidence=evidence,
        )

    def _classify_persona(
        self,
        *,
        user: UserSnapshot,
        profile_name: Optional[str],
        license_name: Optional[str],
        accounts: int,
        opps: int,
        cases: int,
        leads: int,
        contacts: int,
        access_edit_objs: Set[str],
        days_since_login: Optional[int],
    ) -> tuple[str, str, str]:
        """Return (persona, confidence, reason).

        Order of decisions (highest priority first):
          1. Not active → inactive
          2. Never logged in / stale login → inactive-billed candidate
          3. Ownership evidence >= threshold
          4. Access-based evidence when logins are recent
          5. Profile / license name hints
          6. unknown
        """
        # 1. Deactivated user
        if not user.is_active:
            return (
                "inactive",
                "high",
                "User is deactivated in Salesforce",
            )

        # 2. Never / very rarely logs in
        if days_since_login is None:
            return (
                "inactive",
                "high",
                "User has never logged in",
            )
        if days_since_login > UNDERUSED_DAYS_THRESHOLD:
            return (
                "inactive",
                "high",
                f"No login in {days_since_login} days",
            )

        # 3. Ownership-based classification
        sales_signal = opps + leads
        service_signal = cases
        sales_evidence = (
            opps >= PERSONA_EVIDENCE_MIN
            or leads >= PERSONA_EVIDENCE_MIN
        )
        service_evidence = cases >= PERSONA_EVIDENCE_MIN

        if sales_evidence and service_signal > 3 * sales_signal:
            # Odd shape — flag for the wrong-cloud branch
            return (
                "service",
                "medium",
                f"Owns {cases} Cases vs {sales_signal} Sales records "
                f"— appears to work Service despite Sales SKU",
            )
        if sales_evidence and not service_evidence:
            return (
                "sales",
                "high",
                f"Owns {opps} Opportunities + {leads} Leads",
            )
        if service_evidence and not sales_evidence:
            return (
                "service",
                "high",
                f"Owns {cases} Cases",
            )
        if sales_evidence and service_evidence:
            # Owns both — go with the larger footprint but medium
            # confidence since it's ambiguous.
            if sales_signal >= service_signal:
                return (
                    "sales",
                    "medium",
                    f"Owns {sales_signal} Sales records vs "
                    f"{service_signal} Cases",
                )
            return (
                "service",
                "medium",
                f"Owns {service_signal} Cases vs {sales_signal} "
                f"Sales records",
            )

        # 4. Metadata-based hints when ownership is sparse
        pname = (profile_name or "").lower()
        lname = (license_name or "").lower()
        if "admin" in pname or "administrator" in pname:
            return (
                "admin",
                "medium",
                f"Profile '{profile_name}' indicates administrator",
            )
        if "platform" in lname or "one app" in lname:
            return (
                "platform",
                "medium",
                f"License '{license_name}' is a Platform SKU",
            )
        if "chatter" in lname or "chatter" in pname:
            return (
                "readonly",
                "medium",
                "Chatter-only user — collaboration but no CRM data",
            )
        if "community" in lname or "customer portal" in lname:
            return (
                "community",
                "high",
                f"External community/portal user ({license_name})",
            )

        # 5. Access-signal fallback — user CAN edit Opportunity but
        # DOES NOT own any → readonly analyst likely, or hasn't
        # gotten around to using it yet.
        can_edit_sales = bool(
            {"Opportunity", "Lead"} & access_edit_objs
        )
        can_edit_service = bool({"Case"} & access_edit_objs)
        if can_edit_sales and not (
            accounts + opps + leads + cases + contacts
        ):
            return (
                "readonly",
                "low",
                "Has Sales edit access but owns no records",
            )
        if can_edit_service and not (
            accounts + opps + leads + cases + contacts
        ):
            return (
                "readonly",
                "low",
                "Has Service edit access but owns no records",
            )

        # 6. Give up cleanly. `unknown` is the correct answer under
        # evidence-required mode — better than a false positive.
        return (
            "unknown",
            "low",
            "Insufficient behavioural signal to classify",
        )

    def _classify_fit(
        self,
        *,
        persona: str,
        license_name: Optional[str],
        current_cost: int,
        days_since_login: Optional[int],
        user_is_active: bool,
        price_book: Dict[str, int],
    ) -> tuple[str, Optional[str], Optional[int], str]:
        """Return (fit_category, recommended_license_name,
        recommended_monthly_cost_cents, reason).

        Recommended cost is None when we don't want to recommend a
        change (unknown persona, community user, etc.).
        """
        lname = (license_name or "").lower()

        # Free / community users are always right-sized as far as
        # cost goes.
        if current_cost == 0:
            return (
                "right_sized",
                None,
                None,
                "License is $0 — nothing to right-size",
            )

        # Inactive person on a paid seat = biggest single savings
        # signal.
        if not user_is_active and current_cost > 0:
            return (
                "inactive_billed",
                "Deactivate user (free up seat)",
                0,
                "Deactivated user still assigned to a paid SKU — free "
                "up the seat",
            )
        if persona == "inactive" and current_cost > 0:
            return (
                "underused",
                "Deactivate or downgrade to Chatter Free",
                0,
                (
                    "No login activity — paid seat is not being used"
                    if days_since_login is None
                    else f"No login in {days_since_login} days — seat "
                    "isn't being used"
                ),
            )

        # Wrong-cloud detection: user is a Service persona but license
        # is Sales-branded, or vice versa. Only trigger on high-
        # confidence full-license SKUs where we can defensibly say
        # "switch clouds".
        if persona == "service" and (
            "sales cloud" in lname
        ):
            svc_cost = _find_price(price_book, "service cloud")
            if svc_cost is not None and svc_cost <= current_cost:
                return (
                    "wrong_cloud",
                    "Service Cloud",
                    svc_cost,
                    "User works Cases exclusively but holds a Sales "
                    "Cloud SKU — switch to Service Cloud",
                )
        if persona == "sales" and "service cloud" in lname:
            sc_cost = _find_price(price_book, "sales cloud")
            if sc_cost is not None and sc_cost <= current_cost:
                return (
                    "wrong_cloud",
                    "Sales Cloud",
                    sc_cost,
                    "User works Opportunities exclusively but holds a "
                    "Service Cloud SKU — switch to Sales Cloud",
                )

        # Overbuilt — persona is simpler than the SKU. Recommend
        # Platform (which is cheaper than any full CRM SKU).
        platform_cost = _find_price(
            price_book, "salesforce platform"
        )
        if platform_cost is None:
            platform_cost = 2500  # $25 hard fallback

        if persona in ("platform", "readonly") and (
            "salesforce" in lname
            and "platform" not in lname
            and "community" not in lname
        ):
            if platform_cost < current_cost:
                return (
                    "overbuilt",
                    "Salesforce Platform",
                    platform_cost,
                    f"User works only in custom objects or is read-only"
                    " — Platform SKU is sufficient",
                )

        if persona == "admin":
            # Admins usually need full Salesforce. Don't recommend a
            # downgrade unless there's overwhelming evidence.
            return (
                "right_sized",
                None,
                None,
                "Administrator persona — full license appropriate",
            )

        if persona == "community":
            return (
                "right_sized",
                None,
                None,
                "External user on Community/Portal license — expected",
            )

        if persona == "unknown":
            return (
                "unknown",
                None,
                None,
                "Not enough evidence for a right-size recommendation",
            )

        # Everything else = right-sized (Sales persona on Sales SKU,
        # Service persona on Service SKU).
        return (
            "right_sized",
            None,
            None,
            f"Persona '{persona}' matches SKU '{license_name}'",
        )

    # ------------------------------------------------------------------
    # SF client support (mirrors PackageSprawl / ReportSprawl)
    # ------------------------------------------------------------------

    async def _client(self) -> SalesforceAPIClient:
        row = await self.db.execute(
            select(SalesforceConnection)
            .where(SalesforceConnection.organization_id == self.org_id)
            .order_by(desc(SalesforceConnection.created_at))
            .limit(1)
        )
        conn = row.scalar_one_or_none()
        if conn is None:
            raise RuntimeError(
                f"No Salesforce connection for organization {self.org_id}"
            )
        return SalesforceAPIClient(
            instance_url=conn.instance_url,
            access_token=conn.access_token,
        )

    async def _refresh_access_token(self) -> SalesforceAPIClient:
        from app.salesforce.oauth import SalesforceOAuthClient

        row = await self.db.execute(
            select(SalesforceConnection)
            .where(
                SalesforceConnection.organization_id == self.org_id,
                SalesforceConnection.is_active.is_(True),
            )
        )
        conn = row.scalar_one_or_none()
        if conn is None or not conn.refresh_token:
            raise RuntimeError(
                f"No refresh_token available for org {self.org_id} — "
                "user must re-authenticate with Salesforce."
            )
        instance_url = conn.instance_url or ""
        is_sandbox = (
            ".sandbox." in instance_url
            or ".scratch." in instance_url
            or instance_url.startswith("https://cs")
        )
        login_url = (
            "https://test.salesforce.com" if is_sandbox else None
        )
        logger.warning(
            "license-fit: access token expired, refreshing (sandbox=%s)",
            is_sandbox,
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        logger.info("license-fit: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )


def _find_price(
    price_book: Dict[str, int], needle: str
) -> Optional[int]:
    """Case-insensitive substring lookup in the merged price book.
    Returns the first match's monthly cents or None."""
    needle_lc = needle.lower()
    for name, cents in price_book.items():
        if needle_lc in name.lower():
            return cents
    catalog_hit = _lookup_default_price(needle)
    return catalog_hit
