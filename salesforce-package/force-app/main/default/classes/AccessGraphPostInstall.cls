/**
 * AccessGraph AI Post-Install Handler
 * Runs after package installation to auto-configure settings
 */
global class AccessGraphPostInstall implements InstallHandler {

    global void onInstall(InstallContext context) {
        try {
            // Initialize custom settings
            AccessGraphConnector.initializeSettings();

            // Extract primitive values from InstallContext for @future method
            Boolean isUpgrade = context.isUpgrade();
            String previousVersion = context.previousVersion()?.toString();
            Id installerId = context.installerID();

            // Notify backend about new installation (primitive params for @future)
            notifyInstallation(isUpgrade, previousVersion, installerId);

            // Send welcome email to installer
            sendWelcomeEmail(installerId);

        } catch (Exception e) {
            System.debug('Post-install error: ' + e.getMessage());
            // Don't fail installation - admin can configure manually
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
     * Send welcome email to package installer
     */
    private static void sendWelcomeEmail(Id installerUserId) {
        try {
            User installer = [SELECT Email, Name FROM User WHERE Id = :installerUserId];

            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            email.setToAddresses(new String[]{ installer.Email });
            email.setSubject('Welcome to AccessGraph AI!');
            email.setHtmlBody(
                '<h2>Welcome to AccessGraph AI!</h2>' +
                '<p>Thank you for installing AccessGraph AI, your enterprise access intelligence platform.</p>' +
                '<h3>Next Steps:</h3>' +
                '<ol>' +
                '<li><b>Complete OAuth Setup:</b> Visit <a href="https://accessgraph-ai-production.up.railway.app">accessgraph-ai-production.up.railway.app</a> and connect your Salesforce org</li>' +
                '<li><b>Run Initial Sync:</b> Trigger your first permission sync from the AccessGraph AI tab</li>' +
                '<li><b>Review Dashboard:</b> Explore your access graph, anomalies, and recommendations</li>' +
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

            Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ email });

        } catch (Exception e) {
            System.debug('Failed to send welcome email: ' + e.getMessage());
        }
    }
}
