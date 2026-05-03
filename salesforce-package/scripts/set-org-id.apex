// Set the AccessGraph organization ID so getOrgSummary returns real data
AccessGraph_Settings__c settings = AccessGraph_Settings__c.getOrgDefaults();
if (settings == null || settings.Id == null) {
    settings = new AccessGraph_Settings__c();
    settings.SetupOwnerId = UserInfo.getOrganizationId();
    settings.API_Endpoint__c = 'https://accessgraph-ai-production.up.railway.app';
    settings.Auto_Sync_Enabled__c = true;
}
settings.Organization_ID__c = 'e21a9d47-1931-4ffb-8202-c979bf35aa3d';
upsert settings;
System.debug('Set Organization_ID to: ' + settings.Organization_ID__c);
