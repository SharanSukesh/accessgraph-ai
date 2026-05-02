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
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getInstance();
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
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getInstance();
        System.assertEquals('Failed', settings.Sync_Status__c, 'Sync status should be Failed');
    }

    /**
     * Test triggerSync() - Exception handling
     */
    @isTest
    static void testTriggerSync_Exception() {
        // No mock setup - will cause exception
        Test.setMock(HttpCalloutMock.class, new AccessGraphHttpMock(0, null));

        Test.startTest();
        try {
            AccessGraphConnector.triggerSync();
            System.assert(false, 'Should have thrown exception');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Failed to trigger sync'), 'Should contain error message');
        }
        Test.stopTest();
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
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getInstance();
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
}
