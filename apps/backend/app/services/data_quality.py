"""Data Quality Service — per-object health scoring.

Additive analytics engine. Mirrors the OrgAnalyzerService pattern:
a POST-triggered run writes a DataQualityRun snapshot with a
per-object ObjectQualityScore fanned out beneath it.

Score model (each component 0-100, higher is better):

  * completeness_pct  — of the fields marked "createable + non-nillable"
    on this object, what percent of the sampled records have a value
    populated. Approximation for "required-adjacent" fields — the
    intuition is that a field the org marked as *required to create*
    should also be populated on existing records.

  * duplicate_pct     — of the sampled records, what percent participate
    in a duplicate cluster on the object's canonical natural key
    (Account/Opportunity/Case: Name; Contact/Lead: Email; anything else:
    Name). Higher = worse.

  * staleness_pct     — of the total record count, what percent have
    a LastModifiedDate older than the configured threshold (default
    180 days). Higher = worse.

Composite score = 0.5 * completeness
                + 0.3 * (100 - duplicate_pct)
                + 0.2 * (100 - staleness_pct)

Weights favour completeness because it's what a consulting client
first sees when they open a report; dupes and staleness are secondary
signals that surface in the drill-down.

Analysis scope:
  Business objects — Account, Contact, Lead, Opportunity, Case — plus
  every custom object (name endswith `__c`) reported by global describe.
  System objects (User, Profile, PermissionSet, etc.) are skipped
  because "data quality" is a business-data concept, not a metadata one.
  Any object without a LastModifiedDate is also skipped.

Nothing in this module mutates existing tables or engines. If the run
fails partway through, the caller sees a snapshot with `error` set;
partial results are still persisted so a slow SOQL failure doesn't
lose the objects that already succeeded.
"""
from __future__ import annotations

import logging
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    DataQualityRun,
    ObjectQualityScore,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Business objects analysed by default. Widened past the CRM-5 to
# cover Sales / Service / Marketing / CPQ canon so a mid-market org's
# dashboard doesn't come out dominated by empty custom objects.
# Custom objects are added at run-time from global describe.
STANDARD_OBJECTS: List[str] = [
    # CRM core
    "Account",
    "Contact",
    "Lead",
    "Opportunity",
    "Case",
    # Sales pipeline supporting objects
    "Contract",
    "Order",
    "Quote",
    "OpportunityLineItem",
    "OrderItem",
    "QuoteLineItem",
    # Marketing
    "Campaign",
    "CampaignMember",
    # Catalog
    "Product2",
    "Pricebook2",
    "PricebookEntry",
    "Asset",
    # Service
    "Solution",
    "Entitlement",
    "ServiceContract",
]

# Objects to explicitly skip even if they show up in the global-describe
# custom-object crawl. Setup / metadata objects aren't "business data".
SKIP_OBJECT_PREFIXES: Tuple[str, ...] = (
    # Salesforce configuration / audit / support internals
    "Apex",
    "PermissionSet",
    "Profile",
    "User",
    "Group",
    "Setup",
    "AsyncApex",
    "Login",
    "Event",
    "Sharing",
    "Fieldset",
    "CustomField",
    "CustomTab",
    "OrgUser",
)

# Which field on each object identifies a "canonical duplicate key"?
# Falls back to Name for anything not listed. Contacts / Leads dedup
# on Email because Name collisions are common and low-signal there.
DUPLICATE_KEY_FIELDS: Dict[str, str] = {
    "Contact": "Email",
    "Lead": "Email",
}

# Sample cap per object. 500 is enough to make completeness / dupe rate
# statistically meaningful without blowing the SOQL response payload.
DEFAULT_SAMPLE_SIZE = 500

# Records untouched for this many days count as "stale". Chosen to
# approximately match the SaaS-industry "quarterly touch" convention.
DEFAULT_STALENESS_DAYS = 180

# Composite score weights — kept as class-level constants so a future
# tuner can override without threading them through method arguments.
WEIGHT_COMPLETENESS = 0.5
WEIGHT_DUPLICATES = 0.3
WEIGHT_STALENESS = 0.2


# Skip reason categories. Surfaced in the run's `error` JSON so the
# frontend can render a "N objects skipped — see why" tooltip. Kept as
# plain strings (not an Enum) so historical rows stay JSON-round-trippable
# without a lookup step.
SKIP_DESCRIBE_FAILED = "describe_failed"
SKIP_NO_LAST_MODIFIED = "no_last_modified"
SKIP_NO_INSPECTABLE_FIELDS = "no_inspectable_fields"
SKIP_COUNT_FAILED = "count_failed"
SKIP_EMPTY = "empty"
SKIP_SAMPLE_FAILED = "sample_failed"
SKIP_SAMPLE_EMPTY = "sample_empty"


# ----------------------------------------------------------------------
# Result shapes
# ----------------------------------------------------------------------


@dataclass
class ObjectQualityResult:
    """In-memory result for one object before it's persisted."""
    object_name: str
    object_label: str
    is_custom: bool
    record_count: int
    sampled_count: int
    completeness_pct: float
    duplicate_pct: float
    staleness_pct: float
    fields_inspected: int
    fields_with_gaps: int
    duplicate_clusters: int
    stale_record_count: int
    evidence: Dict[str, Any]

    @property
    def score(self) -> float:
        # Higher is better on every axis: completeness is already so,
        # duplicates + staleness get flipped so 0% collisions = 100 pts.
        return (
            WEIGHT_COMPLETENESS * self.completeness_pct
            + WEIGHT_DUPLICATES * (100.0 - self.duplicate_pct)
            + WEIGHT_STALENESS * (100.0 - self.staleness_pct)
        )


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class DataQualityService:
    """Runs the data-quality computation for one org.

    Usage:
        service = DataQualityService(db, org_id)
        run = await service.run(actor_email="ops@newton.example")

    The service is stateless past `db` and `org_id`; construct one per
    invocation. All Salesforce IO goes through SalesforceAPIClient — no
    direct network calls from this module.
    """

    def __init__(
        self,
        db: AsyncSession,
        org_id: str,
        *,
        sample_size: int = DEFAULT_SAMPLE_SIZE,
        staleness_days: int = DEFAULT_STALENESS_DAYS,
    ) -> None:
        self.db = db
        self.org_id = org_id
        self.sample_size = sample_size
        self.staleness_days = staleness_days

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(self, *, actor_email: Optional[str] = None) -> DataQualityRun:
        """Full data-quality pass. Persists a DataQualityRun row + one
        ObjectQualityScore per analysed object. Returns the run row.

        Silently skips objects that error mid-way (network hiccup, SOQL
        parse error on a custom field, etc.) — those get logged but the
        rest of the run still lands. Per-reason skip counts are stored
        in the run's `error` field as JSON so operators can see WHY
        the analysed-count came out low without a fresh code drop.
        """
        import json as _json

        started = time.monotonic()
        client = await self._client()
        threshold = datetime.now(timezone.utc) - timedelta(days=self.staleness_days)
        analysis_targets = await self._resolve_analysis_targets(client)

        results: List[ObjectQualityResult] = []
        # skip_reasons: category → count. Categories match _SkipReason
        # enum below; the frontend surfaces them in a "N objects skipped"
        # tooltip so operators can debug why coverage is low.
        skip_reasons: Dict[str, int] = {}
        for obj in analysis_targets:
            try:
                res, skip_reason = await self._analyze_object(
                    client, obj["name"], obj["label"], obj["custom"], threshold
                )
                if res is None:
                    reason = skip_reason or "unknown"
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                    logger.info(
                        "data-quality: skipped %s — %s", obj["name"], reason
                    )
                    continue
                results.append(res)
            except Exception as exc:  # noqa: BLE001 — one object's failure shouldn't sink the run
                # exc_info=True includes the full traceback so we can
                # actually diagnose what's crashing without a code drop.
                # Also stash the exception class + message on a
                # dynamic dict keyed by class so recurring errors are
                # visible in the log without repeating tracebacks.
                logger.warning(
                    "data-quality analysis failed for %s: %s: %s",
                    obj["name"], type(exc).__name__, exc,
                    exc_info=True,
                )
                skip_reasons["error"] = skip_reasons.get("error", 0) + 1

        skipped = sum(skip_reasons.values())
        skip_error_json = (
            _json.dumps({"skip_reasons": skip_reasons}) if skip_reasons else None
        )

        # Aggregate averages only over objects that HAVE records. Empty
        # objects are legitimate results (they show up in the Objects
        # list marked "0 records") but a "perfect quality on nothing"
        # score would drag the org KPI toward 100 and hide real issues.
        scored = [r for r in results if r.record_count > 0]
        run = DataQualityRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            objects_analyzed=len(results),
            objects_skipped=skipped,
            avg_score=_avg(r.score for r in scored),
            avg_completeness=_avg(r.completeness_pct for r in scored),
            avg_duplicate_pct=_avg(r.duplicate_pct for r in scored),
            avg_staleness_pct=_avg(r.staleness_pct for r in scored),
            sample_size=self.sample_size,
            staleness_threshold_days=self.staleness_days,
            duration_ms=int((time.monotonic() - started) * 1000),
            error=skip_error_json,
        )
        self.db.add(run)
        await self.db.flush()  # populate run.id before FK'ing the child rows

        for r in results:
            self.db.add(
                ObjectQualityScore(
                    organization_id=self.org_id,
                    run_id=run.id,
                    object_name=r.object_name,
                    object_label=r.object_label,
                    is_custom=r.is_custom,
                    record_count=r.record_count,
                    sampled_count=r.sampled_count,
                    score=r.score,
                    completeness_pct=r.completeness_pct,
                    duplicate_pct=r.duplicate_pct,
                    staleness_pct=r.staleness_pct,
                    fields_inspected=r.fields_inspected,
                    fields_with_gaps=r.fields_with_gaps,
                    duplicate_clusters=r.duplicate_clusters,
                    stale_record_count=r.stale_record_count,
                    evidence=r.evidence,
                )
            )

        await self.db.commit()
        await self.db.refresh(run)
        logger.info(
            "data-quality run %s by %s: %d analysed (%d scored, %d empty), "
            "%d skipped (reasons=%s), avg_score=%.1f",
            run.id,
            actor_email or "system",
            run.objects_analyzed,
            len(scored),
            len(results) - len(scored),
            run.objects_skipped,
            skip_reasons or "-",
            run.avg_score,
        )
        return run

    # ------------------------------------------------------------------
    # Analysis primitives
    # ------------------------------------------------------------------

    async def _analyze_object(
        self,
        client: SalesforceAPIClient,
        object_name: str,
        object_label: str,
        is_custom: bool,
        staleness_threshold: datetime,
    ) -> Tuple[Optional[ObjectQualityResult], Optional[str]]:
        """Analyse a single object. Returns (result, skip_reason).

        Returns (None, reason) when the object should be skipped. The
        reason is one of the SKIP_* constants and is aggregated across
        the run so operators can see WHY coverage came out low.
        """
        try:
            describe = await client.describe_object(object_name)
        except Exception as exc:  # noqa: BLE001
            logger.info("describe failed for %s: %s", object_name, exc)
            return None, SKIP_DESCRIBE_FAILED

        fields = describe.get("fields", []) or []
        if not any(f.get("name") == "LastModifiedDate" for f in fields):
            return None, SKIP_NO_LAST_MODIFIED

        # Pick the fields we'll inspect for completeness. Layered
        # fallback so we always find something to score against, even
        # on objects with no obviously-required fields.
        #
        #   1. createable + non-nillable + non-calculated + non-auto —
        #      SF's own view of "must-populate on insert". These are
        #      the strongest signal but many objects have zero of them
        #      because SF marks most fields nillable.
        #   2. any createable + custom + non-calculated — for custom
        #      objects the admin defined; usually intentional.
        #   3. any createable + non-calculated — broadest net. Catches
        #      standard objects where every field is technically
        #      nillable (Account past Name, Contact past LastName, etc.)
        #
        # The fallback matters: previously the strict step-1 filter
        # skipped most standard objects that lacked a step-1 hit, so
        # only 1 object survived the whole pipeline.
        required = self._pick_completeness_fields(fields)
        if not required:
            return None, SKIP_NO_INSPECTABLE_FIELDS
        required_names = [f["name"] for f in required]

        try:
            record_count = await client.count_sobject(object_name)
        except Exception as exc:  # noqa: BLE001
            # count_sobject only catches HTTPStatusError internally;
            # a JSONDecodeError / Pydantic validation error / connection
            # reset can slip past and would blow up here as an
            # "Unexpected error" in the aggregate. Categorise them.
            logger.info(
                "count_sobject raised for %s: %s: %s",
                object_name, type(exc).__name__, exc,
            )
            return None, SKIP_COUNT_FAILED
        if record_count is None:
            # count failed (permission denied, object not queryable) —
            # skip rather than fabricate a score.
            return None, SKIP_COUNT_FAILED
        if record_count == 0:
            # Empty object — return a valid result marked as such so it
            # still shows up in the Objects list, but score components
            # are all zero and the aggregation layer excludes it from
            # the avg_score. The frontend renders "0 records" in place
            # of a score chip when evidence.status == "empty".
            return ObjectQualityResult(
                object_name=object_name,
                object_label=object_label,
                is_custom=is_custom,
                record_count=0,
                sampled_count=0,
                completeness_pct=0.0,
                duplicate_pct=0.0,
                staleness_pct=0.0,
                fields_inspected=len(required_names),
                fields_with_gaps=0,
                duplicate_clusters=0,
                stale_record_count=0,
                evidence={
                    "status": "empty",
                    "note": "Object has no records — nothing to score.",
                },
            ), None

        # ---- Completeness + duplicate sample ------------------------
        dup_key = DUPLICATE_KEY_FIELDS.get(object_name, "Name")
        # Make sure dup_key is actually queryable on this object.
        has_dup_key = any(f.get("name") == dup_key for f in fields)
        select_fields = ["Id"] + required_names
        if has_dup_key and dup_key not in select_fields:
            select_fields.append(dup_key)
        elif not has_dup_key:
            # Fall back so we don't blow up on custom objects without Name.
            dup_key = "Id"

        soql = (
            f"SELECT {', '.join(select_fields)} FROM {object_name} "
            f"ORDER BY LastModifiedDate DESC "
            f"LIMIT {self.sample_size}"
        )
        try:
            sample_resp = await client.query(soql)
        except Exception as exc:  # noqa: BLE001
            # Log the SOQL so operators can debug MALFORMED_QUERY /
            # INVALID_FIELD failures without a rebuild. Truncate the
            # SOQL to 200 chars so a very wide SELECT list doesn't
            # spam the log.
            logger.info(
                "sample query failed for %s: %s | soql=%s",
                object_name, exc, soql[:200],
            )
            return None, SKIP_SAMPLE_FAILED

        # QueryResponse is a Pydantic model — use attribute access, not
        # .get(). Getting this wrong silently AttributeError'd every
        # object with records, so only 0-record objects (which return
        # early before this branch) survived — hence "N objects, all empty".
        records = sample_resp.records or []
        sampled = len(records)
        if sampled == 0:
            # Count said non-zero but sample returned empty. Can happen
            # with permission filtering (record-level sharing). Skip.
            return None, SKIP_SAMPLE_EMPTY

        # Completeness — for each required field, what fraction of the
        # sample has a non-null value.
        per_field_gap: Dict[str, int] = {}
        total_slots = 0
        populated_slots = 0
        for rec in records:
            for fname in required_names:
                total_slots += 1
                val = rec.get(fname)
                if _is_populated(val):
                    populated_slots += 1
                else:
                    per_field_gap[fname] = per_field_gap.get(fname, 0) + 1
        completeness_pct = (
            (populated_slots / total_slots) * 100.0 if total_slots else 100.0
        )
        # Fields where >50% of the sample is missing this value.
        fields_with_gaps = sum(
            1 for f in required_names
            if per_field_gap.get(f, 0) > (sampled / 2 if sampled else 0)
        )

        # ---- Duplicates on the natural key --------------------------
        key_counter: Counter[str] = Counter()
        for rec in records:
            raw = rec.get(dup_key)
            if raw is None:
                continue
            key = str(raw).strip().lower()
            if not key:
                continue
            key_counter[key] += 1
        dupe_clusters = [(k, c) for k, c in key_counter.items() if c > 1]
        # % of sampled records that participate in ANY duplicate cluster.
        dupe_record_count = sum(c for _, c in dupe_clusters)
        duplicate_pct = (
            (dupe_record_count / sampled) * 100.0 if sampled else 0.0
        )

        # ---- Staleness ----------------------------------------------
        threshold_iso = staleness_threshold.strftime("%Y-%m-%dT%H:%M:%SZ")
        stale_soql = (
            f"SELECT COUNT() FROM {object_name} "
            f"WHERE LastModifiedDate < {threshold_iso}"
        )
        try:
            stale_resp = await client.query(stale_soql)
            stale_count = int(stale_resp.totalSize or 0)
        except Exception:  # noqa: BLE001
            stale_count = 0
        staleness_pct = (
            (stale_count / record_count) * 100.0 if record_count else 0.0
        )

        # Evidence is presentational — a failure here shouldn't sink
        # the whole object. We already have valid completeness / dup /
        # staleness numbers; just drop the drilldown on error.
        try:
            evidence = self._build_evidence(
                per_field_gap=per_field_gap,
                required_names=required_names,
                sampled=sampled,
                dupe_clusters=dupe_clusters,
                dup_key=dup_key,
                records=records,
                staleness_threshold=staleness_threshold,
            )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "_build_evidence failed for %s: %s: %s",
                object_name, type(exc).__name__, exc,
            )
            evidence = {"note": "Evidence build failed — see server log."}

        return ObjectQualityResult(
            object_name=object_name,
            object_label=object_label,
            is_custom=is_custom,
            record_count=int(record_count),
            sampled_count=sampled,
            completeness_pct=completeness_pct,
            duplicate_pct=duplicate_pct,
            staleness_pct=staleness_pct,
            fields_inspected=len(required_names),
            fields_with_gaps=fields_with_gaps,
            duplicate_clusters=len(dupe_clusters),
            stale_record_count=stale_count,
            evidence=evidence,
        )

    # ------------------------------------------------------------------
    # Support
    # ------------------------------------------------------------------

    def _pick_completeness_fields(
        self, fields: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Choose which fields we'll score completeness against.

        Three tiers, tried in order — first tier that returns a
        non-empty list wins. Cap at 20 fields to keep SOQL length
        reasonable and evidence blobs bounded.
        """
        # Fields we NEVER want to inspect regardless of tier: system
        # audit fields (populated by SF, meaningless for "data quality")
        # and encrypted/hidden fields (can't read anyway).
        SYSTEM_FIELDS = {
            "Id", "IsDeleted", "SystemModstamp", "LastActivityDate",
            "LastReferencedDate", "LastViewedDate",
        }

        # Field types that CAN'T be directly queried in SOQL — putting
        # any of these in the SELECT clause makes the whole query fail
        # with MALFORMED_QUERY, silently killing the entire object's
        # sample. Compound fields (address/location) must be accessed
        # via their subfields (BillingStreet etc.); base64 is binary
        # content that can't round-trip through JSON.
        UNQUERYABLE_TYPES = {"address", "location", "base64"}

        def is_inspectable(f: Dict[str, Any]) -> bool:
            name = f.get("name") or ""
            if name in SYSTEM_FIELDS:
                return False
            if f.get("calculated"):
                return False
            if f.get("autoNumber"):
                return False
            if not f.get("createable"):
                return False
            # Encrypted fields return masks in queries — skip.
            if f.get("encrypted"):
                return False
            # Compound + binary types blow up MALFORMED_QUERY.
            if (f.get("type") or "").lower() in UNQUERYABLE_TYPES:
                return False
            return True

        inspectable = [f for f in fields if is_inspectable(f)]

        # Tier 1 — strong signal: SF's own "must populate on create"
        tier1 = [f for f in inspectable if not f.get("nillable")]
        if tier1:
            return tier1[:20]

        # Tier 2 — custom fields the admin defined intentionally
        tier2 = [f for f in inspectable if f.get("custom")]
        if tier2:
            return tier2[:20]

        # Tier 3 — broadest: any inspectable field. Catches standard
        # objects where every field is technically nillable in the
        # describe response. Order by "text-like" first so we don't
        # score a bunch of relationship IDs.
        text_first = sorted(
            inspectable,
            key=lambda f: 0 if f.get("type") in ("string", "textarea", "picklist", "email", "phone") else 1,
        )
        return text_first[:20]

    async def _client(self) -> SalesforceAPIClient:
        """Build a live Salesforce client bound to this org's connection."""
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

    async def _resolve_analysis_targets(
        self, client: SalesforceAPIClient
    ) -> List[Dict[str, Any]]:
        """Union of the standard business objects + every custom object
        reported by global describe. Skipped objects are filtered out.
        """
        all_objects = await client.list_all_sobjects()
        by_name = {o.get("name"): o for o in all_objects if o.get("name")}

        selected: List[Dict[str, Any]] = []
        seen: set = set()

        # Curated standard-object priority list — these get analysed
        # first regardless of ordering in the global describe response.
        # Widened past the CRM-5 to cover Sales, Service, and Marketing
        # canon so a mid-market SF org's dashboard isn't dominated by
        # empties.
        for name in STANDARD_OBJECTS:
            meta = by_name.get(name)
            if meta is None or not meta.get("queryable"):
                continue
            seen.add(name)
            selected.append(
                {
                    "name": name,
                    "label": meta.get("label") or name,
                    "custom": False,
                }
            )

        # Then: any custom object the user hasn't seen yet. Custom is
        # defined by suffix (`__c`) OR by the `custom` flag in describe
        # — the latter catches namespaced managed-package objects like
        # `MyPkg__Widget__c` that still slip past the suffix test.
        for name, meta in by_name.items():
            if name in seen:
                continue
            is_c = name.endswith("__c") or bool(meta.get("custom"))
            if not is_c:
                continue
            if any(name.startswith(p) for p in SKIP_OBJECT_PREFIXES):
                continue
            if not meta.get("queryable"):
                continue
            # History / Share / Feed / ChangeEvent shadow objects also
            # slip through the __c test on custom objects — skip them.
            if name.endswith(("History", "Share", "Feed", "ChangeEvent", "Tag")):
                continue
            seen.add(name)
            selected.append(
                {
                    "name": name,
                    "label": meta.get("label") or name,
                    "custom": True,
                }
            )
        return selected

    def _build_evidence(
        self,
        *,
        per_field_gap: Dict[str, int],
        required_names: List[str],
        sampled: int,
        dupe_clusters: List[Tuple[str, int]],
        dup_key: str,
        records: List[Dict[str, Any]],
        staleness_threshold: datetime,
    ) -> Dict[str, Any]:
        """Pack up the top offenders per component into a JSON payload
        the frontend can render without a second query.
        """
        # Top 5 fields with the largest population gap.
        top_gaps = sorted(
            (
                {
                    "field": name,
                    "missing_pct": round(
                        (per_field_gap.get(name, 0) / sampled) * 100.0, 1
                    ) if sampled else 0.0,
                }
                for name in required_names
            ),
            key=lambda x: x["missing_pct"],
            reverse=True,
        )[:5]

        # Top 5 duplicate clusters
        dup_examples = sorted(dupe_clusters, key=lambda t: t[1], reverse=True)[:5]

        # 3 oldest sampled records — proxy for the stale set.
        oldest = sorted(
            (
                {
                    "id": r.get("Id"),
                    "last_modified": r.get("LastModifiedDate"),
                }
                for r in records if r.get("LastModifiedDate")
            ),
            key=lambda x: x["last_modified"] or "",
        )[:3]

        return {
            "gap_fields": top_gaps,
            "duplicate_key": dup_key,
            "duplicate_examples": [
                {"key": key, "count": count} for key, count in dup_examples
            ],
            "stale_examples": oldest,
            "staleness_cutoff": staleness_threshold.isoformat(),
        }


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _is_populated(val: Any) -> bool:
    """Salesforce returns nulls as literal Python None; empty strings
    also count as unpopulated for scoring purposes. Numeric 0 and False
    DO count as populated — they are meaningful business values.
    """
    if val is None:
        return False
    if isinstance(val, str) and not val.strip():
        return False
    return True


def _avg(vals) -> float:
    """Safe mean — returns 0.0 on empty iterables so the caller doesn't
    have to special-case the "org has no objects" outcome.
    """
    xs = list(vals)
    if not xs:
        return 0.0
    return sum(xs) / len(xs)
