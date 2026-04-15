# 🚂 Railway Deployment - Step by Step

This is the **fastest way** to deploy AccessGraph AI with a real domain for Salesforce OAuth.

---

## ✅ Pre-Deployment Checklist

Before deploying, make sure you have:

- [ ] GitHub account
- [ ] Railway account (sign up with GitHub at https://railway.app)
- [ ] Credit card ready for domain purchase (~$10-15)
- [ ] Salesforce org with System Administrator access

**Time required:** 45 minutes total (20 min active work, 25 min waiting for DNS)

---

## 📦 Step 1: Push to GitHub (5 minutes)

### 1.1 Initialize Git Repository

```bash
# Navigate to your project
cd C:\Users\shara\SalesforceAccess

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - AccessGraph AI"
```

### 1.2 Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `accessgraph-ai` (or your preferred name)
3. Keep it **Private** (recommended) or Public
4. **DON'T** initialize with README (we already have one)
5. Click **Create repository**

### 1.3 Push to GitHub

```bash
# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/accessgraph-ai.git

# Set main branch
git branch -M main

# Push
git push -u origin main
```

✅ **Checkpoint:** Visit your GitHub repo URL - you should see all files

---

## 🚂 Step 2: Deploy to Railway (10 minutes)

### 2.1 Sign Up & Create Project

1. Go to https://railway.app
2. Click **Login** → Use your GitHub account
3. Click **New Project**
4. Select **Deploy from GitHub repo**
5. Select `accessgraph-ai` repository
6. Railway will create a project

### 2.2 Add PostgreSQL Database

1. In your Railway project, click **+ New**
2. Select **Database**
3. Choose **Add PostgreSQL**
4. Railway auto-provisions the database
5. Note: `DATABASE_URL` is automatically available as `${{Postgres.DATABASE_URL}}`

### 2.3 Add Redis Database

1. Click **+ New** again
2. Select **Database**
3. Choose **Add Redis**
4. Railway auto-provisions Redis
5. Note: `REDIS_URL` is automatically available as `${{Redis.REDIS_URL}}`

### 2.4 Deploy Backend Service

1. Click **+ New**
2. Select **GitHub Repo**
3. Choose your repo again
4. Railway creates a service

**Configure Backend:**

1. Click on the service → **Settings**
2. Set **Service Name**: `backend`
3. Set **Root Directory**: `apps/backend`
4. Set **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Click **Variables** tab
6. Add these variables:

```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=temppassword
BACKEND_HOST=0.0.0.0
BACKEND_PORT=$PORT
BACKEND_LOG_LEVEL=info
BACKEND_CORS_ORIGINS=http://localhost:3000
DEMO_MODE=true
SALESFORCE_CLIENT_ID=placeholder
SALESFORCE_CLIENT_SECRET=placeholder
SALESFORCE_REDIRECT_URI=http://localhost:8000/auth/salesforce/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com
```

*Note: We'll update these later with real values*

7. Click **Deploy**

### 2.5 Deploy Frontend Service

1. Click **+ New**
2. Select **GitHub Repo**
3. Choose your repo again

**Configure Frontend:**

1. Click on the service → **Settings**
2. Set **Service Name**: `frontend`
3. Set **Root Directory**: `apps/frontend`
4. Set **Build Command**: `npm run build`
5. Set **Start Command**: `npm start`
6. Click **Variables** tab
7. Add these variables:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=AccessGraph AI
NODE_ENV=production
```

8. Click **Deploy**

### 2.6 Generate Railway Domains

**For Backend:**
1. Click **backend** service
2. Go to **Settings** → **Domains**
3. Click **Generate Domain**
4. Copy the URL (e.g., `backend-production-abc123.up.railway.app`)

**For Frontend:**
1. Click **frontend** service
2. Go to **Settings** → **Domains**
3. Click **Generate Domain**
4. Copy the URL (e.g., `frontend-production-abc123.up.railway.app`)

### 2.7 Update Frontend to Use Backend URL

1. Go to **frontend** service → **Variables**
2. Update `NEXT_PUBLIC_API_URL` to your backend Railway URL:
   ```
   NEXT_PUBLIC_API_URL=https://backend-production-abc123.up.railway.app
   ```
3. Redeploy frontend (it will auto-deploy)

✅ **Checkpoint:** Visit your frontend Railway URL - app should load in demo mode!

---

## 🗄️ Step 3: Setup Neo4j Aura (5 minutes)

Railway doesn't have managed Neo4j, so we'll use Neo4j Aura (free tier).

1. Go to https://neo4j.com/cloud/aura/
2. Click **Start Free**
3. Sign up with email or Google
4. Click **Create Database** → **Free**
5. Configure:
   - **Name**: `AccessGraph`
   - **Region**: Choose closest to you
   - **Type**: AuraDB Free
6. Click **Create**
7. **Important:** Copy credentials shown:
   - **Connection URI**: `neo4j+s://xxxxx.databases.neo4j.io`
   - **Username**: `neo4j`
   - **Password**: (shown once - SAVE IT!)
8. Download credentials file as backup

### Update Railway Backend with Neo4j

1. Go to Railway → **backend** service → **Variables**
2. Update these:
   ```
   NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your_password_from_aura
   ```
3. Backend will auto-redeploy

✅ **Checkpoint:** Check backend logs - should connect to Neo4j successfully

---

## 🌐 Step 4: Buy a Domain (5 minutes)

You need a custom domain because Salesforce requires HTTPS callbacks (no localhost).

### Recommended: Namecheap

1. Go to https://www.namecheap.com
2. Search for a domain (suggestions):
   - `accessgraph.app`
   - `sfaccess.io`
   - `[yourcompany]-access.com`
3. Add to cart
4. Checkout (~$10-15/year)
5. Complete purchase

**Alternative registrars:** Porkbun, Google Domains, Cloudflare

✅ **Checkpoint:** You own a domain!

---

## 🔗 Step 5: Configure Custom Domains in Railway (5 minutes)

### 5.1 Add Custom Domain to Backend

1. Go to Railway → **backend** service → **Settings** → **Domains**
2. Click **Custom Domain**
3. Enter: `api.your-domain.com` (replace with your actual domain)
4. Railway will show you DNS records to add

### 5.2 Add Custom Domain to Frontend

1. Go to Railway → **frontend** service → **Settings** → **Domains**
2. Click **Custom Domain**
3. Enter: `your-domain.com`
4. Click **Add Domain** again
5. Enter: `www.your-domain.com`
6. Railway will show you DNS records for both

### 5.3 Add DNS Records

Go to your domain registrar (Namecheap, etc.) → **DNS Management**:

Add these records:

```
Type    Host    Value (from Railway)                           TTL
CNAME   api     backend-production-abc123.up.railway.app        Automatic
CNAME   @       frontend-production-abc123.up.railway.app       Automatic
CNAME   www     frontend-production-abc123.up.railway.app       Automatic
```

**Note:** Some registrars don't allow CNAME on root (@). If so:
- Use their redirect/forwarding feature: `your-domain.com` → `www.your-domain.com`
- Or use Cloudflare (supports CNAME flattening)

**Save DNS records**

### 5.4 Wait for DNS Propagation

⏳ **This takes 5-60 minutes** (usually ~15-30 minutes)

Check status:
```bash
# Check if DNS is live
nslookup api.your-domain.com
nslookup your-domain.com
```

Or use: https://dnschecker.org

### 5.5 Railway Auto-Provisions SSL

Once DNS propagates, Railway automatically:
- ✅ Provisions Let's Encrypt SSL certificate
- ✅ Enables HTTPS
- ✅ Redirects HTTP → HTTPS

✅ **Checkpoint:** Visit `https://your-domain.com` - should load with SSL! 🔒

---

## 🔄 Step 6: Update Environment Variables (5 minutes)

### 6.1 Update Backend Variables

Go to Railway → **backend** service → **Variables**:

```bash
# Update CORS to allow your domain
BACKEND_CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Update Salesforce redirect URI
SALESFORCE_REDIRECT_URI=https://api.your-domain.com/auth/salesforce/callback

# Keep these for now (we'll update after creating Connected App)
SALESFORCE_CLIENT_ID=placeholder
SALESFORCE_CLIENT_SECRET=placeholder
```

### 6.2 Update Frontend Variables

Go to Railway → **frontend** service → **Variables**:

```bash
# Update API URL to custom domain
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

Both services will auto-redeploy.

✅ **Checkpoint:** Visit `https://your-domain.com` - should work with SSL!

---

## 🔐 Step 7: Create Salesforce Connected App (5 minutes)

Now that you have a real HTTPS domain, configure Salesforce.

### 7.1 Create Connected App

1. Log into Salesforce (production org)
2. Click **Setup** (gear icon)
3. Quick Find → Search **"App Manager"**
4. Click **New Connected App**

### 7.2 Fill in Details

```
Connected App Name: AccessGraph AI
API Name: AccessGraph_AI
Contact Email: your-email@company.com
Description: Access intelligence and security analysis
```

### 7.3 Enable OAuth Settings

✅ **Enable OAuth Settings**

**Callback URL** (IMPORTANT):
```
https://api.your-domain.com/auth/salesforce/callback
```

**Selected OAuth Scopes** (move these to Selected):
- ✅ Access the identity URL service (id, profile, email, address, phone)
- ✅ Access unique user identifiers (openid)
- ✅ Manage user data via APIs (api)
- ✅ Perform requests at any time (refresh_token, offline_access)
- ✅ Full access (full)

### 7.4 Save & Get Credentials

1. Click **Save**
2. Click **Continue**
3. Click **Manage Consumer Details**
4. Verify your identity (email code)
5. Copy these values:
   - **Consumer Key** → This is your `SALESFORCE_CLIENT_ID`
   - **Consumer Secret** → This is your `SALESFORCE_CLIENT_SECRET`

### 7.5 Configure Policies

1. Click **Edit Policies**
2. **Permitted Users**: `All users may self-authorize`
3. **IP Relaxation**: `Relax IP restrictions`
4. **Refresh Token Policy**: `Refresh token is valid until revoked`
5. Click **Save**

✅ **Checkpoint:** Connected App is ready!

---

## 🎯 Step 8: Update Railway with Salesforce Credentials (2 minutes)

Go to Railway → **backend** service → **Variables**:

Update these with your actual values:

```bash
SALESFORCE_CLIENT_ID=your_actual_consumer_key_from_salesforce
SALESFORCE_CLIENT_SECRET=your_actual_consumer_secret_from_salesforce

# Also set this to false to use real data
DEMO_MODE=false
```

Backend auto-redeploys with real credentials.

---

## 🎉 Step 9: Test with Real Salesforce Org! (5 minutes)

### 9.1 Connect Your Org

1. Visit `https://your-domain.com`
2. You should see the landing page
3. Click **"Get Started"** or **"Connect Organization"**
4. You'll be redirected to Salesforce login
5. **Log in** with your Salesforce credentials
6. Click **Allow** to authorize AccessGraph AI
7. You'll be redirected back to your domain
8. Sync begins automatically! 🎉

### 9.2 Verify Connection

1. Go to Dashboard - you should see real data syncing
2. Go to Users - should see your actual Salesforce users
3. Go to Graph Explorer - visualize real access relationships!

### 9.3 Check Logs

Railway → **backend** service → **Deployments** → **View Logs**

You should see:
```
Successfully exchanged code for tokens
Created new org: <org-id>
Starting sync for org: <org-id>
```

---

## ✅ Success Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created with Postgres + Redis
- [ ] Neo4j Aura database created
- [ ] Backend deployed to Railway
- [ ] Frontend deployed to Railway
- [ ] Domain purchased
- [ ] Custom domains configured in Railway
- [ ] DNS records added and propagated
- [ ] SSL certificates auto-provisioned
- [ ] Salesforce Connected App created
- [ ] OAuth credentials added to Railway
- [ ] Successfully connected Salesforce org
- [ ] Real data syncing and visible

---

## 🐛 Troubleshooting

### "redirect_uri_mismatch" error

**Cause:** Callback URL mismatch

**Fix:**
1. Check Railway backend → Variables → `SALESFORCE_REDIRECT_URI`
2. Must exactly match Salesforce Connected App callback URL
3. Should be: `https://api.your-domain.com/auth/salesforce/callback`
4. Make sure both have `https://` (not `http://`)

### "Failed to connect to Neo4j"

**Cause:** Wrong Neo4j credentials

**Fix:**
1. Go to Neo4j Aura console
2. Verify connection URI and password
3. Update Railway backend variables
4. Redeploy

### "CORS error" in browser

**Cause:** CORS origins not configured

**Fix:**
1. Railway backend → Variables → `BACKEND_CORS_ORIGINS`
2. Should include: `https://your-domain.com,https://www.your-domain.com`
3. Redeploy backend

### DNS not propagating

**Patience:** Can take up to 48 hours (usually 15-30 min)

**Check:** https://dnschecker.org

### SSL certificate not provisioning

**Cause:** DNS not propagated yet

**Wait:** 30 minutes after DNS propagates

**Check:** Railway shows "SSL Active" badge

---

## 💰 Costs

**Free Tier (Railway):**
- $0/month
- 500 hours/month included
- Good for testing and small orgs

**Paid Tier (Railway Pro):**
- $5/month base
- $0.000231/GB-hour for usage
- ~$10-20/month total for production use

**Neo4j Aura:**
- Free tier: $0 (perfect for this)

**Domain:**
- ~$10-15/year

**Total first year:** ~$20-30 (if staying on free tier)
**Total per year after:** ~$120-240 (if upgrading to paid tier)

---

## 🚀 Next Steps After Deployment

1. **Test thoroughly** with your Salesforce org
2. **Monitor** Railway logs for errors
3. **Setup backups** (Railway auto-backs up databases)
4. **Add team members** (if needed)
5. **Configure alerts** (Railway supports webhooks)
6. **Schedule syncs** (can add cron jobs later)

---

## 📞 Need Help?

- **Railway Docs**: https://docs.railway.app
- **Neo4j Docs**: https://neo4j.com/docs/aura/
- **Salesforce OAuth**: https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm

---

**You're live! 🎉**

Your AccessGraph AI instance is now running in production with real Salesforce data.
