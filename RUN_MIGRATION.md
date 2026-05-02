# Running the OAuth Token Encryption Migration

## Current Status
- ✅ Migration script created: `apps/backend/migrate_encrypt_tokens.py`
- ✅ Documentation created: `MIGRATION_STEPS.md`
- ✅ Files committed and pushed to GitHub
- ⚠️ ENABLE_FIELD_ENCRYPTION is currently set to `false` in Railway
- ⚠️ OAuth tokens are stored as plain text (working state)

## Next Step: Run Migration on Railway

You have **3 options** to run the migration script:

---

## Option 1: Railway CLI (Recommended)

### Step 1: Login to Railway
```bash
railway login
```
This will open a browser window to authenticate with Railway.

### Step 2: Link to Your Project
```bash
cd c:\Users\shara\SalesforceAccess
railway link
```
Select your AccessGraph AI project from the list.

### Step 3: Run Migration
```bash
railway run python apps/backend/migrate_encrypt_tokens.py
```

This command:
- Connects to your Railway PostgreSQL database
- Reads existing plain-text tokens
- Re-saves them in encrypted format
- Shows progress in the console

---

## Option 2: Railway Dashboard (One-off Command)

### Step 1: Open Railway Dashboard
Go to: https://railway.app/dashboard

### Step 2: Select Your Project
Navigate to: AccessGraph AI → Backend Service

### Step 3: Open Settings Tab
Click on "Settings" in the left sidebar

### Step 4: Run One-off Command
Scroll down to "Deploy" section and find "Run Command"

Enter:
```bash
python apps/backend/migrate_encrypt_tokens.py
```

Click "Run" and monitor the logs.

---

## Option 3: API Endpoint (Easiest - Recommended!)

I've created a temporary API endpoint that runs the migration. This is the **EASIEST** option!

### Step 1: Enable Encryption in Railway
Go to Railway Dashboard → Backend Service → Variables:
```
ENABLE_FIELD_ENCRYPTION=true
```

**Important:** Set this to `true` BEFORE calling the migration endpoint. The endpoint needs encryption enabled to work.

### Step 2: Wait for Deployment
Wait for Railway to redeploy with the new environment variable (takes ~2 minutes).

### Step 3: Call the Migration Endpoint
Use any of these methods:

**Using Browser:**
```
https://accessgraph-ai-production.up.railway.app/orgs/YOUR_ORG_ID/privacy/migrate-encrypt-tokens?confirm=MIGRATE_TOKENS
```

**Using curl:**
```bash
curl -X POST "https://accessgraph-ai-production.up.railway.app/orgs/YOUR_ORG_ID/privacy/migrate-encrypt-tokens?confirm=MIGRATE_TOKENS"
```

**Using PowerShell:**
```powershell
Invoke-WebRequest -Method POST -Uri "https://accessgraph-ai-production.up.railway.app/orgs/YOUR_ORG_ID/privacy/migrate-encrypt-tokens?confirm=MIGRATE_TOKENS"
```

Replace `YOUR_ORG_ID` with your actual organization ID (the UUID from your dashboard URL).

### Step 4: Check Response
You should see:
```json
{
  "status": "success",
  "message": "Successfully migrated 1 connection(s)",
  "migrated_count": 1,
  "next_steps": [
    "Verify ENABLE_FIELD_ENCRYPTION=true in environment",
    "Test Salesforce sync to ensure it works",
    "Tokens are now encrypted with AES-256"
  ]
}
```

### Step 5: Test Sync
Go to your dashboard and click "Sync" to verify everything works!

---

## After Migration is Complete

### Step 1: Enable Encryption
In Railway Dashboard → Backend Service → Variables:
```
ENABLE_FIELD_ENCRYPTION=true
```

### Step 2: Redeploy Backend
Railway will automatically redeploy when you change environment variables.

### Step 3: Test Sync
1. Go to your dashboard: https://accessgraph-ai-production.up.railway.app
2. Navigate to your organization
3. Click "Sync" button
4. Verify sync completes successfully

### Step 4: Verify Encryption
Check Railway logs for successful sync. The tokens should now be encrypted in the database.

---

## Expected Output from Migration Script

When you run the migration, you should see:
```
============================================================
OAuth Token Encryption Migration
============================================================

Connecting to database...
DATABASE_URL: postgresql://postgres:***
ENABLE_FIELD_ENCRYPTION: True
DATABASE_ENCRYPTION_KEY set: True

Found 1 connection(s) with tokens.

Processing connection <id> (org: <org-id>)...
  ✓ Access token will be encrypted (length: 112)
  ✓ Refresh token will be encrypted (length: 64)

Committing changes for 1 connection(s)...

✅ Migration completed successfully!

Next steps:
1. Verify ENABLE_FIELD_ENCRYPTION=true in Railway environment variables
2. Redeploy the backend service
3. Test that sync still works
```

---

## Troubleshooting

### If migration fails with "No connections found with tokens"
This means tokens were not saved. You'll need to:
1. Ensure ENABLE_FIELD_ENCRYPTION=false
2. Re-authenticate with Salesforce to save fresh tokens
3. Run migration again

### If migration fails with "DATABASE_ENCRYPTION_KEY not set"
The encryption key is missing. Check Railway environment variables.

### If sync fails after enabling encryption
1. Check Railway logs for errors
2. Verify ENABLE_FIELD_ENCRYPTION=true
3. Verify DATABASE_ENCRYPTION_KEY is set
4. If all else fails, use rollback plan in MIGRATION_STEPS.md

---

## Which Option Should You Use?

**🎯 EASIEST: Option 3 (API Endpoint)** - Just enable encryption, wait for deploy, and call a URL. **Start here!**

**Alternative: Option 1 (Railway CLI)** - If you're comfortable with CLI tools.

**Alternative: Option 2 (Railway Dashboard)** - If you prefer web UI and know how to use one-off commands.

---

## Quick Start (Option 3)

1. Go to Railway → Backend → Variables
2. Set `ENABLE_FIELD_ENCRYPTION=true`
3. Wait 2 minutes for deployment
4. Open this URL in your browser:
   ```
   https://accessgraph-ai-production.up.railway.app/orgs/YOUR_ORG_ID/privacy/migrate-encrypt-tokens?confirm=MIGRATE_TOKENS
   ```
5. See success message
6. Test sync in your dashboard

**That's it!** 🎉
