"""
Salesforce REST API Client
Handles data extraction from Salesforce
"""
import hashlib
import logging
from typing import Any, Dict, List, Optional

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.salesforce.models import (
    QueryResponse,
    SalesforceAccountShare,
    SalesforceAccountTeamMember,
    SalesforceFieldPermission,
    SalesforceOpportunityTeamMember,
    SalesforceGroup,
    SalesforceGroupMember,
    SalesforceObjectPermission,
    SalesforceOpportunityShare,
    SalesforcePermissionSet,
    SalesforcePermissionSetAssignment,
    SalesforcePermissionSetGroup,
    SalesforcePermissionSetGroupComponent,
    SalesforceProfile,
    SalesforceSharingRule,
    SalesforceUser,
    SalesforceUserRole,
)

logger = logging.getLogger(__name__)


class SalesforceAPIClient:
    """
    Salesforce REST API client
    Handles SOQL queries and metadata extraction
    """

    def __init__(self, instance_url: str, access_token: str, api_version: str = "v62.0"):
        self.instance_url = instance_url.rstrip("/")
        self.access_token = access_token
        self.api_version = api_version
        self.base_url = f"{self.instance_url}/services/data/{api_version}"

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers with auth"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPStatusError),
        reraise=True,
    )
    async def query(self, soql: str) -> QueryResponse:
        """
        Execute SOQL query

        Args:
            soql: SOQL query string

        Returns:
            QueryResponse with results

        Raises:
            httpx.HTTPError: If query fails
        """
        url = f"{self.base_url}/query"
        params = {"q": soql}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers(), params=params)
            response.raise_for_status()

            data = response.json()
            return QueryResponse(**data)

    async def query_all(self, soql: str, batch_size: int = 2000) -> List[Dict[str, Any]]:
        """
        Execute query and handle pagination

        Args:
            soql: SOQL query string
            batch_size: Records per batch

        Returns:
            List of all records
        """
        all_records = []
        next_url = None

        # First query
        result = await self.query(soql)
        all_records.extend(result.records)

        # Handle pagination
        while not result.done and result.nextRecordsUrl:
            logger.info(f"Fetching next batch, total so far: {len(all_records)}")
            result = await self._query_more(result.nextRecordsUrl)
            all_records.extend(result.records)

        logger.info(f"Query complete, total records: {len(all_records)}")
        return all_records

    async def _query_more(self, next_records_url: str) -> QueryResponse:
        """
        Fetch next page of results

        Args:
            next_records_url: URL from previous response

        Returns:
            QueryResponse with next batch
        """
        url = f"{self.instance_url}{next_records_url}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()

            data = response.json()
            return QueryResponse(**data)

    # =========================================================================
    # Mutation Methods (write-back to Salesforce records)
    # =========================================================================
    #
    # First write-paths in the AccessGraph backend. Used by the Reporting
    # Graph editor in the web app — admins draw / delete edges in the UI
    # and the resulting User.ManagerId / User.DelegatedApproverId updates
    # land here. Every PATCH is audit-logged at the route layer.

    async def update_user(
        self,
        user_sf_id: str,
        fields: Dict[str, Any],
    ) -> int:
        """PATCH /services/data/v62.0/sobjects/User/{id}.

        Salesforce returns 204 No Content on success (no response body)
        and a 4xx with a JSON error array on failure. We return the HTTP
        status code so callers can distinguish success/failure cleanly.

        `fields` is the partial payload — e.g. {"ManagerId": "005gL...",
        "DelegatedApproverId": null}. Sending null clears the lookup.
        """
        url = f"{self.base_url}/sobjects/User/{user_sf_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.patch(
                url, headers=self._get_headers(), json=fields,
            )
            if response.status_code >= 400:
                # raise_for_status loses the body; surface it for the caller
                raise httpx.HTTPStatusError(
                    f"Salesforce PATCH User/{user_sf_id} returned "
                    f"{response.status_code}: {response.text}",
                    request=response.request,
                    response=response,
                )
            return response.status_code

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPStatusError),
        reraise=True,
    )
    async def update_user_with_retry(
        self,
        user_sf_id: str,
        fields: Dict[str, Any],
    ) -> int:
        """update_user wrapped in the standard tenacity backoff. Used by
        the bulk reporting-graph apply path; transient 5xx → 3 retries."""
        return await self.update_user(user_sf_id, fields)

    # =========================================================================
    # Org Analyzer helpers (read-only SF REST/Tooling calls used by the
    # Org Analyzer service to compute org-health findings).
    # =========================================================================

    async def get_org_limits(self) -> Dict[str, Any]:
        """GET /services/data/vXX.0/limits.

        Returns the raw payload — keys like DailyApiRequests, DataStorageMB,
        FileStorageMB, DailyBulkApiBatches, SingleEmail, MassEmail, etc.
        Each value is a dict {"Max": int, "Remaining": int}.
        """
        url = f"{self.base_url}/limits"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()
            return response.json()

    async def list_all_sobjects(self) -> List[Dict[str, Any]]:
        """GET /services/data/vXX.0/sobjects/ — global describe.

        Returns list of {name, label, custom, queryable, createable, ...}
        for every sObject in the org. Used by the analyzer to enumerate
        custom objects + decide which ones to count records on.
        """
        url = f"{self.base_url}/sobjects/"
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()
            data = response.json()
            return data.get("sobjects", []) or []

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPStatusError),
        reraise=True,
    )
    async def query_tooling(self, soql: str) -> List[Dict[str, Any]]:
        """Generic Tooling API SOQL query with paging.

        The Tooling API uses a separate endpoint but otherwise behaves
        like the standard /query endpoint. We use it for ApexClass,
        ApexTrigger, FlowDefinitionView, ValidationRule, etc. — anything
        the regular query endpoint doesn't expose.
        """
        tooling_query_url = f"{self.base_url}/tooling/query"
        all_records: List[Dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                tooling_query_url,
                headers=self._get_headers(),
                params={"q": soql.strip()},
            )
            response.raise_for_status()
            data = response.json()
            all_records.extend(data.get("records", []) or [])
            next_url = data.get("nextRecordsUrl")
            while not data.get("done", True) and next_url:
                response = await client.get(
                    f"{self.instance_url}{next_url}",
                    headers=self._get_headers(),
                )
                response.raise_for_status()
                data = response.json()
                all_records.extend(data.get("records", []) or [])
                next_url = data.get("nextRecordsUrl")
        return all_records

    async def count_sobject(self, sobject_name: str) -> Optional[int]:
        """SELECT COUNT() FROM <sobject>. Returns None if the COUNT query
        rejects (object not queryable, no permissions, etc.) so the
        analyzer can skip rather than fail the whole run."""
        try:
            result = await self.query(f"SELECT COUNT() FROM {sobject_name}")
            return int(result.totalSize or 0)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "COUNT() on %s rejected (%s) — skipping.",
                sobject_name, e.response.status_code,
            )
            return None
        except Exception as e:
            logger.warning("COUNT() on %s failed: %s", sobject_name, e)
            return None

    async def get_login_history(self, since_days: int = 90) -> List[Dict[str, Any]]:
        """Recent LoginHistory rows for activity analysis.

        Returns rows with Id, UserId, LoginTime, Application, Status. The
        analyzer rolls these up to find users who haven't used the API in
        a while but still hold the API Enabled perm.
        """
        soql = (
            "SELECT Id, UserId, LoginTime, Application, Status "
            "FROM LoginHistory "
            f"WHERE LoginTime = LAST_N_DAYS:{since_days} "
            "ORDER BY LoginTime DESC"
        )
        try:
            return await self.query_all(soql)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "LoginHistory query failed (%s) — skipping API-activity rule.",
                e.response.status_code,
            )
            return []

    async def extract_setup_audit_trail(
        self, since_days: int = 30, limit: int = 5000
    ) -> List[Dict[str, Any]]:
        """SetupAuditTrail — every admin-level change SF logs.

        Powers the Change-Risk Radar. Returns rows with:
          - Id
          - CreatedDate
          - CreatedBy.Id / CreatedBy.Username / CreatedBy.Name
          - Action           — SF's own operation name (e.g. "PermSetAssign")
          - Section          — coarse category ("Manage Users", "Sharing
                                Rules", etc.); the primary driver of the
                                blast-radius score.
          - Display          — human-readable description of the change
          - DelegateUser     — if the change was made on behalf of another
                                admin (SF's assumeUserLogin trail).

        Bounded by `since_days` (default 30) so we don't blow the response
        payload on chatty orgs. Additionally hard-capped at `limit` so a
        pathological day (mass profile deploy) still returns a bounded
        result.
        """
        soql = (
            "SELECT Id, CreatedDate, "
            "CreatedBy.Id, CreatedBy.Name, CreatedBy.Username, "
            "Action, Section, Display, DelegateUser "
            "FROM SetupAuditTrail "
            f"WHERE CreatedDate = LAST_N_DAYS:{since_days} "
            "ORDER BY CreatedDate DESC "
            f"LIMIT {limit}"
        )
        try:
            return await self.query_all(soql)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "SetupAuditTrail query failed (%s) — skipping change-risk pull.",
                e.response.status_code,
            )
            return []

    async def extract_installed_packages(self) -> List[Dict[str, Any]]:
        """InstalledSubscriberPackage via Tooling API.

        Returns every managed package installed in the org, joined with
        its SubscriberPackage (name, namespace, description) and version
        metadata (version number, beta / deprecated / managed flags).
        Powers the Managed-Package Sprawl engine.
        """
        soql = (
            "SELECT Id, "
            "SubscriberPackage.Id, SubscriberPackage.Name, "
            "SubscriberPackage.NamespacePrefix, SubscriberPackage.Description, "
            "SubscriberPackageVersion.Id, SubscriberPackageVersion.Name, "
            "SubscriberPackageVersion.MajorVersion, "
            "SubscriberPackageVersion.MinorVersion, "
            "SubscriberPackageVersion.PatchVersion, "
            "SubscriberPackageVersion.BuildNumber, "
            "SubscriberPackageVersion.IsBeta, "
            "SubscriberPackageVersion.IsDeprecated, "
            "SubscriberPackageVersion.IsManaged "
            "FROM InstalledSubscriberPackage"
        )
        try:
            return await self.query_tooling(soql)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "InstalledSubscriberPackage query failed (%s) — "
                "skipping package-sprawl pull.",
                e.response.status_code,
            )
            return []

    async def extract_package_licenses(self) -> List[Dict[str, Any]]:
        """PackageLicense (standard SObject) — seat counts per package.

        Not every package has a PackageLicense row — only those with
        AppExchange license SKUs do. Absence isn't an error; just skip
        licence enrichment for that package.
        """
        soql = (
            "SELECT Id, NamespacePrefix, Status, AllowedLicenses, "
            "UsedLicenses, ExpirationDate "
            "FROM PackageLicense"
        )
        try:
            return await self.query_all(soql)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "PackageLicense query failed (%s) — package-sprawl runs "
                "without license enrichment.",
                e.response.status_code,
            )
            return []

    async def count_apex_classes_in_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Number of Apex classes shipped inside the package's namespace.
        Uses the Tooling API with a `SELECT Id` pattern (not `COUNT()`)
        because query_tooling normalises to the records array — SF puts
        the count in totalSize but records[] comes back empty for the
        COUNT form. Bounded by SF's 2000-row Tooling limit.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM ApexClass "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "ApexClass count for namespace=%s failed: %s", namespace, exc
            )
            return None

    async def count_flows_in_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Number of Flows shipped inside the package's namespace
        (Tooling API's FlowDefinitionView). None on failure.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM FlowDefinitionView "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "FlowDefinitionView count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def count_lightning_components_in_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Number of LWCs (`LightningComponentBundle`) shipped inside
        the package's namespace. None on failure — same SELECT Id
        pattern as the other namespace counts.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM LightningComponentBundle "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "LightningComponentBundle count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def count_aura_bundles_in_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Number of Aura bundles (`AuraDefinitionBundle`) shipped
        inside the package's namespace.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM AuraDefinitionBundle "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "AuraDefinitionBundle count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def count_apex_triggers_in_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Number of Apex triggers (`ApexTrigger`) shipped inside the
        package's namespace. Kept separate from ApexClass because
        triggers surface a different risk profile in the detail card.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM ApexTrigger "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "ApexTrigger count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def count_metadata_dependencies_by_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """The most important package-sprawl signal — how many
        customer-owned components reference something inside this
        package's namespace.

        Queries the Tooling API's `MetadataComponentDependency` view.
        Each row is one (MetadataComponent → RefMetadataComponent) edge;
        we filter by RefMetadataComponentNamespace so we count edges
        pointing INTO the package. Zero rows = customer code is not
        wired to this package at all.
        """
        try:
            rows = await self.query_tooling(
                "SELECT Id FROM MetadataComponentDependency "
                f"WHERE RefMetadataComponentNamespace = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "MetadataComponentDependency count for namespace=%s "
                "failed: %s", namespace, exc,
            )
            return None

    async def top_metadata_dependents(
        self, namespace: str, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Top-N customer components that reference this package.

        Returns entries like:
            {"component": "MyClass", "component_type": "ApexClass",
             "ref_component": "MyPkg.PackageClass",
             "ref_type": "ApexClass"}

        Empty list on failure or missing permissions. Used by the
        package card evidence pill so the reader can see which of
        their own components are load-bearing on the package.
        """
        soql = (
            "SELECT MetadataComponentName, MetadataComponentType, "
            "RefMetadataComponentName, RefMetadataComponentType "
            "FROM MetadataComponentDependency "
            f"WHERE RefMetadataComponentNamespace = '{namespace}' "
            f"LIMIT {limit}"
        )
        try:
            rows = await self.query_tooling(soql)
            return [
                {
                    "component": r.get("MetadataComponentName"),
                    "component_type": r.get("MetadataComponentType"),
                    "ref_component": r.get("RefMetadataComponentName"),
                    "ref_type": r.get("RefMetadataComponentType"),
                }
                for r in rows
            ]
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "top_metadata_dependents for namespace=%s failed: %s",
                namespace, exc,
            )
            return []

    async def find_supplemental_customtab_references(
        self, namespace: str
    ) -> List[Dict[str, Any]]:
        """Supplemental dependency detection: catches CustomTab → LWC
        edges that Salesforce's `MetadataComponentDependency` index
        sometimes misses.

        Real-world scenario this catches: a customer creates a Custom
        App with a Custom Tab of type "Lightning Component" pointing at
        an LWC from a managed package. That's a real, load-bearing
        reference — the package's LWC is being displayed in the org —
        but it's frequently absent from MetadataComponentDependency,
        especially for beta 2GP managed packages.

        Approach: query LWC bundles in the target namespace, then
        query CustomTab records whose LightningComponentBundleId
        points at those bundles. Exclude tabs from the same namespace
        (that's the package hosting its own components, not a
        customer reference).

        Returns entries in the same shape as `top_metadata_dependents`
        with an added `source: "customtab_lwc"` tag so the UI can
        badge them as coming from the supplemental pass rather than
        the primary dependency index. Empty list on any failure —
        this is best-effort supplementary detection, never the source
        of truth.
        """
        try:
            bundle_rows = await self.query_tooling(
                "SELECT Id, DeveloperName FROM LightningComponentBundle "
                f"WHERE NamespacePrefix = '{namespace}'"
            )
            if not bundle_rows:
                return []
            bundle_map: Dict[str, str] = {
                r.get("Id"): (r.get("DeveloperName") or "?")
                for r in bundle_rows
                if r.get("Id")
            }
            # SOQL IN clauses cap at 200 literal ids on Tooling. If
            # a package ships more than that, we sample the first 200
            # — good enough for detection since a single hit already
            # proves the package is wired.
            bundle_ids = list(bundle_map.keys())[:200]
            if not bundle_ids:
                return []
            ids_clause = ",".join(f"'{bid}'" for bid in bundle_ids)
            tab_rows = await self.query_tooling(
                "SELECT Id, Name, LightningComponentBundleId, "
                "NamespacePrefix FROM CustomTab "
                f"WHERE LightningComponentBundleId IN ({ids_clause})"
            )
            hits: List[Dict[str, Any]] = []
            for r in tab_rows:
                tab_namespace = r.get("NamespacePrefix") or ""
                # Skip tabs that live in the package's own namespace
                # — that's internal wiring, not customer usage.
                if tab_namespace == namespace:
                    continue
                bundle_id = r.get("LightningComponentBundleId")
                hits.append({
                    "component": r.get("Name"),
                    "component_type": "CustomTab",
                    "ref_component": bundle_map.get(bundle_id, "?"),
                    "ref_type": "LightningComponentBundle",
                    "source": "customtab_lwc",
                })
            return hits
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "Supplemental CustomTab dep search for namespace=%s "
                "failed: %s", namespace, exc,
            )
            return []

    async def count_async_apex_jobs_by_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Live batch / queueable / future Apex from this package's
        namespace. Non-zero = the package's code is actually running.

        Filters by `ApexClass.NamespacePrefix` so we don't miscount
        customer-owned Apex that happens to be running. Uses the
        standard REST endpoint since AsyncApexJob isn't Tooling.
        """
        try:
            rows = await self.query_all(
                "SELECT Id FROM AsyncApexJob "
                f"WHERE ApexClass.NamespacePrefix = '{namespace}'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "AsyncApexJob count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def count_scheduled_apex_by_namespace(
        self, namespace: str
    ) -> Optional[int]:
        """Scheduled Apex from this package's namespace.

        Uses `CronTrigger` and matches on CronJobDetail.Name starting
        with the namespace prefix — SF names namespaced scheduled
        jobs "<namespace>.<JobName>" so a LIKE match works. Missing
        permissions surface as None.
        """
        try:
            rows = await self.query_all(
                "SELECT Id FROM CronTrigger "
                f"WHERE CronJobDetail.Name LIKE '{namespace}.%'"
            )
            return len(rows)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "CronTrigger count for namespace=%s failed: %s",
                namespace, exc,
            )
            return None

    async def extract_recent_metadata_activity(
        self, since_days: int = 30, top_per_type: int = 5
    ) -> Dict[str, Any]:
        """Recent metadata modifications across component types.

        Returns a dict keyed by component_type ("apex_class",
        "apex_trigger", "flow", "aura_bundle", "lwc_bundle", "report",
        "dashboard") with entries like:
            {"count": 42,
             "top": [{"id": "...", "name": "...",
                      "last_modified": "...", "actor": "..."},
                      ...]}

        Each component type is queried independently — a failure on
        one doesn't sink the others. Missing keys mean the query
        failed or the org has zero rows of that type; both are treated
        as "no signal" by the frontend.

        Powers the Change-Risk Radar's Component Activity chart —
        answers "which component types are getting touched most" with
        clean per-type data, avoiding fragile Display-text parsing on
        SetupAuditTrail.
        """
        # (component_type, sobject_or_view, uses_tooling, display_name_field)
        #
        # ApexClass / ApexTrigger — regular query works fine
        # FlowDefinitionView    — Tooling API; MasterLabel is the name
        # Aura/LightningComponent bundle — Tooling API; DeveloperName
        # Report / Dashboard    — regular query
        specs = [
            ("apex_class",   "ApexClass",                 False, "Name"),
            ("apex_trigger", "ApexTrigger",               False, "Name"),
            ("flow",         "FlowDefinitionView",        True,  "MasterLabel"),
            ("aura_bundle",  "AuraDefinitionBundle",      True,  "DeveloperName"),
            ("lwc_bundle",   "LightningComponentBundle",  True,  "DeveloperName"),
            ("report",       "Report",                    False, "Name"),
            ("dashboard",    "Dashboard",                 False, "Title"),
        ]

        results: Dict[str, Any] = {}
        for kind, obj, use_tooling, name_field in specs:
            # Two queries per type — one for the total count, one for
            # the top-N modified. Bounded overall by the type list
            # length (7 * 2 = 14 queries) so the whole activity pull
            # stays under a second on a healthy org.
            count = await self._safe_count(
                obj, since_days, use_tooling=use_tooling
            )
            top = await self._safe_top_modified(
                obj, name_field, since_days, top_per_type,
                use_tooling=use_tooling,
            )
            results[kind] = {"count": count if count is not None else 0,
                             "top": top}
        return results

    async def _safe_count(
        self, sobject: str, since_days: int, *, use_tooling: bool = False
    ) -> Optional[int]:
        """`SELECT COUNT() FROM X WHERE LastModifiedDate = LAST_N_DAYS:N`.
        None on failure so callers can treat missing-signal as zero.
        """
        soql = (
            f"SELECT COUNT() FROM {sobject} "
            f"WHERE LastModifiedDate = LAST_N_DAYS:{since_days}"
        )
        try:
            if use_tooling:
                rows = await self.query_tooling(soql)
                return len(rows)
            result = await self.query(soql)
            return int(result.totalSize or 0)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "metadata count %s failed: %s: %s",
                sobject, type(exc).__name__, exc,
            )
            return None

    async def _safe_top_modified(
        self,
        sobject: str,
        name_field: str,
        since_days: int,
        limit: int,
        *,
        use_tooling: bool = False,
    ) -> List[Dict[str, Any]]:
        """Return the N most-recently-modified rows with their name +
        last-modified timestamp + actor. Empty list on failure.
        """
        soql = (
            f"SELECT Id, {name_field}, LastModifiedDate, LastModifiedBy.Name "
            f"FROM {sobject} "
            f"WHERE LastModifiedDate = LAST_N_DAYS:{since_days} "
            f"ORDER BY LastModifiedDate DESC LIMIT {limit}"
        )
        try:
            if use_tooling:
                rows = await self.query_tooling(soql)
            else:
                result = await self.query(soql)
                rows = list(result.records)
            out: List[Dict[str, Any]] = []
            for r in rows:
                actor_obj = r.get("LastModifiedBy") or {}
                out.append(
                    {
                        "id": r.get("Id"),
                        "name": r.get(name_field),
                        "last_modified": r.get("LastModifiedDate"),
                        "actor": actor_obj.get("Name"),
                    }
                )
            return out
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "metadata top-modified %s failed: %s: %s",
                sobject, type(exc).__name__, exc,
            )
            return []

    async def get_apex_coverage(self) -> List[Dict[str, Any]]:
        """Per-class Apex code-coverage rollup from the Tooling API."""
        try:
            return await self.query_tooling(
                "SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered "
                "FROM ApexCodeCoverageAggregate"
            )
        except Exception as e:
            logger.warning("ApexCodeCoverageAggregate query failed: %s", e)
            return []

    async def extract_organization(self) -> Optional[Dict[str, Any]]:
        """Single-row Organization fetch with edition + sandbox flags.

        Drives the Org Analyzer's "is this a non-paying org" detection
        so we don't fabricate dollar savings on Developer Edition,
        Sandbox, Trial, or Scratch orgs. Wrapped in try/except — the
        analyzer should still run if this fails (we just lose the
        ability to apply the non-paying-org banner).
        """
        try:
            res = await self.query(
                "SELECT Id, Name, OrganizationType, IsSandbox, "
                "InstanceName, TrialExpirationDate FROM Organization LIMIT 1"
            )
            recs = list(res.records) if res.records else []
            return recs[0] if recs else None
        except Exception as e:
            logger.warning("extract_organization failed: %s", e)
            return None

    async def get_user_licenses(self) -> List[Dict[str, Any]]:
        """UserLicense — the actual license SKUs in this org.

        Returns rows with TotalLicenses / UsedLicenses / Status. Drives
        the Org Analyzer price-book auto-population and the
        LICENSE_SEATS_UNUSED finding (purchased seats not assigned).
        """
        try:
            return await self.query_all(
                "SELECT Id, Name, MasterLabel, LicenseDefinitionKey, "
                "TotalLicenses, UsedLicenses, Status FROM UserLicense"
            )
        except Exception as e:
            logger.warning("UserLicense query failed: %s", e)
            return []

    async def get_permission_set_licenses(self) -> List[Dict[str, Any]]:
        """PermissionSetLicense — add-on SKUs like Sales Cloud, Service
        Cloud, Field Service, etc."""
        try:
            return await self.query_all(
                "SELECT Id, DeveloperName, MasterLabel, "
                "TotalLicenses, UsedLicenses, Status FROM PermissionSetLicense"
            )
        except Exception as e:
            logger.warning("PermissionSetLicense query failed: %s", e)
            return []

    async def count_stale_opportunities(self, days: int = 60) -> Optional[int]:
        """Count open Opportunities not modified in `days` days.

        Drives the STALE_OPPORTUNITY analyzer finding — open pipeline
        that hasn't moved in 60+ days is a forecast-accuracy red flag.
        """
        try:
            result = await self.query(
                "SELECT COUNT() FROM Opportunity WHERE IsClosed = false "
                f"AND LastModifiedDate < LAST_N_DAYS:{days}"
            )
            return int(result.totalSize or 0)
        except Exception as e:
            logger.warning("stale-opportunity COUNT failed: %s", e)
            return None

    async def top_account_owners(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Top account owners by record count.

        Drives the ACCOUNT_OWNERSHIP_CONCENTRATION finding — if 5 owners
        hold > 50% of accounts, that's a key-person risk + a sales-ops
        rebalancing opportunity.
        """
        try:
            soql = (
                "SELECT OwnerId, COUNT(Id) cnt FROM Account "
                "GROUP BY OwnerId ORDER BY COUNT(Id) DESC "
                f"LIMIT {limit}"
            )
            res = await self.query(soql)
            return list(res.records) if res.records else []
        except Exception as e:
            logger.warning("top_account_owners failed: %s", e)
            return []

    async def total_account_count(self) -> Optional[int]:
        """SELECT COUNT() FROM Account — used as the denominator for the
        ownership-concentration calculation."""
        try:
            res = await self.query("SELECT COUNT() FROM Account")
            return int(res.totalSize or 0)
        except Exception as e:
            logger.warning("Account COUNT failed: %s", e)
            return None

    # =========================================================================
    # Extraction Methods
    # =========================================================================

    async def extract_users(self) -> List[SalesforceUser]:
        """
        Extract all users

        Returns:
            List of SalesforceUser objects
        """
        soql = """
            SELECT Id, Username, Name, Email, ProfileId, UserRoleId, ManagerId,
                   DelegatedApproverId, IsActive, UserType, Department, Title,
                   LastLoginDate
            FROM User
            WHERE IsActive = true
        """

        records = await self.query_all(soql)
        users = [SalesforceUser(**rec) for rec in records]

        logger.info(f"Extracted {len(users)} users")
        return users

    async def extract_user_roles(self) -> List[SalesforceUserRole]:
        """
        Extract all user roles

        Returns:
            List of SalesforceUserRole objects
        """
        soql = """
            SELECT Id, Name, ParentRoleId
            FROM UserRole
        """

        records = await self.query_all(soql)
        roles = [SalesforceUserRole(**rec) for rec in records]

        logger.info(f"Extracted {len(roles)} roles")
        return roles

    async def extract_profiles(self) -> List[SalesforceProfile]:
        """
        Extract all profiles, including their UserLicenseId so the Org
        Analyzer can attribute users to the correct license SKU.

        Returns:
            List of SalesforceProfile objects
        """
        soql = """
            SELECT Id, Name, UserLicenseId
            FROM Profile
        """

        records = await self.query_all(soql)
        profiles = [SalesforceProfile(**rec) for rec in records]

        logger.info(f"Extracted {len(profiles)} profiles")
        return profiles

    # Curated set of high-value Permissions* boolean fields on PermissionSet
    # the PS detail page surfaces as "system permissions". Salesforce has
    # ~250 such fields; these are the ones admins most frequently audit.
    # They land in raw_data via Pydantic's extra-fields handling.
    #
    # Field availability varies by API version and org features (Data Cloud,
    # MFA add-on, etc.) — e.g., PermissionsTwoFactorMfa was added in v60.0,
    # PermissionsManageDataIntegrations requires Data Cloud licensing. So the
    # rich query can 400 in some orgs even with a current API version. We try
    # the rich query first; on HTTP 400 we fall back to core fields so the
    # sync isn't blocked. The PS detail page just shows fewer system perms.
    _PS_RICH_FIELDS = [
        "PermissionsViewAllData", "PermissionsModifyAllData",
        "PermissionsViewAllUsers", "PermissionsManageUsers",
        "PermissionsResetPasswords", "PermissionsManageRoles",
        "PermissionsManageProfilesPermissionsets",
        "PermissionsAssignPermissionSets",
        "PermissionsCustomizeApplication", "PermissionsManageSharing",
        "PermissionsViewSetup", "PermissionsManageDataIntegrations",
        "PermissionsApiEnabled", "PermissionsApiUserOnly",
        "PermissionsAuthorApex", "PermissionsManageMobile",
        "PermissionsRunReports", "PermissionsExportReport",
        "PermissionsScheduleReports", "PermissionsViewAllForecasts",
        "PermissionsManageDashbds", "PermissionsCreateDashFolders",
        "PermissionsBulkApiHardDelete", "PermissionsTransferAnyCase",
        "PermissionsTransferAnyEntity", "PermissionsTransferAnyLead",
        "PermissionsManageEncryptionKeys",
        "PermissionsViewEncryptedData",
        "PermissionsTwoFactorApi", "PermissionsTwoFactorMfa",
        "PermissionsManageContentPermissions",
        "PermissionsPasswordNeverExpires",
    ]
    _PS_CORE_FIELDS = ["Id", "Name", "Label", "IsOwnedByProfile", "ProfileId", "Type"]

    async def extract_permission_sets(self) -> List[SalesforcePermissionSet]:
        """
        Extract all permission sets

        Returns:
            List of SalesforcePermissionSet objects
        """
        rich_soql = (
            f"SELECT {', '.join(self._PS_CORE_FIELDS + self._PS_RICH_FIELDS)} "
            f"FROM PermissionSet"
        )
        try:
            records = await self.query_all(rich_soql)
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 400:
                raise
            logger.warning(
                "PermissionSet rich query rejected (400) — likely an unsupported "
                "Permissions* field for this org's API version. Falling back to "
                "core fields. Response: %s",
                e.response.text[:500],
            )
            core_soql = f"SELECT {', '.join(self._PS_CORE_FIELDS)} FROM PermissionSet"
            records = await self.query_all(core_soql)

        permission_sets = [SalesforcePermissionSet(**rec) for rec in records]

        logger.info(f"Extracted {len(permission_sets)} permission sets")
        return permission_sets

    async def extract_permission_set_assignments(self) -> List[SalesforcePermissionSetAssignment]:
        """
        Extract all permission set assignments

        Returns:
            List of SalesforcePermissionSetAssignment objects
        """
        soql = """
            SELECT Id, AssigneeId, PermissionSetId
            FROM PermissionSetAssignment
            WHERE Assignee.IsActive = true
        """

        records = await self.query_all(soql)
        assignments = [SalesforcePermissionSetAssignment(**rec) for rec in records]

        logger.info(f"Extracted {len(assignments)} permission set assignments")
        return assignments

    async def extract_permission_set_groups(self) -> List[SalesforcePermissionSetGroup]:
        """
        Extract all permission set groups

        Returns:
            List of SalesforcePermissionSetGroup objects
        """
        soql = """
            SELECT Id, DeveloperName, MasterLabel
            FROM PermissionSetGroup
        """

        records = await self.query_all(soql)
        groups = [SalesforcePermissionSetGroup(**rec) for rec in records]

        logger.info(f"Extracted {len(groups)} permission set groups")
        return groups

    async def extract_permission_set_group_components(self) -> List[SalesforcePermissionSetGroupComponent]:
        """
        Extract all permission set group components

        Returns:
            List of SalesforcePermissionSetGroupComponent objects
        """
        soql = """
            SELECT Id, PermissionSetGroupId, PermissionSetId
            FROM PermissionSetGroupComponent
        """

        records = await self.query_all(soql)
        components = [SalesforcePermissionSetGroupComponent(**rec) for rec in records]

        logger.info(f"Extracted {len(components)} PSG components")
        return components

    async def extract_object_permissions(self) -> List[SalesforceObjectPermission]:
        """
        Extract all object permissions

        Returns:
            List of SalesforceObjectPermission objects
        """
        soql = """
            SELECT Id, ParentId, SobjectType,
                   PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete,
                   PermissionsViewAllRecords, PermissionsModifyAllRecords
            FROM ObjectPermissions
        """

        records = await self.query_all(soql)
        permissions = [SalesforceObjectPermission(**rec) for rec in records]

        logger.info(f"Extracted {len(permissions)} object permissions")
        return permissions

    async def extract_field_permissions(self) -> List[SalesforceFieldPermission]:
        """
        Extract all field permissions

        Returns:
            List of SalesforceFieldPermission objects
        """
        soql = """
            SELECT Id, ParentId, SobjectType, Field,
                   PermissionsRead, PermissionsEdit
            FROM FieldPermissions
        """

        records = await self.query_all(soql)
        permissions = [SalesforceFieldPermission(**rec) for rec in records]

        logger.info(f"Extracted {len(permissions)} field permissions")
        return permissions

    async def extract_groups(self) -> List[SalesforceGroup]:
        """
        Extract all groups (public groups, queues, roles, etc.)

        Returns:
            List of SalesforceGroup objects
        """
        soql = """
            SELECT Id, Name, Type, DeveloperName, RelatedId
            FROM Group
        """

        records = await self.query_all(soql)
        groups = [SalesforceGroup(**rec) for rec in records]

        logger.info(f"Extracted {len(groups)} groups")
        return groups

    async def extract_group_members(self) -> List[SalesforceGroupMember]:
        """
        Extract all group members

        Returns:
            List of SalesforceGroupMember objects
        """
        soql = """
            SELECT Id, GroupId, UserOrGroupId
            FROM GroupMember
        """

        records = await self.query_all(soql)
        members = [SalesforceGroupMember(**rec) for rec in records]

        logger.info(f"Extracted {len(members)} group members")
        return members

    async def extract_account_shares(self) -> List[SalesforceAccountShare]:
        """
        Extract all account shares

        Returns:
            List of SalesforceAccountShare objects
        """
        soql = """
            SELECT Id, AccountId, UserOrGroupId, AccountAccessLevel,
                   OpportunityAccessLevel, CaseAccessLevel, RowCause
            FROM AccountShare
            WHERE RowCause != 'Owner'
        """

        records = await self.query_all(soql)
        shares = [SalesforceAccountShare(**rec) for rec in records]

        logger.info(f"Extracted {len(shares)} account shares")
        return shares

    async def extract_opportunity_shares(self) -> List[SalesforceOpportunityShare]:
        """
        Extract all opportunity shares

        Returns:
            List of SalesforceOpportunityShare objects
        """
        soql = """
            SELECT Id, OpportunityId, UserOrGroupId, OpportunityAccessLevel, RowCause
            FROM OpportunityShare
            WHERE RowCause != 'Owner'
        """

        records = await self.query_all(soql)
        shares = [SalesforceOpportunityShare(**rec) for rec in records]

        logger.info(f"Extracted {len(shares)} opportunity shares")
        return shares

    async def extract_account_team_members(self) -> List[SalesforceAccountTeamMember]:
        """
        Extract all account team members

        Returns:
            List of SalesforceAccountTeamMember objects
        """
        soql = """
            SELECT Id, AccountId, UserId, TeamMemberRole,
                   AccountAccessLevel, OpportunityAccessLevel, CaseAccessLevel
            FROM AccountTeamMember
        """

        records = await self.query_all(soql)
        members = [SalesforceAccountTeamMember(**rec) for rec in records]

        logger.info(f"Extracted {len(members)} account team members")
        return members

    async def extract_opportunity_team_members(
        self,
    ) -> List[SalesforceOpportunityTeamMember]:
        """Extract OpportunityTeamMember rows.

        Optional — not all orgs have Sales Cloud team selling enabled.
        Caller (sync orchestrator) should wrap this in try/except since a
        query against this object can 400 on orgs where it's not provisioned.
        """
        soql = """
            SELECT Id, OpportunityId, UserId, TeamMemberRole,
                   OpportunityAccessLevel
            FROM OpportunityTeamMember
        """

        records = await self.query_all(soql)
        members = [
            SalesforceOpportunityTeamMember(**rec) for rec in records
        ]

        logger.info(f"Extracted {len(members)} opportunity team members")
        return members

    async def extract_sharing_rules(self) -> List[SalesforceSharingRule]:
        """
        Extract all sharing rules using Tooling API

        Note: Sharing rules are queried from multiple objects in the Tooling API:
        - AccountSharingRule, OpportunitySharingRule, CaseSharingRule, etc.

        Returns:
            List of SalesforceSharingRule objects
        """
        sharing_rule_objects = [
            ('AccountSharingRule', 'Account'),
            ('OpportunitySharingRule', 'Opportunity'),
            ('CaseSharingRule', 'Case'),
            ('LeadSharingRule', 'Lead'),
            ('ContactSharingRule', 'Contact'),
            ('CampaignSharingRule', 'Campaign'),
        ]

        all_rules = []

        for rule_object_name, sobject_type in sharing_rule_objects:
            try:
                # Query using Tooling API
                soql = f"""
                    SELECT Id, Name, AccessLevel, SharedTo.Type
                    FROM {rule_object_name}
                """

                # Use tooling API endpoint
                url = f"{self.base_url.replace('/services/data/', '/services/data/')}/tooling/query"
                params = {"q": soql.strip()}

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url, headers=self._get_headers(), params=params)
                    response.raise_for_status()
                    result = response.json()

                records = result.get('records', [])

                for rec in records:
                    # Parse the sharing rule data
                    rule = SalesforceSharingRule(
                        Id=rec['Id'],
                        Name=rec['Name'],
                        SobjectType=sobject_type,
                        RuleType=rule_object_name.replace('SharingRule', ''),
                        AccessLevel=rec.get('AccessLevel', 'Read'),
                        SharedToType=rec.get('SharedTo', {}).get('Type', 'Unknown') if rec.get('SharedTo') else 'Unknown',
                        SharedToId=None,  # Would need additional query to get the ID
                    )
                    all_rules.append(rule)

                logger.info(f"Extracted {len(records)} {rule_object_name} sharing rules")

            except Exception as e:
                # Some objects may not be available or have no sharing rules
                logger.warning(f"Could not extract {rule_object_name}: {e}")

        logger.info(f"Extracted total of {len(all_rules)} sharing rules")
        return all_rules

    async def extract_all(self) -> Dict[str, List[Any]]:
        """
        Extract all data in one operation

        Returns:
            Dict with all extracted data (Pydantic models converted to dicts)
        """
        logger.info("Starting full extraction")

        # Extract all in parallel would be better, but let's keep it simple for now
        users = await self.extract_users()
        roles = await self.extract_user_roles()
        profiles = await self.extract_profiles()
        permission_sets = await self.extract_permission_sets()
        permission_set_assignments = await self.extract_permission_set_assignments()
        permission_set_groups = await self.extract_permission_set_groups()
        permission_set_group_components = await self.extract_permission_set_group_components()
        object_permissions = await self.extract_object_permissions()
        field_permissions = await self.extract_field_permissions()

        # Extract field permissions from Profile metadata (for Standard Profiles)
        # Standard Profiles store field permissions in Profile XML, not in FieldPermissions object
        profile_field_permissions = await self.extract_profile_field_permissions(profiles)
        logger.info(f"Extracted {len(profile_field_permissions)} field permissions from Profile metadata")

        # Combine FieldPermissions from database + Profile metadata
        # Both need to be in dict format for persistence
        all_field_permissions = []

        # Convert Pydantic FieldPermissions to dicts
        for fp in field_permissions:
            all_field_permissions.append(fp.model_dump())

        # Add Profile field permissions (already in dict format)
        for pfp in profile_field_permissions:
            all_field_permissions.append(pfp)

        logger.info(f"Total field permissions (FieldPermissions + Profile metadata): {len(all_field_permissions)}")

        # Extract sharing data (some objects may not be available in all orgs)
        groups = await self.extract_groups()
        group_members = await self.extract_group_members()
        account_shares = await self.extract_account_shares()
        opportunity_shares = await self.extract_opportunity_shares()

        # Extract Organization-Wide Defaults
        organization_wide_defaults = await self.extract_organization_wide_defaults()

        # AccountTeamMember is optional - may not be enabled in all orgs
        account_team_members = []
        try:
            account_team_members = await self.extract_account_team_members()
        except Exception as e:
            logger.warning(f"Could not extract account team members (may not be enabled): {e}")

        # OpportunityTeamMember is also optional — requires Sales Cloud team
        # selling to be turned on. Same defensive pattern as account teams.
        opportunity_team_members = []
        try:
            opportunity_team_members = await self.extract_opportunity_team_members()
        except Exception as e:
            logger.warning(
                f"Could not extract opportunity team members "
                f"(may not be enabled): {e}"
            )

        # Extract sharing rules
        sharing_rules = await self.extract_sharing_rules()

        # Convert Pydantic models to dicts
        data = {
            "users": [u.model_dump() for u in users],
            "roles": [r.model_dump() for r in roles],
            "profiles": [p.model_dump() for p in profiles],
            "permission_sets": [ps.model_dump() for ps in permission_sets],
            "permission_set_assignments": [psa.model_dump() for psa in permission_set_assignments],
            "permission_set_groups": [psg.model_dump() for psg in permission_set_groups],
            "permission_set_group_components": [psgc.model_dump() for psgc in permission_set_group_components],
            "object_permissions": [op.model_dump() for op in object_permissions],
            # Use combined field permissions (FieldPermissions + Profile metadata)
            "field_permissions": all_field_permissions,
            "groups": [g.model_dump() for g in groups],
            "group_members": [gm.model_dump() for gm in group_members],
            "account_shares": [ash.model_dump() for ash in account_shares],
            "opportunity_shares": [osh.model_dump() for osh in opportunity_shares],
            "account_team_members": [atm.model_dump() for atm in account_team_members],
            "opportunity_team_members": [otm.model_dump() for otm in opportunity_team_members],
            "organization_wide_defaults": [owd.model_dump() for owd in organization_wide_defaults],
            "sharing_rules": [sr.model_dump() for sr in sharing_rules],
        }

        logger.info("Extraction complete")
        return data

    async def describe_object(self, object_name: str) -> Dict[str, Any]:
        """
        Describe a Salesforce object to get field metadata

        Args:
            object_name: API name of the object (e.g., "Account", "Contact")

        Returns:
            Dictionary containing object metadata including fields
        """
        url = f"{self.base_url}/sobjects/{object_name}/describe"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()
            return response.json()

    async def get_system_required_fields(self, object_name: str) -> List[Dict[str, Any]]:
        """
        Get system-required/mandatory fields for an object

        System-required fields are those that:
        1. Are always accessible (cannot be hidden via FLS)
        2. Include: Id, OwnerId, CreatedById, CreatedDate, LastModifiedById, LastModifiedDate
        3. For objects with Name field: Name (required for most operations)

        Args:
            object_name: API name of the object

        Returns:
            List of field dictionaries with name, type, and accessibility info
        """
        describe_result = await self.describe_object(object_name)
        system_required_fields = []

        # List of field names that are always system-required
        always_required = {
            'Id', 'OwnerId', 'CreatedById', 'CreatedDate',
            'LastModifiedById', 'LastModifiedDate', 'SystemModstamp'
        }

        for field in describe_result.get("fields", []):
            field_name = field.get("name")

            # Include if it's in the always-required list
            if field_name in always_required:
                system_required_fields.append({
                    "name": field_name,
                    "type": field.get("type"),
                    "label": field.get("label"),
                    "nillable": field.get("nillable", True),
                    "createable": field.get("createable", False),
                    "updateable": field.get("updateable", False),
                    "reason": "System field"
                })
            # Include Name field if it exists (required for most standard objects)
            elif field_name == "Name" or (
                field_name.endswith("Name") and field.get("nameField", False)
            ):
                system_required_fields.append({
                    "name": field_name,
                    "type": field.get("type"),
                    "label": field.get("label"),
                    "nillable": field.get("nillable", True),
                    "createable": field.get("createable", False),
                    "updateable": field.get("updateable", False),
                    "reason": "Name field"
                })

        logger.info(f"Found {len(system_required_fields)} system-required fields for {object_name}")
        return system_required_fields

    async def extract_organization_wide_defaults(self) -> List["SalesforceOrganizationWideDefault"]:
        """
        Extract Organization-Wide Default (OWD) sharing settings for all objects

        OWD defines the baseline access level for each object:
        - Private: Only owner can access
        - Read: All users can read
        - ReadWrite: All users can read/write
        - ControlledByParent: Inherited from parent (e.g., Contact OWD from Account)
        - FullAccess: All users have full access (rare)

        Returns:
            List of SalesforceOrganizationWideDefault objects
        """
        from app.salesforce.models import SalesforceOrganizationWideDefault

        owds = []

        # Standard objects to extract OWD for
        standard_objects = [
            "Account",
            "Contact",
            "Opportunity",
            "Lead",
            "Case",
            "Campaign",
            "Contract",
            "Order"
        ]

        for sobject_type in standard_objects:
            try:
                describe_result = await self.describe_object(sobject_type)

                # Extract OWD settings from describe response
                # Note: Some orgs may not have all these fields depending on configuration
                default_sharing = describe_result.get("defaultSharingModel")  # Internal users
                external_sharing = describe_result.get("externalSharingModel")  # External users

                if default_sharing:
                    owd = SalesforceOrganizationWideDefault(
                        sobject_type=sobject_type,
                        sobject_label=describe_result.get("label"),
                        internal_sharing_model=default_sharing,
                        external_sharing_model=external_sharing
                    )
                    owds.append(owd)
                    logger.info(f"Extracted OWD for {sobject_type}: {default_sharing}")
            except Exception as e:
                logger.warning(f"Could not extract OWD for {sobject_type}: {e}")
                continue

        logger.info(f"Extracted {len(owds)} OWD settings")
        return owds

    async def extract_profile_field_permissions(
        self, profiles: List[SalesforceProfile]
    ) -> List[Dict[str, Any]]:
        """
        Extract field permissions from Profile metadata for all profiles

        This is needed because Standard Profiles store field permissions in Profile XML,
        not in the FieldPermissions object.

        Args:
            profiles: List of SalesforceProfile objects

        Returns:
            List of field permission dictionaries compatible with FieldPermissions format
        """
        from app.salesforce.metadata_client import SalesforceMetadataClient

        metadata_client = SalesforceMetadataClient(
            instance_url=self.instance_url,
            access_token=self.access_token,
            api_version=self.api_version
        )

        all_profile_field_permissions = []

        # Get permission set mapping (profile ID -> profile-owned permission set ID)
        # We need to assign these field permissions to the profile-owned permission set
        permission_sets_query = """
            SELECT Id, ProfileId, IsOwnedByProfile
            FROM PermissionSet
            WHERE IsOwnedByProfile = true
        """
        ps_records = await self.query_all(permission_sets_query)
        profile_to_ps_map = {ps["ProfileId"]: ps["Id"] for ps in ps_records if ps.get("ProfileId")}

        for profile in profiles:
            try:
                # Get field permissions from Profile metadata via SOAP
                profile_name = profile.Name
                field_perms = await metadata_client.get_profile_field_permissions_soap(profile_name)

                # Convert to FieldPermissions format
                # Assign ParentId as the profile-owned permission set ID
                parent_id = profile_to_ps_map.get(profile.Id)

                if not parent_id:
                    logger.warning(f"No profile-owned permission set found for profile {profile_name}")
                    continue

                for fp in field_perms:
                    # Only include permissions that are actually granted (Read or Edit = True)
                    if fp.get("PermissionsRead") or fp.get("PermissionsEdit"):
                        # Generate a unique 18-character ID for this permission
                        # Use hashlib to create a hash and take first 15 chars (Salesforce custom IDs are 15-18 chars)
                        unique_str = f"{profile.Id}_{fp['SobjectType']}_{fp['Field']}"
                        hash_obj = hashlib.sha256(unique_str.encode())
                        # Take first 15 chars of hex digest and prefix with FPM (Field Permission Metadata)
                        field_id = "FPM" + hash_obj.hexdigest()[:15]

                        all_profile_field_permissions.append({
                            "Id": field_id,
                            "ParentId": parent_id,
                            "SobjectType": fp["SobjectType"],
                            "Field": fp["Field"],
                            "PermissionsRead": fp["PermissionsRead"],
                            "PermissionsEdit": fp["PermissionsEdit"],
                        })

                logger.info(f"Extracted {len([fp for fp in field_perms if fp.get('PermissionsRead') or fp.get('PermissionsEdit')])} field permissions from Profile: {profile_name}")

            except Exception as e:
                logger.warning(f"Failed to extract field permissions for profile {profile.Name}: {e}")
                continue

        return all_profile_field_permissions
