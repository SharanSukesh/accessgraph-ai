# 🚀 DEPLOY NOW - Quick Reference

**Ready to deploy AccessGraph AI with real Salesforce OAuth? Follow this checklist.**

---

## 🎯 What You Need

- ✅ GitHub account
- ✅ Credit card for domain (~$12)
- ✅ 45 minutes of time
- ✅ Salesforce admin access

---

## 📋 Deployment Checklist

### Phase 1: Prepare Code (5 min)

```bash
# 1. Navigate to project
cd C:\Users\shara\SalesforceAccess

# 2. Initialize git
git init
git add .
git commit -m "Initial commit"

# 3. Create GitHub repo at: https://github.com/new
# Name: accessgraph-ai

# 4. Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/accessgraph-ai.git
git branch -M main
git push -u origin main
```

**✅ Done? Proceed to Phase 2**

---

### Phase 2: Deploy to Railway (10 min)

1. **Sign up**: https://railway.app (use GitHub login)

2. **Create project**: New Project → Deploy from GitHub → Select `accessgraph-ai`

3. **Add databases**:
   - Click "+ New" → Database → PostgreSQL
   - Click "+ New" → Database → Redis

4. **Deploy backend**:
   - "+ New" → GitHub Repo → your repo
   - Settings:
     - Service Name: `backend`
     - Root Directory: `apps/backend`
     - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Variables (add these):
     ```
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     REDIS_URL=${{Redis.REDIS_URL}}
     NEO4J_URI=bolt://localhost:7687
     NEO4J_USER=neo4j
     NEO4J_PASSWORD=temp
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

5. **Deploy frontend**:
   - "+ New" → GitHub Repo → your repo
   - Settings:
     - Service Name: `frontend`
     - Root Directory: `apps/frontend`
     - Build Command: `npm run build`
     - Start Command: `npm start`
   - Variables:
     ```
     NEXT_PUBLIC_API_URL=http://localhost:8000
     NEXT_PUBLIC_APP_NAME=AccessGraph AI
     NODE_ENV=production
     ```

6. **Generate domains**:
   - Backend → Settings → Generate Domain → Copy URL
   - Frontend → Settings → Generate Domain → Copy URL

7. **Update frontend env**:
   - Frontend → Variables → Update:
     ```
     NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app
     ```

**✅ Test**: Visit frontend URL - should load in demo mode!

---

### Phase 3: Setup Neo4j (5 min)

1. Go to: https://neo4j.com/cloud/aura/
2. Sign up → Create Free Database
3. Name: `AccessGraph`
4. **SAVE CREDENTIALS** (shown once):
   - URI: `neo4j+s://xxxxx.databases.neo4j.io`
   - User: `neo4j`
   - Password: `<save this>`

5. Update Railway backend variables:
   ```
   NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=<your password>
   ```

**✅ Check logs**: Backend should connect to Neo4j

---

### Phase 4: Buy Domain (5 min)

**Option 1: Namecheap** (recommended)
- Go to: https://www.namecheap.com
- Search domain (e.g., `accessgraph.app`, `sfaccess.io`)
- Buy (~$10-15/year)

**Option 2: Porkbun**
- https://porkbun.com
- Often cheaper

**Suggestions**:
- `accessgraph.app` - $12/year
- `[yourname]-access.io` - $30/year
- `salesforce-access.com` - $10/year

**✅ Domain purchased? Note the name**

---

### Phase 5: Configure Custom Domains (5 min)

1. **Backend domain**:
   - Railway → backend → Settings → Domains → Custom Domain
   - Enter: `api.your-domain.com`
   - Railway shows DNS records

2. **Frontend domain**:
   - Railway → frontend → Settings → Domains → Custom Domain
   - Enter: `your-domain.com`
   - Add another: `www.your-domain.com`
   - Railway shows DNS records

3. **Add DNS in registrar** (Namecheap, etc.):
   ```
   Type    Host    Value (from Railway)
   CNAME   api     backend-production-xxx.up.railway.app
   CNAME   @       frontend-production-xxx.up.railway.app
   CNAME   www     frontend-production-xxx.up.railway.app
   ```

**⏳ WAIT: DNS propagation (15-45 minutes)**

Check at: https://dnschecker.org

---

### Phase 6: Update Environment for Custom Domain (5 min)

**While DNS propagates, update Railway variables:**

1. **Backend** → Variables:
   ```
   BACKEND_CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
   SALESFORCE_REDIRECT_URI=https://api.your-domain.com/auth/salesforce/callback
   ```

2. **Frontend** → Variables:
   ```
   NEXT_PUBLIC_API_URL=https://api.your-domain.com
   ```

**✅ Services will auto-redeploy**

---

### Phase 7: Create Salesforce Connected App (5 min)

1. **Salesforce Setup** → App Manager → New Connected App

2. **Fill in**:
   ```
   Name: AccessGraph AI
   Contact Email: your@email.com
   ```

3. **Enable OAuth**:
   - ✅ Enable OAuth Settings
   - Callback URL: `https://api.your-domain.com/auth/salesforce/callback`
   - Scopes:
     - ✅ Full access (full)
     - ✅ Manage user data via APIs (api)
     - ✅ Perform requests at any time (refresh_token)
     - ✅ Access unique user identifiers (openid)

4. **Save** → **Manage Consumer Details** → Copy:
   - Consumer Key
   - Consumer Secret

5. **Edit Policies**:
   - Permitted Users: All users may self-authorize
   - IP Relaxation: Relax IP restrictions

**✅ Credentials copied? Proceed**

---

### Phase 8: Add Salesforce Credentials (2 min)

Railway → **backend** → Variables:

```bash
SALESFORCE_CLIENT_ID=<your consumer key>
SALESFORCE_CLIENT_SECRET=<your consumer secret>
DEMO_MODE=false
```

**✅ Backend redeploys with real credentials**

---

### Phase 9: TEST! (5 min)

1. ⏳ **Wait for**:
   - DNS propagation complete (check dnschecker.org)
   - Railway SSL certificates active (green badge)

2. **Visit**: `https://your-domain.com`

3. **Click**: "Get Started" or "Connect Organization"

4. **Redirected to Salesforce** → Log in → Allow

5. **Redirected back** → Sync starts! 🎉

6. **Verify**:
   - Dashboard shows real user counts
   - Users page shows actual Salesforce users
   - Graph visualizes real access relationships

---

## ✅ Success Criteria

When deployment is complete, you should have:

- [x] Code on GitHub
- [x] Backend deployed on Railway with SSL
- [x] Frontend deployed on Railway with SSL
- [x] PostgreSQL database connected
- [x] Redis cache connected
- [x] Neo4j Aura connected
- [x] Custom domain with SSL (https://)
- [x] Salesforce Connected App created
- [x] OAuth flow working
- [x] Real Salesforce data syncing
- [x] All pages functional

---

## 🐛 Troubleshooting

### "redirect_uri_mismatch"
**Fix**: Check Salesforce callback URL matches `SALESFORCE_REDIRECT_URI` exactly

### CORS error
**Fix**: Update `BACKEND_CORS_ORIGINS` to include your domain

### DNS not working
**Wait**: Can take up to 48 hours (usually 30 min)

### SSL not provisioning
**Wait**: Railway provisions after DNS propagates (5-15 min)

---

## 💰 Total Cost

- Domain: $10-15/year
- Railway (free tier): $0/month
- Neo4j Aura (free): $0/month
- **Total Year 1**: ~$12

To upgrade to Railway Pro ($5/mo):
- More resources
- Higher limits
- Better for production

---

## 📚 Full Guides

For detailed step-by-step:

- **[RAILWAY_DEPLOY.md](./RAILWAY_DEPLOY.md)** - Detailed Railway guide
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - All platform options
- **[SALESFORCE_SETUP_GUIDE.md](./SALESFORCE_SETUP_GUIDE.md)** - Salesforce setup

---

## 🎉 You're Ready!

**Total time**: 45 minutes
**Active work**: 20 minutes
**Waiting**: 25 minutes (DNS)

**Let's deploy!** 🚀

Start with Phase 1 above ☝️
