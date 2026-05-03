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
    private static final String DEFAULT_API_ENDPOINT = 'https://accessgraph-ai-production.up.railway.app';

    // Frontend dashboard URL (where 'Open Full Dashboard' takes the user)
    private static final String DEFAULT_DASHBOARD_URL = 'https://gentle-love-production-1eba.up.railway.app';

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
        String orgId = getOrganizationId();

        // Health check
        try {
            HttpResponse healthRes = sendGet(baseUrl + '/health', 10000);
            summary.backendReachable = healthRes.getStatusCode() == 200;
        } catch (Exception e) {
            System.debug('getOrgSummary health check failed: ' + e.getMessage());
        }

        // Last sync job - also extract per-entity counts from sync metadata
        try {
            HttpResponse syncRes = sendGet(baseUrl + '/orgs/' + orgId + '/sync-jobs?limit=1', 15000);
            if (syncRes.getStatusCode() == 200) {
                List<Object> jobs = (List<Object>) JSON.deserializeUntyped(syncRes.getBody());
                if (!jobs.isEmpty()) {
                    Map<String, Object> latestJob = (Map<String, Object>) jobs[0];

                    // Pass raw ISO strings - lightning-formatted-date-time on the
                    // LWC side parses these natively. Avoids fragile Apex DateTime
                    // parsing that was returning null and leaving the LWC blank.
                    summary.lastSyncDate = (String) latestJob.get('completed_at');
                    if (String.isBlank(summary.lastSyncDate)) {
                        summary.lastSyncDate = (String) latestJob.get('started_at');
                    }
                    summary.lastSyncStatus = (String) latestJob.get('status');

                    // Extract per-entity sync counts from metadata.counts so the
                    // LWC can show what was actually synced.
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

        // Anomaly count - fetch all and count (backend doesn't return totals)
        try {
            HttpResponse anomRes = sendGet(baseUrl + '/orgs/' + orgId + '/anomalies?limit=1000', 15000);
            if (anomRes.getStatusCode() == 200) {
                List<Object> anomalies = (List<Object>) JSON.deserializeUntyped(anomRes.getBody());
                summary.anomalyCount = anomalies.size();
            }
        } catch (Exception e) {
            System.debug('getOrgSummary anomalies fetch failed: ' + e.getMessage());
        }

        // Recommendation count
        try {
            HttpResponse recRes = sendGet(baseUrl + '/orgs/' + orgId + '/recommendations?limit=1000', 15000);
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
}
