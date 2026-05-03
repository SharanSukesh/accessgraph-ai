// Verify post-install handler ran correctly
System.debug('===== Post-Install Verification =====');

// 1. Custom Settings populated?
AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
if (settings == null || settings.Id == null) {
    System.debug('FAIL: AccessGraph_Settings__c was NOT initialized');
} else {
    System.debug('PASS: AccessGraph_Settings__c initialized');
    System.debug('  API_Endpoint: ' + settings.API_Endpoint__c);
    System.debug('  Organization_ID: ' + settings.Organization_ID__c);
    System.debug('  Auto_Sync_Enabled: ' + settings.Auto_Sync_Enabled__c);
}

// 2. Permission Set exists?
List<PermissionSet> psList = [SELECT Id, Name FROM PermissionSet WHERE Name = 'AccessGraph_Admin' LIMIT 1];
if (psList.isEmpty()) {
    System.debug('FAIL: AccessGraph_Admin PermissionSet not found');
} else {
    System.debug('PASS: AccessGraph_Admin PermissionSet exists (Id: ' + psList[0].Id + ')');
}

// 3. PS Assignment to current user?
Id currentUser = UserInfo.getUserId();
if (!psList.isEmpty()) {
    Integer assigned = [SELECT COUNT() FROM PermissionSetAssignment
                        WHERE PermissionSetId = :psList[0].Id AND AssigneeId = :currentUser];
    if (assigned > 0) {
        System.debug('PASS: User auto-assigned AccessGraph_Admin PS (count: ' + assigned + ')');
    } else {
        System.debug('FAIL: User NOT auto-assigned AccessGraph_Admin PS');
        System.debug('  This is expected for fresh install if @future not yet executed');
    }
}

// 4. CustomNotificationType deployed?
List<CustomNotificationType> notifTypes = [SELECT Id, DeveloperName FROM CustomNotificationType WHERE DeveloperName = 'AccessGraph_Welcome' LIMIT 1];
if (notifTypes.isEmpty()) {
    System.debug('FAIL: AccessGraph_Welcome CustomNotificationType not found');
} else {
    System.debug('PASS: AccessGraph_Welcome CustomNotificationType exists');
}

// 5. Lightning App exists?
List<AppDefinition> apps = [SELECT Id, DurableId, DeveloperName, Label FROM AppDefinition WHERE DeveloperName = 'AccessGraph_AI' LIMIT 1];
if (apps.isEmpty()) {
    System.debug('FAIL: AccessGraph_AI Lightning App not found');
} else {
    System.debug('PASS: AccessGraph_AI Lightning App exists: ' + apps[0].Label);
}

System.debug('===== Verification Complete =====');
