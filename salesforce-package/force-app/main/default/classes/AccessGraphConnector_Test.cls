/**
 * Test class for AccessGraphConnector
 * Ensures ≥75% code coverage for AppExchange requirements
 */
@isTest
private class AccessGraphConnector_Test {

    /**
     * Setup test data
     */
    @testSetup
    static void setupTestData() {
        // Initialize custom settings
        AccessGraph_Settings__c settings = new AccessGraph_Settings__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            API_Endpoint__c = 'https://test-api.accessgraph.ai',
            Organization_ID__c = UserInfo.getOrganizationId(),
            Auto_Sync_Enabled__c = true
        );
        insert settings;
    }

    /**
     * Test triggerSync() - Success case
     */
    @isTest
    static void testTriggerSync_Success() {
        // Setup mock HTTP response
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(200, '{"success": true, "sync_job_id": "123"}'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.triggerSync();
        Test.stopTest();

        // Verify response
        System.assertEquals(200, result.get('statusCode'), 'Should return 200 status code');
        System.assert(result.containsKey('success'), 'Should contain success field');

        // Verify settings updated
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        System.assertEquals('Success', settings.Sync_Status__c, 'Sync status should be Success');
        System.assertNotEquals(null, settings.Last_Sync_Date__c, 'Last sync date should be set');
    }

    /**
     * Test triggerSync() - Failure case
     */
    @isTest
    static void testTriggerSync_Failure() {
        // Setup mock HTTP response with error
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(500, '{"error": "Server error"}'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.triggerSync();
        Test.stopTest();

        // Verify response
        System.assertEquals(500, result.get('statusCode'), 'Should return 500 status code');

        // Verify settings updated with failure
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        System.assertEquals('Failed', settings.Sync_Status__c, 'Sync status should be Failed');
    }

    /**
     * Test triggerSync() - graceful handling of non-JSON response body.
     * The new triggerSync no longer throws on invalid JSON; instead it returns
     * a result map with rawBody and the HTTP statusCode so the caller can decide.
     */
    @isTest
    static void testTriggerSync_InvalidJsonBody() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(500, 'not valid json'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.triggerSync();
        Test.stopTest();

        System.assertEquals(500, result.get('statusCode'), 'Should propagate the 500 status');
        System.assertEquals('not valid json', result.get('rawBody'), 'Should expose raw body when JSON parse fails');
    }

    /**
     * Test triggerSync() - 403 Forbidden (OAuth not yet completed)
     */
    @isTest
    static void testTriggerSync_OAuthRequired() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(
            403,
            '{"detail":"OAuth connection required."}'
        ));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.triggerSync();
        Test.stopTest();

        System.assertEquals(403, result.get('statusCode'), 'Should return 403');

        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        System.assertEquals('OAuth Required', settings.Sync_Status__c, 'Sync status should be OAuth Required');
    }

    /**
     * Test triggerSync() - 404 Not Found (org not registered)
     */
    @isTest
    static void testTriggerSync_NotRegistered() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(
            404,
            '{"detail":"Organization not found."}'
        ));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.triggerSync();
        Test.stopTest();

        System.assertEquals(404, result.get('statusCode'), 'Should return 404');

        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        System.assertEquals('Not Registered', settings.Sync_Status__c, 'Sync status should be Not Registered');
    }

    /**
     * Test getSyncStatus() - Success
     */
    @isTest
    static void testGetSyncStatus_Success() {
        String mockResponse = '[{"id": "123", "status": "completed", "started_at": "2026-05-01T10:00:00Z"}]';
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(200, mockResponse));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.getSyncStatus();
        Test.stopTest();

        System.assertNotEquals(null, result, 'Should return sync status');
        System.assertEquals('123', result.get('id'), 'Should return job ID');
    }

    /**
     * Test getSyncStatus() - No jobs
     */
    @isTest
    static void testGetSyncStatus_NoJobs() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(200, '[]'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.getSyncStatus();
        Test.stopTest();

        System.assertEquals(0, result.size(), 'Should return empty map when no jobs');
    }

    /**
     * Test checkConnection() - Success
     */
    @isTest
    static void testCheckConnection_Success() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(200, '{"status": "ok"}'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.checkConnection();
        Test.stopTest();

        System.assertEquals(true, result.get('connected'), 'Should be connected');
        System.assertEquals(200, result.get('statusCode'), 'Should return 200');
        System.assertNotEquals(null, result.get('endpoint'), 'Should return endpoint');
        System.assertNotEquals(null, result.get('organizationId'), 'Should return org ID');
    }

    /**
     * Test checkConnection() - Failure
     */
    @isTest
    static void testCheckConnection_Failure() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(500, '{"error": "Server error"}'));

        Test.startTest();
        Map<String, Object> result = AccessGraphConnector.checkConnection();
        Test.stopTest();

        System.assertEquals(false, result.get('connected'), 'Should not be connected');
    }

    /**
     * Test initializeSettings()
     */
    @isTest
    static void testInitializeSettings() {
        // Delete existing settings
        delete [SELECT Id FROM AccessGraph_Settings__c];

        Test.startTest();
        AccessGraphConnector.initializeSettings();
        Test.stopTest();

        // Verify settings created
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
        System.assertNotEquals(null, settings, 'Settings should be created');
        System.assertEquals(UserInfo.getOrganizationId(), settings.Organization_ID__c, 'Org ID should be set');
        System.assertEquals(true, settings.Auto_Sync_Enabled__c, 'Auto sync should be enabled');
    }

    /**
     * Test initializeSettings() - Already exists
     */
    @isTest
    static void testInitializeSettings_AlreadyExists() {
        // Settings already exist from @testSetup
        Test.startTest();
        AccessGraphConnector.initializeSettings();
        Test.stopTest();

        // Should not create duplicate
        List<AccessGraph_Settings__c> settingsList = [SELECT Id FROM AccessGraph_Settings__c];
        System.assertEquals(1, settingsList.size(), 'Should only have one settings record');
    }

    /**
     * Test getOrganizationId()
     */
    @isTest
    static void testGetOrganizationId() {
        Test.startTest();
        String orgId = AccessGraphConnector.getOrganizationId();
        Test.stopTest();

        System.assertEquals(UserInfo.getOrganizationId(), orgId, 'Should return org ID from settings');
    }

    /**
     * Test getOrganizationId() - No settings
     */
    @isTest
    static void testGetOrganizationId_NoSettings() {
        // Delete settings
        delete [SELECT Id FROM AccessGraph_Settings__c];

        Test.startTest();
        String orgId = AccessGraphConnector.getOrganizationId();
        Test.stopTest();

        // Should fall back to UserInfo org ID
        System.assertEquals(UserInfo.getOrganizationId(), orgId, 'Should fall back to UserInfo org ID');
    }

    /**
     * Test getOrgSummary() - all backend calls succeed
     */
    @isTest
    static void testGetOrgSummary_Success() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphMultiRouteMock());

        Test.startTest();
        AccessGraphConnector.OrgSummary summary = AccessGraphConnector.getOrgSummary();
        Test.stopTest();

        System.assertEquals(true, summary.backendReachable, 'Backend should be reachable');
        System.assertEquals('completed', summary.lastSyncStatus, 'Should return completed status from sync-jobs');
        System.assertNotEquals(null, summary.lastSyncDate, 'Last sync date should be parsed');
        System.assertEquals(2, summary.anomalyCount, 'Should count 2 anomalies from mock');
        System.assertEquals(3, summary.recommendationCount, 'Should count 3 recommendations from mock');
        System.assert(String.isNotBlank(summary.dashboardUrl), 'Dashboard URL should be computed');
        System.assert(summary.dashboardUrl.contains('utm_source=salesforce_app'), 'Dashboard URL should include utm tracking');
        // Dashboard URL must point to the FRONTEND, not the backend API host
        System.assert(
            summary.dashboardUrl.contains('gentle-love-production-1eba.up.railway.app'),
            'Dashboard URL should point to the frontend host, not the backend. Got: ' + summary.dashboardUrl
        );
        System.assert(
            !summary.dashboardUrl.contains('accessgraph-ai-production.up.railway.app'),
            'Dashboard URL must NOT point to the backend API host. Got: ' + summary.dashboardUrl
        );
    }

    /**
     * Test getOrgSummary() - backend unreachable (all callouts fail)
     */
    @isTest
    static void testGetOrgSummary_BackendDown() {
        Test.setMock(HttpCalloutMock.class, new AccessGraphFailingMock());

        Test.startTest();
        AccessGraphConnector.OrgSummary summary = AccessGraphConnector.getOrgSummary();
        Test.stopTest();

        System.assertEquals(false, summary.backendReachable, 'Backend should not be reachable when all callouts fail');
        System.assertEquals(0, summary.anomalyCount, 'Anomaly count should default to 0');
        System.assertEquals(0, summary.recommendationCount, 'Recommendation count should default to 0');
        System.assert(String.isNotBlank(summary.dashboardUrl), 'Dashboard URL should still be computed (no callout needed)');
    }

    /**
     * Mock HTTP callout class
     */
    private class AccessGraphHttpMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;

        public AccessGraphHttpMock(Integer statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }

        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(this.statusCode);
            if (this.responseBody != null) {
                res.setBody(this.responseBody);
            }
            res.setHeader('Content-Type', 'application/json');
            return res;
        }
    }

    /**
     * Multi-route mock for getOrgSummary() - returns different responses per endpoint
     */
    private class AccessGraphMultiRouteMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(200);

            String url = req.getEndpoint();
            if (url.contains('/health')) {
                res.setBody('{"status":"ok","service":"accessgraph-backend"}');
            } else if (url.contains('/sync-jobs')) {
                res.setBody('[{"id":"job-1","status":"completed","started_at":"2026-05-02T08:06:02.467167Z","completed_at":"2026-05-02T08:07:16.425224Z"}]');
            } else if (url.contains('/anomalies')) {
                res.setBody('[{"id":"a1"},{"id":"a2"}]');
            } else if (url.contains('/recommendations')) {
                res.setBody('[{"id":"r1"},{"id":"r2"},{"id":"r3"}]');
            } else {
                res.setStatusCode(404);
                res.setBody('{}');
            }
            return res;
        }
    }

    /**
     * Failing mock - all routes return 500 to simulate backend down
     */
    private class AccessGraphFailingMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setBody('{"error":"backend down"}');
            res.setHeader('Content-Type', 'application/json');
            return res;
        }
    }
}
