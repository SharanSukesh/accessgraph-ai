/**
 * AccessGraph AI Post-Install Handler
 * Runs after package installation to auto-configure settings,
 * notify the installer (bell-icon notification + email), and grant
 * the AccessGraph_Admin permission set.
 */
global class AccessGraphPostInstall implements InstallHandler {

    global void onInstall(InstallContext context) {
        // Extract primitive values from InstallContext early so individual failures
        // below don't prevent later steps from running.
        Id installerId;
        Boolean isUpgrade = false;
        String previousVersion = null;

        try {
            isUpgrade = context.isUpgrade();
            previousVersion = context.previousVersion()?.toString();
            installerId = context.installerID();
        } catch (Exception e) {
            System.debug('Could not extract install context: ' + e.getMessage());
        }

        // Each step is independently fault-tolerant so a failure in one
        // doesn't prevent the others from completing.
        try {
            AccessGraphConnector.initializeSettings();
        } catch (Exception e) {
            System.debug('Failed to initialize settings: ' + e.getMessage());
        }

        if (installerId != null) {
            try {
                assignAdminPermissionSet(installerId);
            } catch (Exception e) {
                System.debug('Failed to assign PermissionSet: ' + e.getMessage());
            }

            try {
                notifyInstaller(installerId);
            } catch (Exception e) {
                System.debug('Failed to notify installer: ' + e.getMessage());
            }
        }

        // Async backend notification (best-effort, runs after install completes)
        try {
            notifyInstallation(isUpgrade, previousVersion, installerId);
        } catch (Exception e) {
            System.debug('Failed to schedule backend notification: ' + e.getMessage());
        }
    }

    /**
     * Notify AccessGraph AI backend about new installation
     * Uses primitive parameters since @future methods don't support InstallContext
     */
    @future(callout=true)
    private static void notifyInstallation(Boolean isUpgrade, String previousVersion, Id installerId) {
        try {
            String orgId = UserInfo.getOrganizationId();
            String orgName = UserInfo.getOrganizationName();

            String endpoint = 'https://accessgraph-ai-production.up.railway.app/package/install';

            String installerEmail = '';
            try {
                installerEmail = [SELECT Email FROM User WHERE Id = :installerId LIMIT 1].Email;
            } catch (Exception e) {
                System.debug('Could not fetch installer email: ' + e.getMessage());
            }

            Map<String, Object> payload = new Map<String, Object>{
                'organizationId' => orgId,
                'organizationName' => orgName,
                'installationType' => isUpgrade ? 'upgrade' : 'new',
                'previousVersion' => previousVersion,
                'installDate' => DateTime.now().format('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
                'installerEmail' => installerEmail
            };

            HttpRequest req = new HttpRequest();
            req.setEndpoint(endpoint);
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setBody(JSON.serialize(payload));
            req.setTimeout(30000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            System.debug('Installation notification response: ' + res.getStatusCode());

        } catch (Exception e) {
            System.debug('Failed to notify installation: ' + e.getMessage());
        }
    }

    /**
     * Notify the installer that AccessGraph AI is ready.
     * Sends both an in-app bell-icon notification (works in scratch orgs without
     * email deliverability config) and a welcome email (best-effort).
     */
    private static void notifyInstaller(Id installerUserId) {
        // Step 1: Bell-icon CustomNotification - reliable, works without email config
        try {
            CustomNotificationType welcomeType = [
                SELECT Id FROM CustomNotificationType
                WHERE DeveloperName = 'AccessGraph_Welcome'
                LIMIT 1
            ];

            Messaging.CustomNotification notif = new Messaging.CustomNotification();
            notif.setNotificationTypeId(welcomeType.Id);
            notif.setTitle('Welcome to AccessGraph AI');
            notif.setBody('Click to open the AccessGraph AI tab and complete setup.');
            notif.setTargetPageRef('{"type":"standard__app","attributes":{"appTarget":"AccessGraph_AI"}}');
            notif.send(new Set<String>{ String.valueOf(installerUserId) });

            System.debug('Bell-icon notification sent to installer: ' + installerUserId);
        } catch (Exception e) {
            System.debug('Failed to send bell-icon notification: ' + e.getMessage());
        }

        // Step 2: Welcome email - best-effort, may fail in scratch orgs
        try {
            User installer = [SELECT Email, Name FROM User WHERE Id = :installerUserId LIMIT 1];

            if (installer == null || String.isBlank(installer.Email)) {
                System.debug('Skipping welcome email: installer email not available');
                return;
            }

            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            email.setToAddresses(new String[]{ installer.Email });
            email.setSubject('Welcome to AccessGraph AI');
            email.setSenderDisplayName('AccessGraph AI');
            email.setSaveAsActivity(false);
            email.setHtmlBody(
                '<h2>Welcome to AccessGraph AI</h2>' +
                '<p>Thank you for installing AccessGraph AI, your enterprise access intelligence platform.</p>' +
                '<h3>Next Steps:</h3>' +
                '<ol>' +
                '<li><b>Open the AccessGraph AI tab</b> in your App Launcher to see status and trigger syncs.</li>' +
                '<li><b>Complete OAuth Setup:</b> Visit <a href="https://accessgraph-ai-production.up.railway.app">accessgraph-ai-production.up.railway.app</a> and connect your Salesforce org.</li>' +
                '<li><b>Run Initial Sync:</b> From the AccessGraph AI tab in Salesforce, click "Sync Now" to import your permissions.</li>' +
                '<li><b>Review Dashboard:</b> Explore your access graph, anomalies, and recommendations on the web dashboard.</li>' +
                '</ol>' +
                '<h3>Resources:</h3>' +
                '<ul>' +
                '<li><a href="https://accessgraph-ai-production.up.railway.app/legal/privacy">Privacy Policy</a></li>' +
                '<li><a href="https://accessgraph-ai-production.up.railway.app/legal/security">Security Practices</a></li>' +
                '<li><a href="mailto:support@accessgraph.ai">Contact Support</a></li>' +
                '</ul>' +
                '<p>Questions? Email us at <a href="mailto:support@accessgraph.ai">support@accessgraph.ai</a></p>' +
                '<p>Best regards,<br>The AccessGraph AI Team</p>'
            );

            Messaging.SendEmailResult[] results = Messaging.sendEmail(
                new Messaging.SingleEmailMessage[]{ email },
                false   // allOrNothing=false: don't fail entire install on email error
            );

            if (results != null && results.size() > 0 && results[0].isSuccess()) {
                System.debug('Welcome email sent successfully to ' + installer.Email);
            } else if (results != null && results.size() > 0) {
                System.debug('Welcome email failed: ' + JSON.serialize(results[0].getErrors()));
            }

        } catch (Exception e) {
            System.debug('Failed to send welcome email: ' + e.getMessage());
        }
    }

    /**
     * Auto-assign the AccessGraph_Admin permission set to the installer.
     * Uses @future to run in a separate transaction, avoiding Mixed DML errors
     * since this method may be called after DML on non-setup objects
     * (like the AccessGraph_Settings__c custom hierarchy setting).
     */
    @future
    public static void assignAdminPermissionSet(Id installerUserId) {
        try {
            PermissionSet ps = [
                SELECT Id FROM PermissionSet
                WHERE Name = 'AccessGraph_Admin'
                LIMIT 1
            ];

            // Skip if already assigned (e.g., upgrade scenario)
            List<PermissionSetAssignment> existing = [
                SELECT Id FROM PermissionSetAssignment
                WHERE PermissionSetId = :ps.Id AND AssigneeId = :installerUserId
                LIMIT 1
            ];
            if (!existing.isEmpty()) {
                System.debug('AccessGraph_Admin already assigned to installer');
                return;
            }

            insert new PermissionSetAssignment(
                PermissionSetId = ps.Id,
                AssigneeId = installerUserId
            );
            System.debug('AccessGraph_Admin permission set assigned to installer');

        } catch (Exception e) {
            System.debug('Failed to assign AccessGraph_Admin permission set: ' + e.getMessage());
        }
    }
}
