# 🚀 AccessGraph AI - Quick Start Guide

This guide will get you up and running with AccessGraph AI in 5 minutes.

---

## Current Status

✅ **Frontend**: Running on http://localhost:3003
✅ **Backend API**: Running on http://localhost:8000
✅ **API Docs**: Available at http://localhost:8000/docs

---

## What AccessGraph AI Does

AccessGraph AI analyzes your Salesforce organization's access patterns to:

1. **Visualize Access Relationships** - See who has access to what in a graph
2. **Detect Anomalies** - Find unusual or risky permission patterns
3. **Calculate Risk Scores** - Assess security risk for users and permissions
4. **Generate Recommendations** - Get AI-powered suggestions to improve security

---

## Two Modes of Operation

### 1. Demo Mode (Current) - Try it Now!

The application is running in **demo mode** with simulated data. This is perfect for:
- Understanding the features
- Exploring the UI
- Seeing sample visualizations
- Testing without connecting Salesforce

**Just visit**: http://localhost:3003

You'll see sample data for:
- 150+ demo users
- Permission sets and roles
- Access anomalies
- Risk scores
- Recommendations

### 2. Production Mode - Connect Your Salesforce Org

To analyze your **real** Salesforce data, follow these steps:

#### Step 1: Create Salesforce Connected App

1. Log into your Salesforce org as System Administrator
2. Go to **Setup** → **App Manager**
3. Click **New Connected App**
4. Fill in:
   - **App Name**: AccessGraph AI
   - **Contact Email**: your-email@company.com
5. Enable **OAuth Settings**
   - **Callback URL**: `http://localhost:8000/auth/salesforce/callback`
   - **OAuth Scopes**: Select:
     - ✅ Full access (full)
     - ✅ Manage user data via APIs (api)
     - ✅ Perform requests at any time (refresh_token)
6. Click **Save**, then **Continue**
7. Click **Manage Consumer Details** to get your:
   - **Consumer Key** (Client ID)
   - **Consumer Secret** (Client Secret)

#### Step 2: Configure Backend

Edit `apps/backend/.env`:

```bash
# Salesforce OAuth
SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_REDIRECT_URI=http://localhost:8000/auth/salesforce/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com

# For sandbox orgs, use:
# SALESFORCE_LOGIN_URL=https://test.salesforce.com

# Disable demo mode
DEMO_MODE=false
```

Restart the backend server:
```bash
# Stop it (Ctrl+C) and restart:
cd apps/backend
python -m uvicorn app.main:app --reload --port 8000
```

#### Step 3: Connect via UI

1. Visit http://localhost:3003
2. Click **"Get Started"** or **"Connect Organization"**
3. You'll be redirected to Salesforce login
4. Log in and click **"Allow"**
5. You'll be redirected back to AccessGraph AI
6. The sync will begin automatically

---

## Understanding the Interface

### Dashboard (Home)
- **Overview cards**: Users, anomalies, risk scores
- **Recent activity**: Latest sync jobs
- **Quick stats**: High-risk users, pending recommendations

### Users Page
- List all Salesforce users
- Filter by role, profile, status
- See risk scores for each user
- Click a user to see detailed access

### User Detail Page (6 Tabs)
1. **Overview** - Basic info, risk score, last login
2. **Permissions** - All permission sets and roles
3. **Objects** - Objects the user can access (CRUD)
4. **Fields** - Sensitive fields the user can read/edit
5. **Access Path** - How the user got their permissions
6. **Anomalies** - Detected issues for this user

### Graph Explorer
- **Visual graph** of access relationships
- **Nodes**: Users, Profiles, Permission Sets, Objects
- **Edges**: Relationships (has_role, can_access, etc.)
- **Interactive**: Zoom, pan, click nodes for details
- **Filters**: Show/hide node types, edge types

### Anomalies Page
- List of detected security issues
- Severity levels: Info, Low, Medium, High, Critical
- Each anomaly shows:
  - Affected user
  - Anomaly type
  - Reasons why it's flagged
  - Peer comparison data

### Recommendations Page
- AI-generated security improvements
- Types:
  - **Permission Removal** - Remove excessive permissions
  - **Role Simplification** - Consolidate roles
  - **Access Review** - Review dormant accounts
  - **Account Cleanup** - Deactivate unused accounts
  - **PSG Migration** - Migrate to Permission Set Groups
- Status: Pending, Accepted, Rejected, Applied

### Objects & Fields Pages
- Browse Salesforce metadata
- See which users have access
- Filter by custom vs standard, sensitive vs normal
- Click to see field-level security (FLS)

---

## API Endpoints

Visit http://localhost:8000/docs for interactive API documentation.

### Key Endpoints

```bash
# Health check
GET http://localhost:8000/health

# List organizations
GET http://localhost:8000/orgs

# Get org users
GET http://localhost:8000/orgs/{org_id}/users

# Get user detail
GET http://localhost:8000/orgs/{org_id}/users/{user_id}

# Get graph data
GET http://localhost:8000/orgs/{org_id}/graph

# Get anomalies
GET http://localhost:8000/orgs/{org_id}/anomalies

# Get recommendations
GET http://localhost:8000/orgs/{org_id}/recommendations

# Trigger manual sync
POST http://localhost:8000/orgs/{org_id}/sync
```

### OAuth Endpoints

```bash
# Initiate OAuth flow
GET http://localhost:8000/auth/salesforce/authorize

# Refresh token
POST http://localhost:8000/auth/salesforce/refresh
Body: { "org_id": "your-org-id" }

# Get connection status
GET http://localhost:8000/auth/salesforce/status/{org_id}

# Disconnect
POST http://localhost:8000/auth/salesforce/disconnect/{org_id}
```

---

## Common Tasks

### Export Data

All tables support CSV/JSON export:
1. Click the **Export** button (top right)
2. Choose **CSV** or **JSON**
3. File downloads automatically

### Filter and Search

- Use the search bar to find users by name/email
- Use filter dropdowns to narrow results
- Combine filters for precise queries

### View Graph Relationships

1. Go to **Graph Explorer**
2. Use the legend to show/hide node types
3. Click any node to see details
4. Use the toolbar to:
   - Zoom in/out
   - Reset layout
   - Export as PNG/JSON
   - Take screenshot

### Act on Recommendations

1. Go to **Recommendations** page
2. Click a recommendation to see details
3. Review the rationale and impact
4. Click **Accept** or **Reject**
5. If accepted, implement in Salesforce
6. Mark as **Applied** when done

---

## Troubleshooting

### Frontend not loading?

Check if it's running:
```bash
cd apps/frontend
npm run dev
```

### Backend errors?

Check logs:
```bash
cd apps/backend
python -m uvicorn app.main:app --reload --port 8000
```

### CORS errors?

Make sure backend `.env` has:
```bash
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003
```

### OAuth not working?

1. Verify `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET` in `.env`
2. Ensure callback URL matches exactly: `http://localhost:8000/auth/salesforce/callback`
3. Check Salesforce Connected App is approved for your user

### No data after sync?

1. Check `DEMO_MODE=false` in backend `.env`
2. View sync status: `GET /orgs/{org_id}/sync/latest`
3. Check backend logs for errors

---

## Next Steps

1. **Connect your Salesforce org** (see Production Mode above)
2. **Explore the demo data** to understand features
3. **Review anomalies** and take action
4. **Implement recommendations** to improve security
5. **Schedule regular syncs** for ongoing monitoring

---

## Need More Help?

- **Detailed Setup**: See [SALESFORCE_SETUP_GUIDE.md](./SALESFORCE_SETUP_GUIDE.md)
- **API Documentation**: http://localhost:8000/docs
- **Architecture**: See [README.md](./README.md)

---

**Built with ❤️ for Salesforce security teams**
