# 🔐 Salesforce Integration Setup Guide

This guide will walk you through connecting your real Salesforce organization to AccessGraph AI.

---

## 📋 Prerequisites

Before you begin, ensure you have:
- A Salesforce account with **System Administrator** permissions
- Access to create a **Connected App** in Salesforce
- Your AccessGraph AI backend and frontend servers running

---

## 🚀 Step-by-Step Setup

### Step 1: Create a Salesforce Connected App

1. **Log into your Salesforce org**
   - Go to https://login.salesforce.com (or your custom domain)
   - Use your admin credentials

2. **Navigate to App Manager**
   - Click the **gear icon** (⚙️) in the top right
   - Select **Setup**
   - In Quick Find, search for **"App Manager"**
   - Click **App Manager** under Apps

3. **Create New Connected App**
   - Click **New Connected App** button (top right)
   - Fill in the required fields:

   ```
   Connected App Name: AccessGraph AI
   API Name: AccessGraph_AI (auto-filled)
   Contact Email: your-email@company.com
   ```

4. **Enable OAuth Settings**
   - Check ✅ **Enable OAuth Settings**
   - Set **Callback URL**:
     ```
     http://localhost:8000/auth/salesforce/callback
     ```

     > **Note**: For production, use your production backend URL:
     > `https://your-domain.com/auth/salesforce/callback`

5. **Select OAuth Scopes**
   Add these scopes (move them from Available to Selected):
   - ✅ **Access the identity URL service (id, profile, email, address, phone)**
   - ✅ **Manage user data via APIs (api)**
   - ✅ **Perform requests at any time (refresh_token, offline_access)**
   - ✅ **Access unique user identifiers (openid)**
   - ✅ **Full access (full)** - Required for comprehensive access analysis

6. **Save the Connected App**
   - Click **Save**
   - Click **Continue** on the warning message
   - You'll be redirected to the Connected App detail page

7. **Get Consumer Key and Secret**
   - On the Connected App detail page, click **Manage Consumer Details**
   - You may need to verify your identity (email code)
   - Copy these values (you'll need them in Step 2):
     - **Consumer Key** (Client ID)
     - **Consumer Secret** (Client Secret)

8. **Configure Policies**
   - Click **Edit Policies**
   - Under **OAuth Policies**:
     - **Permitted Users**: All users may self-authorize (or Admin approved users)
     - **IP Relaxation**: Relax IP restrictions (for development)
   - Click **Save**

---

### Step 2: Configure Backend Environment Variables

1. **Update your `.env` file** in the backend directory:

   ```bash
   # Navigate to backend directory
   cd apps/backend

   # Create .env file if it doesn't exist
   cp .env.example .env
   ```

2. **Edit `.env` and add Salesforce credentials**:

   ```bash
   # Salesforce OAuth Configuration
   SALESFORCE_CLIENT_ID=your_consumer_key_from_step_1
   SALESFORCE_CLIENT_SECRET=your_consumer_secret_from_step_1
   SALESFORCE_REDIRECT_URI=http://localhost:8000/auth/salesforce/callback
   SALESFORCE_LOGIN_URL=https://login.salesforce.com

   # For Sandbox orgs, use:
   # SALESFORCE_LOGIN_URL=https://test.salesforce.com

   # Disable demo mode to use real Salesforce data
   DEMO_MODE=false
   ```

3. **Important: Update CORS settings**

   Add your frontend URL to allowed origins:

   ```bash
   BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003
   ```

4. **Save the file** and restart the backend server

   ```bash
   # Stop the current backend server (Ctrl+C)
   # Restart it:
   python -m uvicorn app.main:app --reload --port 8000
   ```

---

### Step 3: Connect Your Salesforce Org via Frontend

Now that your Connected App is configured, you can connect via the UI:

1. **Open AccessGraph AI**
   - Navigate to http://localhost:3003 (or your frontend URL)

2. **Start Onboarding**
   - If no orgs are connected, you'll see the landing page
   - Click **"Get Started"** or **"Connect Organization"**
   - You'll be redirected to the onboarding page

3. **Initiate OAuth Flow**
   - On Step 1 (Connect Salesforce), click **"Connect to Salesforce"**
   - You'll be redirected to Salesforce login page
   - **Log in** with your Salesforce credentials
   - **Allow Access** when prompted

4. **OAuth Callback**
   - After authorization, you'll be redirected back to AccessGraph AI
   - The authorization code will be exchanged for access tokens automatically
   - Your org will be created and saved

5. **Configure Sync** (Step 2)
   - Choose what data to sync:
     - ✅ Users & Profiles
     - ✅ Permission Sets
     - ✅ Roles & Groups
     - ✅ Objects & Fields
     - ✅ Access Logs
   - Click **"Next"**

6. **Initial Analysis** (Step 3)
   - Click **"Start Analysis"**
   - AccessGraph AI will:
     1. Fetch data from your Salesforce org via APIs
     2. Build the access graph in Neo4j
     3. Run risk scoring algorithms
     4. Detect anomalies
     5. Generate recommendations

7. **View Dashboard**
   - Once sync completes, you'll be redirected to your org dashboard
   - Explore the different pages:
     - 👥 **Users** - All users with risk scores
     - 📊 **Objects** - Salesforce objects and field access
     - 🕸️ **Graph Explorer** - Visual access relationships
     - ⚠️ **Anomalies** - Detected security risks
     - 💡 **Recommendations** - AI-powered suggestions

---

### Step 4: Verify the Integration

1. **Check Sync Status**
   - Navigate to your org dashboard
   - Look for the sync status indicator
   - Should show "Synced" with last sync time

2. **View Users**
   - Go to **Users** page
   - You should see your actual Salesforce users
   - Risk scores should be calculated

3. **Explore Graph**
   - Go to **Graph Explorer**
   - You should see:
     - User nodes
     - Profile nodes
     - Permission Set nodes
     - Object nodes
     - Connections between them

4. **Check Anomalies**
   - Go to **Anomalies** page
   - Review detected access anomalies
   - Examples:
     - Users with excessive permissions
     - Dormant accounts with sensitive access
     - Unusual profile/permission combinations

---

## 🔧 API Endpoints for Salesforce Integration

### OAuth Flow Endpoints

```
# 1. Initiate OAuth (Frontend redirects user here)
GET /auth/salesforce/authorize
→ Redirects to Salesforce login

# 2. OAuth Callback (Salesforce redirects here after login)
GET /auth/salesforce/callback?code={auth_code}&state={csrf_token}
→ Exchanges code for tokens
→ Creates organization in database
→ Returns org details

# 3. Refresh Token (Automatic background process)
POST /auth/salesforce/refresh
Body: { "org_id": "org-uuid", "refresh_token": "..." }
→ Gets new access token when expired
```

### Organization & Sync Endpoints

```
# List all connected orgs
GET /orgs
→ Returns list of your Salesforce orgs

# Get specific org
GET /orgs/{org_id}
→ Returns org details

# Trigger manual sync
POST /orgs/{org_id}/sync
→ Starts data synchronization from Salesforce
→ Returns sync job ID

# Check sync status
GET /orgs/{org_id}/sync/latest
→ Returns status of most recent sync

# Get sync history
GET /orgs/{org_id}/sync/history
→ Returns list of all sync jobs
```

### Data Endpoints (All require valid org connection)

```
# Users
GET /orgs/{org_id}/users
GET /orgs/{org_id}/users/{user_id}

# Objects & Fields
GET /orgs/{org_id}/objects
GET /orgs/{org_id}/objects/{object_name}
GET /orgs/{org_id}/fields

# Graph
GET /orgs/{org_id}/graph

# Anomalies
GET /orgs/{org_id}/anomalies

# Recommendations
GET /orgs/{org_id}/recommendations
```

---

## 🔍 Testing OAuth Flow Manually

If you want to test the OAuth flow via API (without UI):

```bash
# 1. Get authorization URL
curl http://localhost:8000/auth/salesforce/authorize

# This returns a URL like:
# https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...

# 2. Visit that URL in browser
# 3. Log in to Salesforce
# 4. You'll be redirected to: http://localhost:8000/auth/salesforce/callback?code=...

# 5. The backend automatically exchanges the code for tokens
# 6. Check your database - a new org should be created
```

---

## 📊 Data Synced from Salesforce

When you connect, AccessGraph AI pulls the following data:

### User Data
- User ID, Name, Email, Username
- Profile ID and Name
- Role ID and Name (if assigned)
- Permission Set Assignments
- Last Login Date
- Active/Inactive status
- Created Date

### Permission Data
- Profiles and their permissions
- Permission Sets and assignments
- Permission Set Groups
- System permissions
- Object-level permissions (CRUD)
- Field-level permissions (FLS)

### Object/Field Metadata
- All standard and custom objects
- Object labels and API names
- Field definitions
- Field types and properties
- Required fields, unique fields

### Role Hierarchy
- Role names and IDs
- Parent-child relationships
- Users assigned to roles

### Group Data
- Public Groups
- Queues
- Group memberships

### Access Logs (if available)
- Login history
- Field audit trail
- Setup audit trail

---

## 🔐 Security Best Practices

1. **Secure Your Credentials**
   - Never commit `.env` file to version control
   - Use environment variables in production
   - Rotate client secrets regularly

2. **Use Refresh Tokens**
   - Access tokens expire after 2 hours
   - Refresh tokens are long-lived
   - Backend automatically refreshes when needed

3. **IP Restrictions (Production)**
   - In Salesforce Connected App, restrict to known IPs
   - Use VPN or fixed IP ranges

4. **Least Privilege**
   - Only grant necessary OAuth scopes
   - Consider creating a dedicated Salesforce user for API access

5. **Token Storage**
   - Tokens are encrypted in the database
   - Refresh tokens never exposed to frontend
   - Access tokens cached temporarily

---

## 🐛 Troubleshooting

### Issue: "Invalid client_id"
**Solution**:
- Verify `SALESFORCE_CLIENT_ID` in `.env` matches Consumer Key from Connected App
- Check for extra spaces or quotes

### Issue: "redirect_uri_mismatch"
**Solution**:
- `SALESFORCE_REDIRECT_URI` in `.env` must EXACTLY match callback URL in Connected App
- Include `http://` or `https://`
- Match port number

### Issue: "User hasn't approved this consumer"
**Solution**:
- In Connected App settings, change "Permitted Users" to "All users may self-authorize"
- Or pre-approve users in "Manage" → "Profiles" or "Permission Sets"

### Issue: "CORS errors in frontend"
**Solution**:
- Add frontend URL to `BACKEND_CORS_ORIGINS` in backend `.env`
- Restart backend server

### Issue: "Insufficient privileges"
**Solution**:
- Ensure your Salesforce user has "API Enabled" permission
- Check profile has "View All Data" or specific object permissions

### Issue: "No data showing after sync"
**Solution**:
- Check sync job status: `GET /orgs/{org_id}/sync/latest`
- View backend logs for errors
- Ensure `DEMO_MODE=false` in backend `.env`

---

## 🎯 Next Steps

Once connected, you can:

1. **Schedule Automatic Syncs**
   - Set up cron jobs to sync daily
   - Monitor for new users/permission changes

2. **Configure Alerts**
   - Get notified of critical anomalies
   - Set custom risk thresholds

3. **Export Reports**
   - Generate compliance reports
   - Export access matrices

4. **Explore Graph**
   - Visualize complex permission hierarchies
   - Find shortest paths between users and data

5. **Act on Recommendations**
   - Review and implement security improvements
   - Track remediation progress

---

## 📚 Additional Resources

- [Salesforce OAuth 2.0 Documentation](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [Connected App Setup](https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm)
- [API Access Best Practices](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm)

---

## 💬 Need Help?

If you encounter issues:
1. Check backend logs: `docker-compose logs backend`
2. Review Salesforce setup audit trail
3. Open an issue on GitHub
4. Contact support team

---

**Happy analyzing! 🚀**
