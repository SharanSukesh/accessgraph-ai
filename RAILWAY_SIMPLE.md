# 🚂 Railway Deployment - Simplified Visual Guide

## Step 1: Create Railway Project

1. Go to: https://railway.app
2. Click **"Start a New Project"**
3. Click **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub
5. Select: `SharanSukesh/accessgraph-ai`

Railway creates a project with one service (might auto-detect as monorepo).

---

## Step 2: Add PostgreSQL Database

1. In Railway project dashboard, click **"+ New"** button (top right)
2. Select **"Database"**
3. Click **"Add PostgreSQL"**
4. Railway provisions database automatically ✅

You'll see a new card labeled "Postgres" in your dashboard.

---

## Step 3: Add Redis Database

1. Click **"+ New"** again
2. Select **"Database"**
3. Click **"Add Redis"**
4. Railway provisions Redis automatically ✅

You'll see a new card labeled "Redis" in your dashboard.

---

## Step 4: Configure Backend Service

**If Railway auto-created a service:**
1. Click on the service card
2. Go to **Settings** tab (left sidebar)

**If you need to create backend service:**
1. Click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose `SharanSukesh/accessgraph-ai` again
4. Railway creates the service

### Configure Backend Settings:

Click the service card → **Settings** tab:

**1. Service Name** (optional, for clarity):
```
Service Name: backend
```

**2. Root Directory** (REQUIRED for monorepo):
```
Root Directory: apps/backend
```

**3. Start Command** (Railway might auto-detect, but set it to be sure):
```
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**4. Watch Paths** (optional, tells Railway what changes trigger redeploy):
```
Watch Paths: apps/backend/**
```

**Save** (Railway auto-saves as you type)

### Add Backend Environment Variables:

Click **Variables** tab (left sidebar):

Click **"+ New Variable"** for each of these:

| Variable Name | Value |
|---------------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `NEO4J_URI` | `bolt://localhost:7687` |
| `NEO4J_USER` | `neo4j` |
| `NEO4J_PASSWORD` | `temporary` |
| `BACKEND_HOST` | `0.0.0.0` |
| `BACKEND_PORT` | `$PORT` |
| `BACKEND_LOG_LEVEL` | `info` |
| `BACKEND_CORS_ORIGINS` | `http://localhost:3000` |
| `DEMO_MODE` | `true` |
| `SALESFORCE_CLIENT_ID` | `placeholder` |
| `SALESFORCE_CLIENT_SECRET` | `placeholder` |
| `SALESFORCE_REDIRECT_URI` | `http://localhost:8000/auth/salesforce/callback` |
| `SALESFORCE_LOGIN_URL` | `https://login.salesforce.com` |

**Note about `${{Postgres.DATABASE_URL}}`:**
- Railway will auto-replace this with the actual PostgreSQL connection string
- This is Railway's variable reference syntax
- Same for `${{Redis.REDIS_URL}}`

Backend will auto-deploy after variables are saved.

---

## Step 5: Configure Frontend Service

**Create frontend service:**
1. Click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose `SharanSukesh/accessgraph-ai` again

### Configure Frontend Settings:

Click the new service → **Settings** tab:

**1. Service Name**:
```
Service Name: frontend
```

**2. Root Directory**:
```
Root Directory: apps/frontend
```

**3. Build Command** (Railway might auto-detect):
```
Build Command: npm install && npm run build
```

**4. Start Command**:
```
Start Command: npm start
```

**5. Watch Paths**:
```
Watch Paths: apps/frontend/**
```

### Add Frontend Environment Variables:

Click **Variables** tab:

| Variable Name | Value |
|---------------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` |
| `NEXT_PUBLIC_APP_NAME` | `AccessGraph AI` |
| `NODE_ENV` | `production` |

Frontend will auto-deploy.

---

## Step 6: Generate Railway Domains

### For Backend:

1. Click **backend** service card
2. Go to **Settings** tab
3. Scroll to **Networking** section
4. Click **"Generate Domain"**
5. Railway creates a URL like: `backend-production-abc123.up.railway.app`
6. **Copy this URL** - you'll need it!

### For Frontend:

1. Click **frontend** service card
2. Go to **Settings** tab
3. Scroll to **Networking** section
4. Click **"Generate Domain"**
5. Railway creates a URL like: `frontend-production-xyz789.up.railway.app`
6. **Copy this URL**

---

## Step 7: Update Frontend to Use Backend URL

Now that backend has a public URL, update frontend:

1. Click **frontend** service
2. Go to **Variables** tab
3. Find `NEXT_PUBLIC_API_URL`
4. Click to edit
5. Change from: `http://localhost:8000`
6. Change to: `https://backend-production-abc123.up.railway.app` (your actual backend URL)
7. Save

Frontend will auto-redeploy.

---

## Step 8: Test the Deployment

1. Visit your frontend Railway URL: `https://frontend-production-xyz789.up.railway.app`
2. App should load in **demo mode**
3. You should see sample data

**Check logs if not working:**
- Click service → **Deployments** tab → Click latest deployment → View logs

---

## What Your Railway Dashboard Should Look Like

```
┌─────────────────────────────────────────────────┐
│ accessgraph-ai                                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Postgres │  │  Redis   │  │  backend │     │
│  │   🟢     │  │   🟢     │  │   🟢     │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                 │
│  ┌──────────┐                                  │
│  │ frontend │                                  │
│  │   🟢     │                                  │
│  └──────────┘                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

Green checkmarks (🟢) mean services are running successfully.

---

## Quick Reference: Railway Variable References

Railway uses `${{SERVICE.VARIABLE}}` syntax:

- `${{Postgres.DATABASE_URL}}` - PostgreSQL connection string
- `${{Redis.REDIS_URL}}` - Redis connection string
- `$PORT` - Railway's dynamic port number

**Don't use actual values for these** - let Railway inject them!

---

## Next Steps

Once Railway deployment works:

1. ✅ Setup Neo4j Aura (see RAILWAY_DEPLOY.md Step 3)
2. ✅ Buy custom domain
3. ✅ Configure DNS
4. ✅ Add custom domains in Railway
5. ✅ Create Salesforce Connected App
6. ✅ Update environment variables with real credentials
7. ✅ Test with real Salesforce org!

---

## Screenshots Guide

**Where is "Root Directory"?**

When you click a service → Settings:

```
Service Settings
├─ General
│  └─ Service Name: [backend     ]
│
├─ Source
│  ├─ Repository: SharanSukesh/accessgraph-ai
│  ├─ Branch: main
│  └─ Root Directory: [apps/backend  ] ← HERE
│
└─ Build & Deploy
   ├─ Builder: Nixpacks (auto-detected)
   ├─ Build Command: (auto)
   ├─ Start Command: [uvicorn app.main:app...] ← AND HERE
   └─ Watch Paths: [apps/backend/**]
```

**Where is "Start Command"?**

Same Settings page, scroll down to "Build & Deploy" section.

**Where are "Variables"?**

Click service → **Variables** tab in left sidebar (different from Settings).

---

## Common Railway UI Elements

- **+ New** button: Top right of project dashboard
- **Service cards**: Rectangular boxes showing each service
- **Left sidebar** (when you click a service):
  - Deployments
  - Metrics
  - Variables ← Add env vars here
  - Settings ← Configure root dir & commands here
  - Logs

---

## Troubleshooting Railway

**Build fails?**
- Check Root Directory is set correctly
- Check logs: Service → Deployments → Click deployment → View logs

**Service won't start?**
- Check Start Command is correct
- Check environment variables are set
- Check logs for errors

**Can't connect to database?**
- Make sure you used `${{Postgres.DATABASE_URL}}` (not a manual connection string)
- Check database service is running (green checkmark)

---

Need help with a specific Railway screen? Let me know what you're seeing!
