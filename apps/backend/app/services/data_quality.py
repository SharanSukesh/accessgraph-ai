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
    ObjectPermissionSnapshot,
    ObjectQualityScore,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Business objects analysed by default. Full CRM canon — Sales /
# Service / Marketing / CPQ / activity / content — so a real
# mid-market org's dashboard covers the shape of the actual business,
# not just the top-5 records.
#
# Custom objects are added at run-time from global describe (see
# MAX_CUSTOM_OBJECTS_PER_RUN).
STANDARD_OBJECTS: List[str] = [
    # CRM core
    "Account",
    "Contact",
    "Lead",
    "Opportunity",
    "Case",
    # Activity data — Task / Event drive rep-productivity scoring and
    # are usually the highest-volume objects in a Sales Cloud org.
    "Task",
    "Event",
    # Sales pipeline supporting objects
    "Contract",
    "Order",
    "Quote",
    "OpportunityLineItem",
    "OrderItem",
    "QuoteLineItem",
    "OpportunityContactRole",
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
    "CaseComment",
    "CaseTeamMember",
    # Content / files — usually high-volume, worth scoring for
    # completeness and staleness.
    "ContentDocument",
    "ContentVersion",
    # Community / partner
    "Idea",
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

# Cap on how many custom objects we'll analyse in a single run.
# Salesforce's global describe on a mid-size org can return 400+
# sObjects; even after filtering shadows (History / Share / Feed) we
# can still end up with 50-100 custom objects. Each object needs 3-4
# SF API calls (describe + count + sample + stale) which the sync
# router runs synchronously — hundreds of API calls will exceed the
# deployment's HTTP timeout and 500 the request. Cap at 50 so a run
# stays under ~90 seconds even on the slowest tenants while still
# giving a mid-market org meaningful custom-object coverage.
MAX_CUSTOM_OBJECTS_PER_RUN = 50

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

        import httpx  # local import — only needed for 401 detection

        started = time.monotonic()
        # Explicit try/except at each stage so we can tell exactly WHERE
        # the run is failing when a 500 leaves the frontend.
        try:
            client = await self._client()
        except Exception as exc:
            logger.exception("data-quality: _client() failed for org %s", self.org_id)
            raise RuntimeError(f"Failed to build Salesforce client: {exc}") from exc

        threshold = datetime.now(timezone.utc) - timedelta(days=self.staleness_days)

        # Salesforce access tokens have short TTLs and the first API
        # call to a stale token 401s. Mirror SalesforceSyncService's
        # retry-once pattern: catch the 401, refresh the token, rebuild
        # the client, retry. Any other error surfaces as-is.
        try:
            analysis_targets, coverage = await self._resolve_analysis_targets(client)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "data-quality: 401 on global describe — refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    analysis_targets, coverage = await self._resolve_analysis_targets(client)
                except Exception as refresh_exc:
                    logger.exception(
                        "data-quality: token refresh failed for org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh failed. "
                        "Please reconnect Salesforce from the sidebar."
                    ) from refresh_exc
            else:
                logger.exception(
                    "data-quality: _resolve_analysis_targets failed for org %s "
                    "with HTTP %s", self.org_id, exc.response.status_code,
                )
                raise RuntimeError(
                    f"Salesforce global describe returned HTTP "
                    f"{exc.response.status_code}: {exc}"
                ) from exc
        except Exception as exc:
            logger.exception(
                "data-quality: _resolve_analysis_targets failed for org %s",
                self.org_id,
            )
            raise RuntimeError(
                f"Failed to resolve analysis targets (global describe): {exc}"
            ) from exc

        results: List[ObjectQualityResult] = []
        # skip_reasons: category → count. Categories match _SkipReason
        # enum below; the frontend surfaces them in a "N objects skipped"
        # tooltip so operators can debug why coverage is low.
        skip_reasons: Dict[str, int] = {}
        logger.info(
            "data-quality: analysing %d objects for org %s",
            len(analysis_targets), self.org_id,
        )
        for obj in analysis_targets:
            per_obj_started = time.monotonic()
            try:
                res, skip_reason = await self._analyze_object(
                    client, obj["name"], obj["label"], obj["custom"], threshold
                )
                per_obj_ms = int((time.monotonic() - per_obj_started) * 1000)
                if per_obj_ms > 5000:
                    logger.info(
                        "data-quality: %s took %dms", obj["name"], per_obj_ms
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
        # Stash BOTH skip reasons and coverage stats in the run's error
        # column as JSON. The API extracts them into separate response
        # fields; the frontend diagnostic banner uses coverage to show
        # "22 of 422 sObjects analysed — 15 standard, 7 custom, 41
        # custom dropped by cap".
        error_payload = {
            "skip_reasons": skip_reasons,
            "coverage": coverage,
        }
        skip_error_json = _json.dumps(error_payload)

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
        try:
            self.db.add(run)
            await self.db.flush()  # populate run.id before FK'ing the child rows

            for r in results:
                self.db.add(
                    ObjectQualityScore(
                        organization_id=self.org_id,
                        run_id=run.id,
                        # Defensive truncation — the SF describe response
                        # for a managed-package object with a namespaced
                        # PluralLabel can exceed the column limits.
                        object_name=(r.object_name or "")[:80],
                        object_label=(r.object_label or r.object_name or "")[:255],
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
        except Exception as exc:
            # If persist blows up, rollback and re-raise with context so
            # the router surfaces a useful message on the 500 detail.
            logger.exception(
                "data-quality: DB persist failed for org %s "
                "(analysed=%d, skipped=%d)",
                self.org_id, len(results), skipped,
            )
            try:
                await self.db.rollback()
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(
                f"Failed to persist data-quality run: "
                f"{type(exc).__name__}: {exc}"
            ) from exc
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
        # Keep a flat metadata map so the evidence builder can tag each
        # gap entry with is_custom / is_required without re-scanning the
        # full describe response.
        field_meta_by_name: Dict[str, Dict[str, bool]] = {
            f["name"]: {
                "is_custom": bool(f.get("custom")),
                "is_required": not bool(f.get("nillable")),
            }
            for f in required
        }

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
                field_meta_by_name=field_meta_by_name,
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
        ), None

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

        # Combined completeness pool: SF-required fields UNION every
        # custom field. Data-quality's core consulting story is "you
        # created these custom fields and half of them are empty" —
        # so custom fields always get scored, alongside standard
        # required fields.
        #
        # Previous behaviour (custom-only fallback fired only when NO
        # required fields existed) meant Account.Name / Contact.LastName
        # etc. always monopolised the top slots and buried every
        # Account.Custom_Segment__c gap invisible.
        required = [f for f in inspectable if not f.get("nillable")]
        custom = [f for f in inspectable if f.get("custom")]

        # Deduplicate by name — a custom required field appears in both
        # sets. Preserve required-first ordering so the top of the list
        # still reflects "must-have" fields.
        seen_names: set = set()
        combined: List[Dict[str, Any]] = []
        for f in required + custom:
            name = f.get("name") or ""
            if name in seen_names:
                continue
            seen_names.add(name)
            combined.append(f)

        # Cap at 25 (up from 20) since the SELECT list now covers two
        # concerns instead of one; SOQL length stays well under limits.
        if combined:
            return combined[:25]

        # Fallback: any inspectable field. Catches standard objects
        # where every field is technically nillable in describe AND
        # there are no custom fields at all. Text-like first so we
        # don't score a bunch of relationship IDs.
        text_first = sorted(
            inspectable,
            key=lambda f: 0 if f.get("type") in ("string", "textarea", "picklist", "email", "phone") else 1,
        )
        return text_first[:25]

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

    async def _refresh_access_token(self) -> SalesforceAPIClient:
        """Refresh the stored OAuth token and return a client with the
        fresh access_token. Mirrors SalesforceSyncService's refresh
        path so we hit the same test.salesforce.com fallback for
        sandboxes / scratch orgs.
        """
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
        login_url = "https://test.salesforce.com" if is_sandbox else None
        logger.warning(
            "data-quality: access token expired, refreshing (sandbox=%s)",
            is_sandbox,
        )

        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )

        # Persist the new tokens so the next request uses them.
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()

        logger.info("data-quality: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )

    async def _resolve_analysis_targets(
        self, client: SalesforceAPIClient
    ) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """Build the list of objects to analyse using the same filter
        the Objects page uses — distinct sObject types that appear in
        the org's ObjectPermissionSnapshot. That's the app's canonical
        "business objects" view (~400 in a typical mid-market tenant),
        as opposed to the raw global-describe list (~1500 including
        every Feed / History / Share / ChangeEvent / setup shadow).

        Standard-object priority list is unioned in so CRM canon
        (Account, Contact, etc.) is always covered even if permission
        snapshots haven't been ingested for those objects yet.

        Returns (targets, coverage_stats). Coverage explains the
        filter in numbers the frontend can render.
        """
        # 1. Load global describe once — used for labels + queryable
        #    validation. Cheap: one API call, cached in memory.
        all_objects = await client.list_all_sobjects()
        by_name = {o.get("name"): o for o in all_objects if o.get("name")}
        total_sobjects_in_describe = len(by_name)

        # 2. Pull the distinct object list the Objects page uses —
        #    every sObject type that has at least one permission grant
        #    recorded in this org.
        perm_rows = await self.db.execute(
            select(ObjectPermissionSnapshot.sobject_type)
            .where(ObjectPermissionSnapshot.organization_id == self.org_id)
            .distinct()
        )
        perm_object_names = {row[0] for row in perm_rows.all() if row[0]}

        selected: List[Dict[str, Any]] = []
        seen: set = set()

        # 3. Standard-object priority list — always considered, so we
        #    guarantee CRM canon coverage even if the permission
        #    snapshot hasn't landed those objects yet. Non-queryable
        #    (usually a licensing gap) counts toward standard_missing.
        standard_missing = 0
        for name in STANDARD_OBJECTS:
            meta = by_name.get(name)
            if meta is None or not meta.get("queryable"):
                standard_missing += 1
                continue
            seen.add(name)
            selected.append(
                {
                    "name": name,
                    "label": meta.get("label") or name,
                    "custom": False,
                }
            )

        # 4. Custom objects — only from the permission-snapshot set
        #    (aligns with Objects-page count). Custom is defined by
        #    __c suffix or the describe `custom` flag; namespaced
        #    managed-package objects satisfy both. Sorted for
        #    deterministic coverage between runs.
        custom_candidates: List[Dict[str, Any]] = []
        for name in sorted(perm_object_names):
            if name in seen:
                continue
            meta = by_name.get(name)
            if meta is None:
                # In permission snapshot but not in the current
                # describe response — object was deleted / uninstalled
                # since the last sync. Skip silently.
                continue
            is_c = name.endswith("__c") or bool(meta.get("custom"))
            if not is_c:
                continue
            if any(name.startswith(p) for p in SKIP_OBJECT_PREFIXES):
                continue
            if not meta.get("queryable"):
                continue
            if name.endswith(("History", "Share", "Feed", "ChangeEvent", "Tag")):
                continue
            custom_candidates.append(
                {
                    "name": name,
                    "label": meta.get("label") or name,
                    "custom": True,
                }
            )

        custom_available = len(custom_candidates)
        custom_dropped_by_cap = max(0, custom_available - MAX_CUSTOM_OBJECTS_PER_RUN)
        if custom_dropped_by_cap:
            logger.info(
                "data-quality: %d custom objects available, capping at %d",
                custom_available, MAX_CUSTOM_OBJECTS_PER_RUN,
            )
            custom_candidates = custom_candidates[:MAX_CUSTOM_OBJECTS_PER_RUN]

        for entry in custom_candidates:
            seen.add(entry["name"])
            selected.append(entry)

        coverage = {
            # `total_sobjects` in the banner now means "the Objects
            # page count" — same denominator the user already sees
            # elsewhere in the app. The raw describe count is exposed
            # separately for completeness.
            "total_sobjects": len(perm_object_names),
            "total_sobjects_raw": total_sobjects_in_describe,
            "standard_selected": sum(1 for s in selected if not s["custom"]),
            "standard_missing": standard_missing,
            "custom_selected": sum(1 for s in selected if s["custom"]),
            "custom_available": custom_available,
            "custom_dropped_by_cap": custom_dropped_by_cap,
            "custom_cap": MAX_CUSTOM_OBJECTS_PER_RUN,
        }
        return selected, coverage

    def _build_evidence(
        self,
        *,
        per_field_gap: Dict[str, int],
        required_names: List[str],
        field_meta_by_name: Dict[str, Dict[str, bool]],
        sampled: int,
        dupe_clusters: List[Tuple[str, int]],
        dup_key: str,
        records: List[Dict[str, Any]],
        staleness_threshold: datetime,
    ) -> Dict[str, Any]:
        """Pack up the top offenders per component into a JSON payload
        the frontend can render without a second query. Each gap entry
        is tagged with is_custom / is_required so the UI can badge the
        field's classification alongside its missing-percent.
        """
        # Top 5 fields with the largest population gap. Each carries
        # the classification tags so the UI can render "Custom" /
        # "Required" badges without a second describe call.
        top_gaps = sorted(
            (
                {
                    "field": name,
                    "missing_pct": round(
                        (per_field_gap.get(name, 0) / sampled) * 100.0, 1
                    ) if sampled else 0.0,
                    "is_custom": field_meta_by_name.get(name, {}).get("is_custom", False),
                    "is_required": field_meta_by_name.get(name, {}).get("is_required", False),
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
