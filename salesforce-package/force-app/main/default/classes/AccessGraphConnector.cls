/**
 * AccessGraph AI Connector
 * Handles communication between Salesforce and AccessGraph AI backend
 *
 * Features:
 * - Trigger permission sync to AccessGraph AI
 * - Check sync status
 * - Retrieve organization ID
 * - Handle OAuth token refresh
 */
public with sharing class AccessGraphConnector {

    // Backend API endpoint (HTTP callouts go here)
    private static final String DEFAULT_API_ENDPOINT = 'https://api.accessgraphai.com';

    // Frontend dashboard URL (where 'Open Full Dashboard' takes the user)
    private static final String DEFAULT_DASHBOARD_URL = 'https://app.accessgraphai.com';

    private static final String API_VERSION = 'v1';

    /**
     * Get API endpoint from custom settings or use default
     */
    private static String getApiEndpoint() {
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        if (settings != null && String.isNotBlank(settings.API_Endpoint__c)) {
            return settings.API_Endpoint__c;
        }
        return DEFAULT_API_ENDPOINT;
    }

    /**
     * Get dashboard (frontend UI) URL.
     * Currently hardcoded; can be made configurable via custom setting later.
     */
    private static String getDashboardBaseUrl() {
        return DEFAULT_DASHBOARD_URL;
    }

    /**
     * Get organization ID from custom settings
     */
    public static String getOrganizationId() {
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        if (settings != null && String.isNotBlank(settings.Organization_ID__c)) {
            return settings.Organization_ID__c;
        }
        // If not set, use Salesforce Org ID
        return UserInfo.getOrganizationId();
    }

    /**
     * Trigger a permission sync to AccessGraph AI.
     *
     * Uses the /package/sync-trigger endpoint which accepts the Salesforce Org ID
     * (rather than the internal AccessGraph UUID), making this work for any
     * customer org without requiring them to know their internal UUID.
     *
     * Backend response codes:
     *  - 200/202: sync started successfully
     *  - 404: org not registered (install handler hasn't run, or never installed)
     *  - 403: OAuth not yet completed; user needs to visit the dashboard first
     *
     * Can be called from:
     * - The AccessGraph Home Lightning Page ("Sync Now" button)
     * - Scheduled jobs
     * - Flows / Process Builder
     */
    @AuraEnabled
    public static Map<String, Object> triggerSync() {
        try {
            String salesforceOrgId = UserInfo.getOrganizationId();
            String endpoint = getApiEndpoint() + '/package/sync-trigger';

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(new Map<String, Object>{
                'organizationId' => salesforceOrgId
            }));
            req.setTimeout(120000); // 2 minutes

            Http http = new Http();
            HttpResponse res = http.send(req);
            Integer status = res.getStatusCode();

            // Friendly status label for the custom-setting field
            String statusLabel;
            if (status == 200 || status == 202) {
                statusLabel = 'Success';
            } else if (status == 403) {
                statusLabel = 'OAuth Required';
            } else if (status == 404) {
                statusLabel = 'Not Registered';
            } else {
                statusLabel = 'Failed';
            }
            updateSyncStatus(statusLabel);

            // Parse response - graceful if body isn't valid JSON
            Map<String, Object> result;
            try {
                result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            } catch (Exception parseError) {
                result = new Map<String, Object>{ 'rawBody' => res.getBody() };
            }
            result.put('statusCode', status);

            return result;

        } catch (Exception e) {
            updateSyncStatus('Error');
            throw new AuraHandledException('Failed to trigger sync: ' + e.getMessage());
        }
    }

    /**
     * Get sync status from AccessGraph AI
     */
    @AuraEnabled
    public static Map<String, Object> getSyncStatus() {
        try {
            String orgId = getOrganizationId();
            String endpoint = getApiEndpoint() + '/orgs/' + orgId + '/sync-jobs';

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(30000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                List<Object> jobs = (List<Object>) JSON.deserializeUntyped(res.getBody());
                if (!jobs.isEmpty()) {
                    return (Map<String, Object>) jobs[0]; // Return latest job
                }
            }

            return new Map<String, Object>();

        } catch (Exception e) {
            throw new AuraHandledException('Failed to get sync status: ' + e.getMessage());
        }
    }

    /**
     * Check if AccessGraph AI is properly configured
     */
    @AuraEnabled
    public static Map<String, Object> checkConnection() {
        try {
            String endpoint = getApiEndpoint() + '/health';

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('GET');
            req.setTimeout(10000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            return new Map<String, Object>{
                'connected' => res.getStatusCode() == 200,
                'statusCode' => res.getStatusCode(),
                'endpoint' => getApiEndpoint(),
                'organizationId' => getOrganizationId()
            };

        } catch (Exception e) {
            return new Map<String, Object>{
                'connected' => false,
                'error' => e.getMessage()
            };
        }
    }

    /**
     * Single call returning everything the home page LWC needs.
     * Each callout is wrapped in try/catch so a partial backend failure
     * still returns a populated DTO with backendReachable=false.
     */
    @AuraEnabled(cacheable=true)
    public static OrgSummary getOrgSummary() {
        OrgSummary summary = new OrgSummary();
        summary.backendReachable = false;
        summary.anomalyCount = 0;
        summary.recommendationCount = 0;

        // Detect whether this org is a sandbox/scratch (uses test.salesforce.com
        // for OAuth) vs a production org (uses login.salesforce.com). The
        // frontend forwards this env param to the backend's authorize endpoint
        // so the OAuth redirect goes to the right Salesforce login host.
        Boolean isSandbox = false;
        try {
            List<Organization> orgs = [SELECT IsSandbox FROM Organization LIMIT 1];
            if (!orgs.isEmpty()) {
                isSandbox = orgs[0].IsSandbox;
            }
        } catch (Exception e) {
            System.debug('Could not query Organization.IsSandbox: ' + e.getMessage());
        }

        // Dashboard URL points to the FRONTEND (UI), not the backend API.
        // We pass the Salesforce Org ID so the frontend can route the user
        // to the right org once they sign in. env=sandbox tells the frontend
        // to use test.salesforce.com for the OAuth flow.
        String envParam = isSandbox ? '&env=sandbox' : '';
        summary.dashboardUrl = getDashboardBaseUrl()
            + '/?org=' + UserInfo.getOrganizationId()
            + envParam
            + '&utm_source=salesforce_app';

        String baseUrl = getApiEndpoint();
        String salesforceOrgId = UserInfo.getOrganizationId();

        // Health check
        try {
            HttpResponse healthRes = sendGet(baseUrl + '/health', 10000);
            summary.backendReachable = healthRes.getStatusCode() == 200;
        } catch (Exception e) {
            System.debug('getOrgSummary health check failed: ' + e.getMessage());
        }

        // Step 1: Resolve Salesforce Org ID -> internal AccessGraph UUID via
        // /package/status. The /orgs/{id}/* endpoints below all expect the
        // internal UUID; we don't store that in the package, only the SF Org ID.
        String internalOrgId = null;
        try {
            HttpResponse statusRes = sendGet(
                baseUrl + '/package/status/' + salesforceOrgId, 10000
            );
            if (statusRes.getStatusCode() == 200) {
                Map<String, Object> statusBody = (Map<String, Object>)
                    JSON.deserializeUntyped(statusRes.getBody());
                if (statusBody.get('installed') == true) {
                    internalOrgId = (String) statusBody.get('organization_id');
                }
            }
        } catch (Exception e) {
            System.debug('getOrgSummary status lookup failed: ' + e.getMessage());
        }

        // If we don't have the internal UUID, we can't query the org-scoped
        // endpoints below - return what we have (backend health + dashboard URL)
        if (String.isBlank(internalOrgId)) {
            return summary;
        }

        // Step 2: Last sync job + per-entity counts from sync metadata
        try {
            HttpResponse syncRes = sendGet(
                baseUrl + '/orgs/' + internalOrgId + '/sync-jobs?limit=1', 15000
            );
            if (syncRes.getStatusCode() == 200) {
                List<Object> jobs = (List<Object>) JSON.deserializeUntyped(syncRes.getBody());
                if (!jobs.isEmpty()) {
                    Map<String, Object> latestJob = (Map<String, Object>) jobs[0];

                    // Raw ISO strings - lightning-formatted-date-time parses natively
                    summary.lastSyncDate = (String) latestJob.get('completed_at');
                    if (String.isBlank(summary.lastSyncDate)) {
                        summary.lastSyncDate = (String) latestJob.get('started_at');
                    }
                    summary.lastSyncStatus = (String) latestJob.get('status');

                    Map<String, Object> metadata = (Map<String, Object>) latestJob.get('metadata');
                    if (metadata != null) {
                        Map<String, Object> counts = (Map<String, Object>) metadata.get('counts');
                        if (counts != null) {
                            summary.userCount = toInt(counts.get('users'));
                            summary.permissionSetCount = toInt(counts.get('permission_sets'));
                            summary.profileCount = toInt(counts.get('profiles'));
                            summary.objectPermissionCount = toInt(counts.get('object_permissions'));
                            summary.fieldPermissionCount = toInt(counts.get('field_permissions'));
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.debug('getOrgSummary sync-jobs fetch failed: ' + e.getMessage());
        }

        // Step 3: Anomaly count
        try {
            HttpResponse anomRes = sendGet(
                baseUrl + '/orgs/' + internalOrgId + '/anomalies?limit=1000', 15000
            );
            if (anomRes.getStatusCode() == 200) {
                List<Object> anomalies = (List<Object>) JSON.deserializeUntyped(anomRes.getBody());
                summary.anomalyCount = anomalies.size();
            }
        } catch (Exception e) {
            System.debug('getOrgSummary anomalies fetch failed: ' + e.getMessage());
        }

        // Step 4: Recommendation count
        try {
            HttpResponse recRes = sendGet(
                baseUrl + '/orgs/' + internalOrgId + '/recommendations?limit=1000', 15000
            );
            if (recRes.getStatusCode() == 200) {
                List<Object> recs = (List<Object>) JSON.deserializeUntyped(recRes.getBody());
                summary.recommendationCount = recs.size();
            }
        } catch (Exception e) {
            System.debug('getOrgSummary recommendations fetch failed: ' + e.getMessage());
        }

        return summary;
    }

    /**
     * DTO returned by getOrgSummary() - strongly typed for LWC consumption.
     * lastSyncDate is a raw ISO 8601 string (e.g. "2026-05-03T08:06:02Z");
     * the LWC's lightning-formatted-date-time parses it natively.
     */
    public class OrgSummary {
        @AuraEnabled public Boolean backendReachable;
        @AuraEnabled public String lastSyncDate;
        @AuraEnabled public String lastSyncStatus;
        @AuraEnabled public Integer anomalyCount;
        @AuraEnabled public Integer recommendationCount;
        @AuraEnabled public Integer userCount;
        @AuraEnabled public Integer permissionSetCount;
        @AuraEnabled public Integer profileCount;
        @AuraEnabled public Integer objectPermissionCount;
        @AuraEnabled public Integer fieldPermissionCount;
        @AuraEnabled public String dashboardUrl;
    }

    /**
     * Coerce a JSON-deserialized number (Integer or Long) to Integer. Default 0.
     */
    private static Integer toInt(Object value) {
        if (value == null) return 0;
        if (value instanceof Integer) return (Integer) value;
        if (value instanceof Long) return ((Long) value).intValue();
        try {
            return Integer.valueOf(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Helper: GET request with shared headers and timeout
     */
    private static HttpResponse sendGet(String endpoint, Integer timeoutMs) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(timeoutMs);
        return new Http().send(req);
    }

    /**
     * Resolve the current SF org's internal AccessGraph UUID via
     * /package/status. Returns null if the org isn't registered yet
     * (install handler hasn't run / OAuth not completed).
     *
     * Cached behaviour is intentional via the package-status endpoint
     * being cheap. Callers should handle null by returning a graceful
     * "not configured" state to the LWC.
     */
    private static String resolveInternalOrgId() {
        String baseUrl = getApiEndpoint();
        String salesforceOrgId = UserInfo.getOrganizationId();
        try {
            HttpResponse statusRes = sendGet(
                baseUrl + '/package/status/' + salesforceOrgId, 10000
            );
            if (statusRes.getStatusCode() == 200) {
                Map<String, Object> body = (Map<String, Object>)
                    JSON.deserializeUntyped(statusRes.getBody());
                if (body.get('installed') == true) {
                    return (String) body.get('organization_id');
                }
            }
        } catch (Exception e) {
            System.debug('resolveInternalOrgId failed: ' + e.getMessage());
        }
        return null;
    }

    /**
     * Update sync status in custom settings
     * Truncates status to 50 chars to fit field limit
     */
    private static void updateSyncStatus(String status) {
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        if (settings == null || settings.Id == null) {
            settings = new AccessGraph_Settings__c();
            settings.SetupOwnerId = UserInfo.getOrganizationId();
        }

        // Truncate to fit Sync_Status__c field length (50 chars)
        settings.Sync_Status__c = status != null && status.length() > 50
            ? status.substring(0, 50)
            : status;
        settings.Last_Sync_Date__c = DateTime.now();

        upsert settings;
    }

    /**
     * Initialize settings after package installation
     * Called by post-install script
     */
    public static void initializeSettings() {
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        if (settings == null || settings.Id == null) {
            settings = new AccessGraph_Settings__c();
            settings.SetupOwnerId = UserInfo.getOrganizationId();
            settings.API_Endpoint__c = DEFAULT_API_ENDPOINT;
            settings.Organization_ID__c = UserInfo.getOrganizationId();
            settings.Auto_Sync_Enabled__c = true;
            insert settings;
        }
    }

    /**
     * Issue a deep-link URL to the AccessGraph AI web app for a Setup-page
     * detail view (User, Field, or Permission Set). The LWC quick actions
     * call this on click; the returned URL is opened in a new tab.
     *
     * Resource types accepted by the backend:
     *  - "user"            -> resourceId = Salesforce User Id (15 or 18 char)
     *  - "field"           -> resourceId = "Object.Field" API name
     *  - "permission_set"  -> resourceId = Salesforce PermissionSet Id
     *
     * Backend response codes:
     *  - 200: token issued; result.redeemUrl is ready
     *  - 404: org not registered; surface "complete OAuth setup first" toast
     *  - 5xx / network: throw AuraHandledException so the LWC can show error
     */
    @AuraEnabled
    public static String issueDeepLink(String resourceType, String resourceId) {
        try {
            String endpoint = getApiEndpoint() + '/auth/deeplink/issue';

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(new Map<String, Object>{
                'salesforceOrgId' => UserInfo.getOrganizationId(),
                'salesforceUserId' => UserInfo.getUserId(),
                'resourceType' => resourceType,
                'resourceId' => resourceId
            }));
            req.setTimeout(15000);

            HttpResponse res = new Http().send(req);
            Integer status = res.getStatusCode();

            if (status == 200) {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
                Object redeemUrl = body.get('redeemUrl');
                if (redeemUrl == null) {
                    throw new AuraHandledException('Backend response missing redeemUrl');
                }
                return (String) redeemUrl;
            } else if (status == 404) {
                throw new AuraHandledException('Org not registered with AccessGraph AI. Open the Full Dashboard first to complete setup.');
            } else {
                throw new AuraHandledException('Could not open AccessGraph AI (status ' + status + ').');
            }
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Could not reach AccessGraph AI: ' + e.getMessage());
        }
    }

    // ----------------------------------------------------------------------
    // Explorer methods - power the AccessGraph Explorer tab. These return
    // lightweight picker rows so the LWC can render search results without
    // round-tripping the backend.
    // ----------------------------------------------------------------------

    /**
     * Picker row used by the Explorer LWC. Plain old Apex DTO.
     */
    public class PickerItem {
        @AuraEnabled public String id;
        @AuraEnabled public String label;
        @AuraEnabled public String sublabel;
    }

    /**
     * List active users for the Users tab. Filters out automated accounts
     * (UserType = Standard) and supports a partial-name search.
     */
    @AuraEnabled(cacheable=true)
    public static List<PickerItem> listUsersForExplorer(String searchTerm) {
        List<PickerItem> items = new List<PickerItem>();
        String pattern = String.isBlank(searchTerm) ? '%' : '%' + searchTerm + '%';
        for (User u : [
            SELECT Id, Name, Username
            FROM User
            WHERE IsActive = true
              AND UserType = 'Standard'
              AND (Name LIKE :pattern OR Username LIKE :pattern)
            ORDER BY Name ASC
            LIMIT 50
        ]) {
            PickerItem item = new PickerItem();
            item.id = u.Id;
            item.label = u.Name;
            item.sublabel = u.Username;
            items.add(item);
        }
        return items;
    }

    /**
     * List non-profile-owned permission sets for the Permission Sets tab.
     * Profile-owned PSes are excluded since admins manage those via Profiles.
     */
    @AuraEnabled(cacheable=true)
    public static List<PickerItem> listPermissionSetsForExplorer(String searchTerm) {
        List<PickerItem> items = new List<PickerItem>();
        String pattern = String.isBlank(searchTerm) ? '%' : '%' + searchTerm + '%';
        for (PermissionSet ps : [
            SELECT Id, Name, Label, Type
            FROM PermissionSet
            WHERE IsOwnedByProfile = false
              AND (Label LIKE :pattern OR Name LIKE :pattern)
            ORDER BY Label ASC
            LIMIT 50
        ]) {
            PickerItem item = new PickerItem();
            item.id = ps.Id;
            item.label = ps.Label;
            item.sublabel = ps.Type == null || ps.Type == 'Regular'
                ? ps.Name
                : ps.Name + ' (' + ps.Type + ')';
            items.add(item);
        }
        return items;
    }

    /**
     * List custom + queryable standard objects for the Fields tab's object
     * picker. Hides "system" objects and Salesforce internals to keep the list
     * usable.
     */
    @AuraEnabled(cacheable=true)
    public static List<PickerItem> listObjectsForExplorer(String searchTerm) {
        List<PickerItem> items = new List<PickerItem>();
        String search = String.isBlank(searchTerm) ? '' : searchTerm.toLowerCase();
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
        List<String> sortedKeys = new List<String>(globalDescribe.keySet());
        sortedKeys.sort();
        for (String objectKey : sortedKeys) {
            Schema.SObjectType sobjType = globalDescribe.get(objectKey);
            Schema.DescribeSObjectResult d = sobjType.getDescribe();
            if (!d.isQueryable() || d.isCustomSetting()) continue;
            // Skip share/history/feed/changeevent and similar system tables
            String name = d.getName();
            if (name.endsWith('__Share') || name.endsWith('__History')
                || name.endsWith('__Feed') || name.endsWith('__ChangeEvent')
                || name.endsWith('__e') || name.endsWith('__Tag')) continue;
            String label = d.getLabel();
            if (search != '' && !label.toLowerCase().contains(search)
                && !name.toLowerCase().contains(search)) continue;

            PickerItem item = new PickerItem();
            item.id = name;
            item.label = label;
            item.sublabel = name;
            items.add(item);
            // 500 is plenty for most orgs and avoids cutting off alphabetically
            // (there are ~150+ standard SObjects, so a low cap would hide User
            // and other late-alphabet objects).
            if (items.size() >= 500) break;
        }
        return items;
    }

    /**
     * List fields for a given object. resourceId for the deep-link is
     * "ObjectName.FieldName" (the qualified API name), passed back from the
     * picker.
     */
    @AuraEnabled(cacheable=true)
    public static List<PickerItem> listFieldsForExplorer(String objectName, String searchTerm) {
        List<PickerItem> items = new List<PickerItem>();
        if (String.isBlank(objectName)) return items;
        String search = String.isBlank(searchTerm) ? '' : searchTerm.toLowerCase();

        Schema.SObjectType sobjType = Schema.getGlobalDescribe().get(objectName);
        if (sobjType == null) return items;
        Schema.DescribeSObjectResult d = sobjType.getDescribe();
        Map<String, Schema.SObjectField> fieldMap = d.fields.getMap();
        List<String> sortedFieldKeys = new List<String>(fieldMap.keySet());
        sortedFieldKeys.sort();
        for (String fieldKey : sortedFieldKeys) {
            Schema.DescribeFieldResult fd = fieldMap.get(fieldKey).getDescribe();
            if (!fd.isAccessible()) continue;
            String name = fd.getName();
            String label = fd.getLabel();
            if (search != '' && !label.toLowerCase().contains(search)
                && !name.toLowerCase().contains(search)) continue;

            PickerItem item = new PickerItem();
            // The resourceId we send to the deep-link issuer is "Object.Field"
            item.id = objectName + '.' + name;
            item.label = label;
            item.sublabel = name;
            items.add(item);
            if (items.size() >= 200) break;
        }
        return items;
    }

    // ========================================================================
    // Equity (GAEA) — backend callouts for the in-Salesforce equity UI
    // ========================================================================

    /**
     * Headline equity metrics for the current org. Powers the AccessGraph
     * Equity app tab — Equity Index, most-disadvantaged group, VIP count,
     * per-department utility map.
     */
    @AuraEnabled
    public static EquityDiagnostic getEquityDiagnostic() {
        String internalOrgId = resolveInternalOrgId();
        EquityDiagnostic d = new EquityDiagnostic();
        d.hasData = false;
        if (String.isBlank(internalOrgId)) {
            d.errorReason = 'Org not registered with AccessGraph AI yet.';
            return d;
        }
        try {
            HttpResponse res = sendGet(
                getApiEndpoint() + '/orgs/' + internalOrgId + '/equity/diagnostic',
                15000
            );
            if (res.getStatusCode() != 200) {
                d.errorReason = 'Backend returned ' + res.getStatusCode();
                return d;
            }
            Map<String, Object> body = (Map<String, Object>)
                JSON.deserializeUntyped(res.getBody());
            d.hasData = (Boolean) body.get('has_data');
            d.snapshotAt = (String) body.get('snapshot_at');
            d.equityIndex = (Double) body.get('equity_index');
            d.disparity = (Double) body.get('disparity');
            d.mostDisadvantagedGroup = (String) body.get('most_disadvantaged_group');
            d.vipCount = toInt(body.get('vip_count'));
            d.recommendationsGenerated = toInt(body.get('recommendations_generated'));
            Map<String, Object> perDept =
                (Map<String, Object>) body.get('per_dept_utilities');
            if (perDept != null) {
                d.perDeptUtilities = new Map<String, Double>();
                for (String k : perDept.keySet()) {
                    Object v = perDept.get(k);
                    if (v == null) continue;
                    d.perDeptUtilities.put(k, Double.valueOf(String.valueOf(v)));
                }
            }
        } catch (Exception e) {
            d.errorReason = 'Callout failed: ' + e.getMessage();
        }
        return d;
    }

    /**
     * Bulk per-user equity stats — drives the "All Users" view in the
     * AccessGraph Equity app tab. Sorted worst-off-first by the backend
     * so the most interesting rows surface immediately.
     */
    @AuraEnabled(cacheable=true)
    public static List<EquityUser> getEquityUserList(Integer pageLimit) {
        Integer requested = pageLimit == null ? 100 : pageLimit;
        if (requested < 1) requested = 1;
        if (requested > 500) requested = 500;

        String internalOrgId = resolveInternalOrgId();
        if (String.isBlank(internalOrgId)) {
            return new List<EquityUser>();
        }
        List<EquityUser> rows = new List<EquityUser>();
        try {
            HttpResponse res = sendGet(
                getApiEndpoint() + '/orgs/' + internalOrgId
                    + '/equity/users?limit=' + requested,
                20000
            );
            if (res.getStatusCode() != 200) return rows;
            List<Object> list = (List<Object>) JSON.deserializeUntyped(res.getBody());
            for (Object item : list) {
                Map<String, Object> row = (Map<String, Object>) item;
                EquityUser eu = new EquityUser();
                eu.userSfId = (String) row.get('user_sf_id');
                eu.name = (String) row.get('name');
                eu.department = (String) row.get('department');
                eu.isVip = (Boolean) row.get('is_vip');
                Object dist = row.get('distance_to_nearest_vip');
                eu.distanceToNearestVip =
                    dist == null ? null : Double.valueOf(String.valueOf(dist));
                eu.utility = Double.valueOf(
                    String.valueOf(row.get('inverse_distance_utility'))
                );
                eu.departmentAvgUtility = Double.valueOf(
                    String.valueOf(row.get('department_avg_utility'))
                );
                eu.openRecommendations = toInt(row.get('open_recommendations'));
                rows.add(eu);
            }
        } catch (Exception e) {
            System.debug('getEquityUserList failed: ' + e.getMessage());
        }
        return rows;
    }

    /**
     * Per-user disparity drill-down — used by both the User detail page
     * panel and the click-into-a-row flow in the Equity tab.
     */
    @AuraEnabled(cacheable=true)
    public static EquityUserDetail getUserEquity(String userSfId) {
        EquityUserDetail d = new EquityUserDetail();
        d.userSfId = userSfId;
        if (String.isBlank(userSfId)) {
            d.errorReason = 'No userSfId provided.';
            return d;
        }
        String internalOrgId = resolveInternalOrgId();
        if (String.isBlank(internalOrgId)) {
            d.errorReason = 'Org not registered yet.';
            return d;
        }
        try {
            HttpResponse res = sendGet(
                getApiEndpoint() + '/orgs/' + internalOrgId
                    + '/equity/users/' + userSfId,
                15000
            );
            if (res.getStatusCode() == 404) {
                d.errorReason = 'User not yet synced to AccessGraph AI.';
                return d;
            }
            if (res.getStatusCode() != 200) {
                d.errorReason = 'Backend returned ' + res.getStatusCode();
                return d;
            }
            Map<String, Object> body = (Map<String, Object>)
                JSON.deserializeUntyped(res.getBody());
            d.department = (String) body.get('department');
            Object dist = body.get('distance_to_nearest_vip');
            d.distanceToNearestVip =
                dist == null ? null : Double.valueOf(String.valueOf(dist));
            d.utility = Double.valueOf(
                String.valueOf(body.get('inverse_distance_utility'))
            );
            d.departmentAvgUtility = Double.valueOf(
                String.valueOf(body.get('department_avg_utility'))
            );
            d.orgAvgUtility = Double.valueOf(
                String.valueOf(body.get('org_avg_utility'))
            );
            d.isVip = (Boolean) body.get('is_vip');
        } catch (Exception e) {
            d.errorReason = 'Callout failed: ' + e.getMessage();
        }
        return d;
    }

    /**
     * Equity recommendations targeting a specific user. Returns the
     * grant_for_equity rows the policy proposed for them, with rationale
     * + status so the LWC can render Apply / Dismiss controls.
     */
    @AuraEnabled(cacheable=true)
    public static List<EquityRecommendation> getUserEquityRecommendations(String userSfId) {
        List<EquityRecommendation> out = new List<EquityRecommendation>();
        if (String.isBlank(userSfId)) return out;
        String internalOrgId = resolveInternalOrgId();
        if (String.isBlank(internalOrgId)) return out;
        try {
            HttpResponse res = sendGet(
                getApiEndpoint() + '/orgs/' + internalOrgId
                    + '/recommendations?track=equity&limit=200',
                15000
            );
            if (res.getStatusCode() != 200) return out;
            List<Object> rows = (List<Object>) JSON.deserializeUntyped(res.getBody());
            for (Object item : rows) {
                Map<String, Object> r = (Map<String, Object>) item;
                if (String.valueOf(r.get('target_entity_id')) != userSfId) continue;
                EquityRecommendation er = new EquityRecommendation();
                er.id = (String) r.get('id');
                er.title = (String) r.get('title');
                er.description = (String) r.get('description');
                er.rationale = (String) r.get('rationale');
                er.severity = (String) r.get('severity');
                er.status = (String) r.get('status');
                er.targetEntityId = (String) r.get('target_entity_id');
                Map<String, Object> aa =
                    (Map<String, Object>) r.get('affected_access');
                if (aa != null) {
                    er.psId = (String) aa.get('ps_id');
                    er.psLabel = (String) aa.get('ps_label');
                }
                out.add(er);
            }
        } catch (Exception e) {
            System.debug('getUserEquityRecommendations failed: ' + e.getMessage());
        }
        return out;
    }

    /**
     * Update an equity (or any) recommendation's status. Backed by the
     * existing PATCH /recommendations/{id} endpoint.
     */
    @AuraEnabled
    public static Map<String, Object> updateRecommendationStatus(
        String recId, String newStatus
    ) {
        if (String.isBlank(recId) || String.isBlank(newStatus)) {
            return new Map<String, Object>{
                'success' => false,
                'message' => 'recId and newStatus are required.'
            };
        }
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(getApiEndpoint() + '/recommendations/' + recId);
            req.setMethod('PATCH');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(new Map<String, Object>{
                'status' => newStatus
            }));
            req.setTimeout(15000);
            HttpResponse res = new Http().send(req);
            return new Map<String, Object>{
                'success' => res.getStatusCode() == 200,
                'statusCode' => res.getStatusCode(),
                'message' => res.getBody()
            };
        } catch (Exception e) {
            return new Map<String, Object>{
                'success' => false,
                'message' => e.getMessage()
            };
        }
    }

    /**
     * Trigger a fresh equity-recommendations run. Mirrors the "Generate
     * recommendations" button on the web app's Equity page.
     */
    @AuraEnabled
    public static Map<String, Object> generateEquityRecommendations() {
        String internalOrgId = resolveInternalOrgId();
        if (String.isBlank(internalOrgId)) {
            return new Map<String, Object>{
                'success' => false,
                'message' => 'Org not registered with AccessGraph AI yet.'
            };
        }
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(
                getApiEndpoint() + '/orgs/' + internalOrgId
                    + '/equity/recommendations/generate'
            );
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody('{}');
            req.setTimeout(60000);  // policy rollout can take ~10-30s on big orgs
            HttpResponse res = new Http().send(req);
            return new Map<String, Object>{
                'success' => res.getStatusCode() == 200,
                'statusCode' => res.getStatusCode(),
                'response' => res.getBody()
            };
        } catch (Exception e) {
            return new Map<String, Object>{
                'success' => false,
                'message' => e.getMessage()
            };
        }
    }

    // -------------------------------------------------------------------
    // Equity DTOs — @AuraEnabled so LWCs can bind to typed properties
    // -------------------------------------------------------------------

    public class EquityDiagnostic {
        @AuraEnabled public Boolean hasData;
        @AuraEnabled public String snapshotAt;
        @AuraEnabled public Double equityIndex;
        @AuraEnabled public Double disparity;
        @AuraEnabled public String mostDisadvantagedGroup;
        @AuraEnabled public Integer vipCount;
        @AuraEnabled public Integer recommendationsGenerated;
        @AuraEnabled public Map<String, Double> perDeptUtilities;
        @AuraEnabled public String errorReason;
    }

    public class EquityUser {
        @AuraEnabled public String userSfId;
        @AuraEnabled public String name;
        @AuraEnabled public String department;
        @AuraEnabled public Boolean isVip;
        @AuraEnabled public Double distanceToNearestVip;
        @AuraEnabled public Double utility;
        @AuraEnabled public Double departmentAvgUtility;
        @AuraEnabled public Integer openRecommendations;
    }

    public class EquityUserDetail {
        @AuraEnabled public String userSfId;
        @AuraEnabled public String department;
        @AuraEnabled public Boolean isVip;
        @AuraEnabled public Double distanceToNearestVip;
        @AuraEnabled public Double utility;
        @AuraEnabled public Double departmentAvgUtility;
        @AuraEnabled public Double orgAvgUtility;
        @AuraEnabled public String errorReason;
    }

    public class EquityRecommendation {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String description;
        @AuraEnabled public String rationale;
        @AuraEnabled public String severity;
        @AuraEnabled public String status;
        @AuraEnabled public String targetEntityId;
        @AuraEnabled public String psId;
        @AuraEnabled public String psLabel;
    }
}
