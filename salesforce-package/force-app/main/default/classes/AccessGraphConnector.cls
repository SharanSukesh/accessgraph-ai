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

    // API Configuration
    private static final String DEFAULT_API_ENDPOINT = 'https://accessgraph-ai-production.up.railway.app';
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
     * Trigger a permission sync to AccessGraph AI
     * Can be called from:
     * - Setup page button
     * - Scheduled job
     * - Flow/Process Builder
     */
    @AuraEnabled
    public static Map<String, Object> triggerSync() {
        try {
            String orgId = getOrganizationId();
            String endpoint = getApiEndpoint() + '/orgs/' + orgId + '/sync';

            // Make callout
            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setTimeout(120000); // 2 minutes

            Http http = new Http();
            HttpResponse res = http.send(req);

            // Update settings
            updateSyncStatus(res.getStatusCode() == 200 ? 'Success' : 'Failed');

            // Parse response
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            result.put('statusCode', res.getStatusCode());

            return result;

        } catch (Exception e) {
            updateSyncStatus('Error: ' + e.getMessage());
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
