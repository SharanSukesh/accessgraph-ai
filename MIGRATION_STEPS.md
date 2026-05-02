# OAuth Token Encryption Migration

## Problem
During Phase 2 development, we added field-level encryption for OAuth tokens. However, existing tokens in the database were stored as plain text before encryption was enabled. When the code tries to read these plain-text tokens with encryption enabled, it fails to decrypt them and returns NULL.

## Solution
Migrate existing plain-text tokens to encrypted format.

## Steps

### Option 1: Temporary Workaround (CURRENT STATE)
✅ **DONE** - Currently using this approach
- Set `ENABLE_FIELD_ENCRYPTION=false` in Railway
- Tokens are stored and read as plain text
- Sync works, but tokens are not encrypted

### Option 2: Proper Migration (RECOMMENDED)

#### Step 1: Ensure encryption is currently DISABLED
```bash
# In Railway, verify:
ENABLE_FIELD_ENCRYPTION=false
```

#### Step 2: Run migration script on Railway

**Option A: Using Railway CLI**
```bash
# Install Railway CLI if not already installed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run the migration script
railway run python apps/backend/migrate_encrypt_tokens.py
```

**Option B: Temporary deployment approach**
1. Add the migration script to your repository
2. Create a temporary Railway service or use one-off command
3. Run: `python apps/backend/migrate_encrypt_tokens.py`

#### Step 3: Enable encryption
```bash
# In Railway environment variables, set:
ENABLE_FIELD_ENCRYPTION=true
```

#### Step 4: Redeploy
- Trigger a new deployment in Railway
- Wait for deployment to complete

#### Step 5: Test
- Go to your dashboard
- Click "Sync" button
- Verify sync completes successfully
- Check sync job status: `GET /orgs/{org_id}/sync-jobs`

## Verification

After migration, verify tokens are encrypted:
```sql
-- Tokens should look like encrypted gibberish, not plain text
SELECT id,
       LEFT(access_token, 50) as encrypted_access_token,
       LEFT(refresh_token, 50) as encrypted_refresh_token
FROM salesforce_connections;
```

## Rollback Plan

If something goes wrong:
1. Set `ENABLE_FIELD_ENCRYPTION=false` in Railway
2. Redeploy
3. Re-authenticate with Salesforce to get fresh plain-text tokens
4. Sync should work again

## Security Note

With encryption DISABLED (current state):
- ⚠️ OAuth tokens are stored in plain text in the database
- ⚠️ Anyone with database access can see the tokens
- ⚠️ This is acceptable for development, but NOT recommended for production

With encryption ENABLED (recommended):
- ✅ OAuth tokens are encrypted with AES-256
- ✅ Requires DATABASE_ENCRYPTION_KEY to decrypt
- ✅ AppExchange Security Review requirement met
