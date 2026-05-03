// Test the AccessGraph AI package
System.debug('===== AccessGraph AI Package Test =====');

// Step 1: Initialize settings
System.debug('1. Initializing settings...');
AccessGraphConnector.initializeSettings();

// Step 2: Verify settings were created
AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
System.debug('Settings ID: ' + settings.Id);
System.debug('API Endpoint: ' + settings.API_Endpoint__c);
System.debug('Organization ID: ' + settings.Organization_ID__c);
System.debug('Auto Sync: ' + settings.Auto_Sync_Enabled__c);

// Step 3: Update Organization ID to use the real AccessGraph org ID
settings.Organization_ID__c = 'e21a9d47-1931-4ffb-8202-c979bf35aa3d';
upsert settings;
System.debug('2. Updated Organization ID to: ' + settings.Organization_ID__c);

// Step 4: Test getOrganizationId
System.debug('3. Testing getOrganizationId()...');
String orgId = AccessGraphConnector.getOrganizationId();
System.debug('Returned Org ID: ' + orgId);

// Step 5: Test checkConnection (wrap to suppress AuraHandledException)
System.debug('4. Testing checkConnection()...');
try {
    Map<String, Object> connStatus = AccessGraphConnector.checkConnection();
    System.debug('Connection status: ' + JSON.serialize(connStatus));
} catch (Exception e) {
    System.debug('Connection check error: ' + e.getMessage());
}

// Step 6: Test direct HTTP callout to verify connectivity
System.debug('5. Direct HTTP test to Railway backend...');
try {
    HttpRequest req = new HttpRequest();
    req.setEndpoint('https://accessgraph-ai-production.up.railway.app/health');
    req.setMethod('GET');
    req.setTimeout(10000);

    Http http = new Http();
    HttpResponse res = http.send(req);
    System.debug('Health check status code: ' + res.getStatusCode());
    System.debug('Health check body: ' + res.getBody());
} catch (Exception e) {
    System.debug('HTTP error: ' + e.getMessage());
}

// Step 7: Test direct sync call
System.debug('6. Direct HTTP test - trigger sync...');
try {
    HttpRequest req = new HttpRequest();
    req.setEndpoint('https://accessgraph-ai-production.up.railway.app/orgs/e21a9d47-1931-4ffb-8202-c979bf35aa3d/sync');
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setTimeout(120000);

    Http http = new Http();
    HttpResponse res = http.send(req);
    System.debug('Sync trigger status code: ' + res.getStatusCode());
    System.debug('Sync trigger body length: ' + res.getBody().length());
    System.debug('Sync trigger body preview: ' + res.getBody().substring(0, Math.min(500, res.getBody().length())));
} catch (Exception e) {
    System.debug('Sync HTTP error: ' + e.getMessage());
}

System.debug('===== Test Complete =====');
