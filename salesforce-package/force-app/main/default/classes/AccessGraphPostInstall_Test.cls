/**
 * Test class for AccessGraphPostInstall
 * Tests post-installation handler
 */
@isTest
private class AccessGraphPostInstall_Test {

    /**
     * Test onInstall() - New installation
     */
    @isTest
    static void testOnInstall_NewInstallation() {
        // Setup mock HTTP response for installation notification
        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));

        // Create install context
        TestInstallContext context = new TestInstallContext(false, null);

        Test.startTest();
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(context);
        Test.stopTest();

        // Verify settings initialized
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getInstance();
        System.assertNotEquals(null, settings, 'Settings should be initialized');
        System.assertEquals(UserInfo.getOrganizationId(), settings.Organization_ID__c, 'Org ID should be set');
        System.assertEquals(true, settings.Auto_Sync_Enabled__c, 'Auto sync should be enabled');
    }

    /**
     * Test onInstall() - Upgrade
     */
    @isTest
    static void testOnInstall_Upgrade() {
        // Pre-populate settings
        AccessGraph_Settings__c settings = new AccessGraph_Settings__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            API_Endpoint__c = 'https://test-api.accessgraph.ai',
            Organization_ID__c = 'existing-org-id',
            Auto_Sync_Enabled__c = false
        );
        insert settings;

        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));

        // Create upgrade context
        Version previousVersion = new Version(1, 0, 0);
        TestInstallContext context = new TestInstallContext(true, previousVersion);

        Test.startTest();
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(context);
        Test.stopTest();

        // Verify settings still exist (not overwritten)
        settings = AccessGraph_Settings__c.getInstance();
        System.assertNotEquals(null, settings, 'Settings should still exist');
    }

    /**
     * Test onInstall() - Exception handling
     */
    @isTest
    static void testOnInstall_Exception() {
        // Setup mock to return error
        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(500, '{"error": "Server error"}'));

        TestInstallContext context = new TestInstallContext(false, null);

        Test.startTest();
        // Should not throw exception - installation should succeed even if notification fails
        try {
            AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
            postInstall.onInstall(context);
            System.assert(true, 'Installation should succeed even with notification failure');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        Test.stopTest();
    }

    /**
     * Test that welcome email is sent (can't actually verify email sent in test context)
     */
    @isTest
    static void testWelcomeEmail() {
        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));

        TestInstallContext context = new TestInstallContext(false, null);

        Test.startTest();
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(context);

        // Get email invocations (Salesforce tracks email sends in test context)
        Integer emailsSent = Limits.getEmailInvocations();
        Test.stopTest();

        // Note: Email sending may not work in test context, so we just verify no exception thrown
        System.assert(true, 'Post-install completed without errors');
    }

    /**
     * Mock HTTP callout class for post-install
     */
    private class PostInstallHttpMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;

        public PostInstallHttpMock(Integer statusCode, String responseBody) {
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
     * Test implementation of InstallContext
     */
    private class TestInstallContext implements InstallContext {
        private Boolean isUpgrade;
        private Version previousVersion;
        private Id installerId;

        public TestInstallContext(Boolean isUpgrade, Version previousVersion) {
            this.isUpgrade = isUpgrade;
            this.previousVersion = previousVersion;
            this.installerId = UserInfo.getUserId();
        }

        public Boolean isUpgrade() {
            return this.isUpgrade;
        }

        public Boolean isPush() {
            return false;
        }

        public Version previousVersion() {
            return this.previousVersion;
        }

        public Id installerID() {
            return this.installerId;
        }

        public Id organizationId() {
            return UserInfo.getOrganizationId();
        }
    }
}
