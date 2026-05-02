# AccessGraph AI - Salesforce Package

This directory contains the Salesforce managed package for AccessGraph AI, enabling seamless integration with the AccessGraph AI platform.

## Package Contents

### Connected App
- **AccessGraph_AI.connectedApp**: OAuth configuration for secure Salesforce authentication
  - OAuth scopes: API, Web, RefreshToken
  - Callback URL: https://accessgraph-ai-production.up.railway.app/auth/salesforce/callback

### Custom Settings
- **AccessGraph_Settings__c**: Hierarchical custom setting for configuration
  - `API_Endpoint__c`: Base URL for AccessGraph AI API
  - `Organization_ID__c`: AccessGraph AI organization identifier
  - `Auto_Sync_Enabled__c`: Enable automatic daily sync
  - `Last_Sync_Date__c`: Timestamp of last successful sync
  - `Sync_Status__c`: Status of last sync operation

### Apex Classes
- **AccessGraphConnector**: Main connector class for API communication
  - `triggerSync()`: Trigger manual permission sync
  - `getSyncStatus()`: Get latest sync job status
  - `checkConnection()`: Verify API connectivity
  - `initializeSettings()`: Initialize default settings

- **AccessGraphPostInstall**: Post-installation handler
  - Auto-configures custom settings
  - Notifies backend about installation
  - Sends welcome email to installer

## Installation

### For Developers (Unlocked Package)

1. **Authenticate with Dev Hub:**
   ```bash
   sfdx auth:web:login --setdefaultdevhubusername --setalias DevHub
   ```

2. **Create Scratch Org (Optional - for testing):**
   ```bash
   sfdx force:org:create -f config/project-scratch-def.json -a AccessGraphScratch -s
   ```

3. **Deploy to Org:**
   ```bash
   sfdx force:source:deploy -p force-app -u YourOrgAlias
   ```

### For Customers (AppExchange)

1. **Install from AppExchange:**
   - Navigate to Salesforce AppExchange
   - Search for "AccessGraph AI"
   - Click "Get It Now" and follow installation wizard
   - Install for "Admins Only" or "All Users" (recommended: Admins Only)

2. **Post-Installation Setup:**
   - Custom settings are auto-configured by post-install script
   - Navigate to https://accessgraph-ai-production.up.railway.app
   - Click "Connect Salesforce" and authorize OAuth
   - Initial sync will be triggered automatically

## Package Configuration

### Remote Site Settings
Add the following Remote Site Settings (auto-added by package):
- **Name**: AccessGraph_AI_API
- **URL**: https://accessgraph-ai-production.up.railway.app
- **Active**: ✓ Checked

### Named Credentials (Optional)
For enhanced security, configure Named Credentials instead of storing API endpoint in custom settings.

## Usage

### Trigger Manual Sync
```apex
// From Developer Console or Anonymous Apex
Map<String, Object> result = AccessGraphConnector.triggerSync();
System.debug('Sync Result: ' + result);
```

### Check Sync Status
```apex
Map<String, Object> status = AccessGraphConnector.getSyncStatus();
System.debug('Latest Sync: ' + status);
```

### Verify Connection
```apex
Map<String, Object> connection = AccessGraphConnector.checkConnection();
System.debug('Connected: ' + connection.get('connected'));
```

### Access from Lightning Component (Future)
```javascript
// LWC example (if setup component is added)
import { LightningElement, wire } from 'lwc';
import triggerSync from '@salesforce/apex/AccessGraphConnector.triggerSync';

export default class AccessGraphSetup extends LightningElement {
    handleSync() {
        triggerSync()
            .then(result => {
                console.log('Sync triggered:', result);
            })
            .catch(error => {
                console.error('Sync failed:', error);
            });
    }
}
```

## Security Review Requirements

### Completed:
- [x] AES-256 encryption for OAuth tokens
- [x] TLS 1.3 for all API communication
- [x] Comprehensive audit logging
- [x] RBAC for dashboard users
- [x] GDPR compliance (Article 17 - Right to Erasure)
- [x] Data retention policies
- [x] Security headers (HSTS, CSP, etc.)
- [x] Privacy policy and terms of service
- [x] Data Processing Agreement

### Salesforce-Specific:
- [x] Connected App with appropriate OAuth scopes
- [x] No hardcoded credentials
- [x] Proper error handling in Apex
- [x] Governor limit compliance
- [x] Post-install script for auto-configuration
- [ ] Test coverage ≥75% (TODO: Add Apex tests)
- [ ] Remote Site Settings documentation
- [ ] Installation guide for customers

## Testing

### Unit Tests (TODO)
Create test classes:
- `AccessGraphConnector_Test.cls`
- `AccessGraphPostInstall_Test.cls`

### Integration Tests
1. Install package in sandbox org
2. Verify custom settings initialization
3. Test OAuth flow
4. Trigger manual sync
5. Verify API connectivity

## AppExchange Listing

### Required Assets:
- [ ] Logo (200x200px PNG)
- [ ] Screenshots (5-10 images, 1280x800px)
- [ ] Demo video (YouTube/Vimeo, 2-3 minutes)
- [ ] Feature list (5-7 key features)
- [ ] Customer testimonials (3-5)
- [ ] Support email: support@accessgraph.ai
- [ ] Documentation URL: https://accessgraph-ai-production.up.railway.app/docs

### Listing Categories:
- Security
- Administration
- Analytics

### Pricing Model:
- Free trial: 30 days
- Starter: $99/month (up to 100 users)
- Professional: $299/month (up to 500 users)
- Enterprise: Custom pricing (500+ users)

## Support

- **Email**: support@accessgraph.ai
- **Documentation**: https://accessgraph-ai-production.up.railway.app/docs
- **Security Issues**: security@accessgraph.ai
- **Privacy Questions**: privacy@accessgraph.ai

## License

Copyright © 2026 AccessGraph AI, Inc. All rights reserved.

This package is proprietary software distributed via Salesforce AppExchange.
See Terms of Service: https://accessgraph-ai-production.up.railway.app/legal/terms
