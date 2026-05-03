// Test HTTP callouts only (no DML)
System.debug('===== HTTP Callout Test =====');

// Test 1: Health check
System.debug('1. Testing /health endpoint...');
try {
    HttpRequest req = new HttpRequest();
    req.setEndpoint('https://accessgraph-ai-production.up.railway.app/health');
    req.setMethod('GET');
    req.setTimeout(10000);

    Http http = new Http();
    HttpResponse res = http.send(req);
    System.debug('Health status: ' + res.getStatusCode());
    System.debug('Health body: ' + res.getBody());
} catch (Exception e) {
    System.debug('Health error: ' + e.getMessage());
}

// Test 2: Trigger sync via Apex Connector class
System.debug('2. Testing AccessGraphConnector.checkConnection()...');
try {
    Map<String, Object> connStatus = AccessGraphConnector.checkConnection();
    System.debug('Connection status: ' + JSON.serialize(connStatus));
} catch (Exception e) {
    System.debug('Connector error: ' + e.getMessage());
}

// Test 3: Get sync status via Connector
System.debug('3. Testing AccessGraphConnector.getSyncStatus()...');
try {
    Map<String, Object> syncStatus = AccessGraphConnector.getSyncStatus();
    System.debug('Sync status keys: ' + syncStatus.keySet());
    if (syncStatus.containsKey('id')) {
        System.debug('Latest sync job ID: ' + syncStatus.get('id'));
        System.debug('Latest sync status: ' + syncStatus.get('status'));
        System.debug('Started at: ' + syncStatus.get('started_at'));
    }
} catch (Exception e) {
    System.debug('Sync status error: ' + e.getMessage());
}

// Test 4: Trigger sync
System.debug('4. Testing AccessGraphConnector.triggerSync()...');
try {
    Map<String, Object> syncResult = AccessGraphConnector.triggerSync();
    System.debug('Sync trigger result: ' + JSON.serialize(syncResult));
    System.debug('Sync trigger status code: ' + syncResult.get('statusCode'));
} catch (Exception e) {
    System.debug('Trigger sync error: ' + e.getMessage());
}

System.debug('===== Test Complete =====');
