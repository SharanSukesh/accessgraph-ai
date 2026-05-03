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
        AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
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
        settings = AccessGraph_Settings__c.getOrgDefaults();
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
     * Test that welcome email is sent (Salesforce tracks email invocations in test context).
     * The post-install handler attempts to send email even if Apex test context blocks
     * actual delivery - we verify the invocation count to confirm the code path executes.
     */
    @isTest
    static void testWelcomeEmail() {
        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));

        TestInstallContext context = new TestInstallContext(false, null);

        Test.startTest();
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(context);
        Integer emailsSent = Limits.getEmailInvocations();
        Test.stopTest();

        // Assert that at least one email invocation occurred during the post-install
        System.assert(
            emailsSent >= 1,
            'Expected at least one email invocation in post-install, got: ' + emailsSent
        );
    }

    /**
     * Test that installer is auto-assigned the AccessGraph_Admin permission set.
     * Note: requires the PermissionSet to be deployed to the test org. Skipped via
     * try/catch if PS not present (e.g., during initial bootstrap deploys).
     */
    @isTest
    static void testPermissionSetAssignment() {
        // Skip cleanly if permission set not deployed yet (bootstrap protection)
        List<PermissionSet> psList = [
            SELECT Id FROM PermissionSet WHERE Name = 'AccessGraph_Admin' LIMIT 1
        ];
        if (psList.isEmpty()) {
            System.debug('Skipping testPermissionSetAssignment: PS not yet deployed');
            return;
        }

        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));
        TestInstallContext context = new TestInstallContext(false, null);

        Test.startTest();
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(context);
        Test.stopTest();

        // Verify the installer (current test user) was assigned the PS
        Id installerId = UserInfo.getUserId();
        Integer assignmentCount = [
            SELECT COUNT()
            FROM PermissionSetAssignment
            WHERE PermissionSetId = :psList[0].Id AND AssigneeId = :installerId
        ];
        System.assertEquals(
            1, assignmentCount,
            'Expected installer to have AccessGraph_Admin assigned exactly once'
        );
    }

    /**
     * Test that re-running onInstall on an upgrade does NOT create a duplicate
     * PermissionSetAssignment. Idempotency is required because customers may upgrade
     * the package multiple times.
     */
    @isTest
    static void testPermissionSetAssignment_Idempotent() {
        List<PermissionSet> psList = [
            SELECT Id FROM PermissionSet WHERE Name = 'AccessGraph_Admin' LIMIT 1
        ];
        if (psList.isEmpty()) {
            System.debug('Skipping testPermissionSetAssignment_Idempotent: PS not yet deployed');
            return;
        }

        Test.setMock(HttpCalloutMock.class, new PostInstallHttpMock(200, '{"success": true}'));

        Test.startTest();
        // Run install twice (simulating upgrade)
        AccessGraphPostInstall postInstall = new AccessGraphPostInstall();
        postInstall.onInstall(new TestInstallContext(false, null));
        postInstall.onInstall(new TestInstallContext(true, new Version(1, 0, 0)));
        Test.stopTest();

        Id installerId = UserInfo.getUserId();
        Integer assignmentCount = [
            SELECT COUNT()
            FROM PermissionSetAssignment
            WHERE PermissionSetId = :psList[0].Id AND AssigneeId = :installerId
        ];
        System.assertEquals(
            1, assignmentCount,
            'Re-running onInstall must not create duplicate PermissionSetAssignments'
        );
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
