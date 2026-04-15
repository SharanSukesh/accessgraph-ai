# 🚀 Deployment Guide - AccessGraph AI

This guide covers deploying AccessGraph AI to production with a custom domain for Salesforce OAuth.

---

## 🎯 Recommended Option: Railway (Fastest, Easiest)

Railway is perfect for quick deployment with automatic SSL, custom domains, and managed databases.

**Why Railway:**
- ✅ Free tier available
- ✅ Automatic HTTPS/SSL certificates
- ✅ Custom domain support (required for Salesforce)
- ✅ Managed PostgreSQL, Redis, Neo4j
- ✅ GitHub auto-deploy
- ✅ Zero DevOps required

**Time to deploy:** ~15 minutes

### Step 1: Prepare Your Repository

1. **Initialize Git** (if not already):
```bash
cd C:\Users\shara\SalesforceAccess
git init
git add .
git commit -m "Initial commit - AccessGraph AI"
```

2. **Push to GitHub**:
```bash
# Create a new repo on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/accessgraph-ai.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Railway

1. **Sign up** at https://railway.app (use GitHub login)

2. **Create New Project** → **Deploy from GitHub repo**
   - Select your `accessgraph-ai` repository

3. **Add Services** (click "+ New" for each):

   **a) PostgreSQL**
   - Click "+ New"
   - Select "Database" → "Add PostgreSQL"
   - Railway will auto-provision

   **b) Redis**
   - Click "+ New"
   - Select "Database" → "Add Redis"
   - Railway will auto-provision

   **c) Backend Service**
   - Click "+ New"
   - Select "GitHub Repo" → Choose your repo
   - Set **Root Directory**: `apps/backend`
   - Set **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

   **d) Frontend Service**
   - Click "+ New"
   - Select "GitHub Repo" → Choose your repo
   - Set **Root Directory**: `apps/frontend`
   - Set **Build Command**: `npm run build`
   - Set **Start Command**: `npm start`

4. **Configure Environment Variables**

   **Backend Service Variables:**
   ```bash
   # Database (auto-filled by Railway)
   DATABASE_URL=${{Postgres.DATABASE_URL}}

   # Redis (auto-filled by Railway)
   REDIS_URL=${{Redis.REDIS_URL}}

   # Neo4j (we'll use Neo4j Aura - see Step 3)
   NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your_neo4j_password

   # Backend Config
   BACKEND_HOST=0.0.0.0
   BACKEND_PORT=$PORT
   BACKEND_LOG_LEVEL=info
   BACKEND_CORS_ORIGINS=https://your-domain.com

   # Salesforce OAuth (fill after buying domain)
   SALESFORCE_CLIENT_ID=your_salesforce_client_id
   SALESFORCE_CLIENT_SECRET=your_salesforce_client_secret
   SALESFORCE_REDIRECT_URI=https://api.your-domain.com/auth/salesforce/callback
   SALESFORCE_LOGIN_URL=https://login.salesforce.com

   # Demo Mode
   DEMO_MODE=false
   ```

   **Frontend Service Variables:**
   ```bash
   # API URL (Railway backend URL)
   NEXT_PUBLIC_API_URL=https://api.your-domain.com
   NEXT_PUBLIC_APP_NAME=AccessGraph AI
   NODE_ENV=production
   ```

5. **Generate Domains**
   - Click on **Backend** service → **Settings** → **Generate Domain**
   - Copy the URL (e.g., `accessgraph-backend-production.up.railway.app`)
   - Click on **Frontend** service → **Settings** → **Generate Domain**
   - Copy the URL (e.g., `accessgraph-frontend-production.up.railway.app`)

### Step 3: Setup Neo4j Aura (Free Cloud Graph Database)

1. Go to https://neo4j.com/cloud/aura/
2. Sign up (free tier available)
3. Create **Free Instance**
   - Name: AccessGraph AI
   - Region: Choose closest to you
4. Copy credentials:
   - Connection URI: `neo4j+s://xxxxx.databases.neo4j.io`
   - Username: `neo4j`
   - Password: (shown once - save it!)
5. Add these to Railway Backend environment variables

### Step 4: Buy a Custom Domain

**Option A: Namecheap** (recommended, cheap)
- Go to https://www.namecheap.com
- Search for a domain (e.g., `accessgraph-ai.com`)
- Cost: ~$10-15/year
- Buy it

**Option B: Google Domains / Cloudflare / GoDaddy**
- Similar process

### Step 5: Configure Custom Domain in Railway

1. **For Backend API:**
   - Go to Railway → Backend Service → Settings → Domains
   - Click "Custom Domain"
   - Enter: `api.your-domain.com`
   - Railway will show DNS records to add

2. **For Frontend:**
   - Go to Railway → Frontend Service → Settings → Domains
   - Click "Custom Domain"
   - Enter: `your-domain.com` and `www.your-domain.com`
   - Railway will show DNS records to add

3. **Add DNS Records** (in your domain registrar):
   ```
   Type    Name    Value
   CNAME   api     accessgraph-backend-production.up.railway.app
   CNAME   www     accessgraph-frontend-production.up.railway.app
   CNAME   @       accessgraph-frontend-production.up.railway.app
   ```

4. **Wait for DNS** (5-60 minutes)
5. **Railway auto-provisions SSL** certificates ✅

### Step 6: Update Salesforce Connected App

1. Go to Salesforce → Setup → App Manager → Your Connected App
2. Edit **Callback URL**:
   - Change from: `http://localhost:8000/auth/salesforce/callback`
   - To: `https://api.your-domain.com/auth/salesforce/callback`
3. Save

### Step 7: Update Railway Environment Variables

Update these in Railway Backend:
```bash
BACKEND_CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
SALESFORCE_REDIRECT_URI=https://api.your-domain.com/auth/salesforce/callback
```

Update in Railway Frontend:
```bash
NEXT_PUBLIC_API_URL=https://api.your-domain.com
```

### Step 8: Test!

1. Visit `https://your-domain.com`
2. Click "Connect Organization"
3. Authenticate with Salesforce
4. You should be redirected back and synced! 🎉

---

## Alternative Option 2: Render (Similar to Railway)

Render is another excellent platform with similar features.

**Quick Deploy:**
1. Go to https://render.com
2. Create **PostgreSQL** instance (free tier)
3. Create **Redis** instance (free tier)
4. Create **Web Service** for backend
   - Connect GitHub repo
   - Root: `apps/backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Create **Web Service** for frontend
   - Root: `apps/frontend`
   - Build: `npm install && npm run build`
   - Start: `npm start`
6. Add custom domains
7. Configure environment variables (same as Railway)

---

## Alternative Option 3: Heroku (Classic Option)

**Cost:** ~$7/month for hobby dynos

```bash
# Install Heroku CLI
# From: https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Create apps
heroku create accessgraph-backend
heroku create accessgraph-frontend

# Add databases
heroku addons:create heroku-postgresql:mini -a accessgraph-backend
heroku addons:create heroku-redis:mini -a accessgraph-backend

# Set environment variables
heroku config:set SALESFORCE_CLIENT_ID=xxx -a accessgraph-backend
heroku config:set SALESFORCE_CLIENT_SECRET=xxx -a accessgraph-backend
# ... (all other env vars)

# Deploy
git push heroku main

# Add custom domain
heroku domains:add api.your-domain.com -a accessgraph-backend
heroku domains:add your-domain.com -a accessgraph-frontend
```

---

## Alternative Option 4: AWS / GCP / Azure (Full Control)

For enterprise deployments with full control:

### AWS (Using ECS + RDS)

**Services needed:**
- ECS (Elastic Container Service) - Run containers
- RDS PostgreSQL - Database
- ElastiCache Redis - Cache
- EC2 (for Neo4j) or use Neo4j Aura
- ALB (Application Load Balancer) - SSL termination
- Route 53 - DNS
- ACM (Certificate Manager) - SSL certificates

**Estimated cost:** ~$50-100/month

**Deployment steps:**
1. Push Docker images to ECR
2. Create RDS PostgreSQL instance
3. Create ElastiCache Redis cluster
4. Create ECS cluster and task definitions
5. Configure ALB with SSL
6. Point Route 53 to ALB
7. Deploy containers

See `AWS_DEPLOYMENT.md` for detailed guide.

---

## Alternative Option 5: DigitalOcean App Platform

**Quick Deploy:**
1. Go to https://cloud.digitalocean.com
2. Create App
3. Connect GitHub repo
4. Add components:
   - Backend (apps/backend)
   - Frontend (apps/frontend)
   - PostgreSQL database
   - Redis database
5. Add custom domain
6. Deploy

**Cost:** ~$12/month

---

## Alternative Option 6: VPS (Maximum Control)

Deploy to a single VPS using Docker Compose.

**Providers:** DigitalOcean, Linode, Vultr, Hetzner
**Cost:** ~$6-12/month

**Steps:**

1. **Create VPS** (Ubuntu 22.04, 2GB RAM minimum)

2. **Install Docker**:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

3. **Clone repo**:
```bash
git clone https://github.com/YOUR_USERNAME/accessgraph-ai.git
cd accessgraph-ai
```

4. **Create production .env**:
```bash
cp .env.example .env
nano .env
# Fill in all values with production settings
```

5. **Update docker-compose.yml** for production:
```bash
# Remove port bindings except for a reverse proxy
# Add Caddy for automatic SSL
```

6. **Install Caddy** (automatic SSL):
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

7. **Create Caddyfile**:
```bash
sudo nano /etc/caddy/Caddyfile
```

```
api.your-domain.com {
    reverse_proxy localhost:8000
}

your-domain.com {
    reverse_proxy localhost:3000
}

www.your-domain.com {
    reverse_proxy localhost:3000
}
```

8. **Start services**:
```bash
docker-compose up -d
sudo systemctl restart caddy
```

9. **Point DNS to VPS IP**:
```
Type    Name    Value
A       @       YOUR_VPS_IP
A       api     YOUR_VPS_IP
A       www     YOUR_VPS_IP
```

10. Caddy automatically provisions SSL! ✅

---

## Recommended: Railway (15-Minute Deployment)

For getting up and running FAST with Salesforce OAuth:

1. **Now (5 min)**: Push code to GitHub
2. **Now (5 min)**: Deploy to Railway, add databases
3. **Now (5 min)**: Buy domain, configure DNS
4. **Wait (30 min)**: DNS propagation
5. **Then (5 min)**: Update Salesforce callback URL
6. **Test**: Connect real org! 🎉

**Total active time:** 20 minutes
**Total wait time:** 30 minutes for DNS

---

## Production Checklist

Before going live:

- [ ] Custom domain purchased and configured
- [ ] SSL/HTTPS enabled (automatic with Railway/Render)
- [ ] Environment variables set (no defaults!)
- [ ] Database backups enabled
- [ ] Monitoring setup (Railway has built-in)
- [ ] Salesforce Connected App callback URL updated
- [ ] CORS origins configured correctly
- [ ] Strong database passwords set
- [ ] `DEMO_MODE=false` in backend
- [ ] Test OAuth flow end-to-end
- [ ] Test data sync from real Salesforce org

---

## Cost Comparison

| Platform | Monthly Cost | Setup Time | Difficulty |
|----------|-------------|------------|------------|
| Railway (Free) | $0 | 15 min | ⭐ Easy |
| Railway (Pro) | $5 | 15 min | ⭐ Easy |
| Render | $0-7 | 20 min | ⭐ Easy |
| Heroku | $7-16 | 30 min | ⭐⭐ Medium |
| DigitalOcean | $12 | 30 min | ⭐⭐ Medium |
| VPS + Docker | $6 | 60 min | ⭐⭐⭐ Hard |
| AWS ECS | $50-100 | 4 hours | ⭐⭐⭐⭐ Expert |

---

## Domain Recommendations

**Cheap domains:**
- `.com` - $10-15/year (Namecheap, Porkbun)
- `.io` - $30-40/year (developer-friendly)
- `.app` - $12-20/year (Google)
- `.dev` - $12-20/year (Google)
- `.ai` - $60-80/year (AI/ML themed)

**Suggested names:**
- `accessgraph.ai`
- `sfaccess.io`
- `salesforce-security.app`
- `your-company-access.com`

---

## Next Steps

**Recommended path:**

1. ✅ **Push to GitHub** (5 min)
2. ✅ **Deploy to Railway** (10 min)
3. ✅ **Setup Neo4j Aura** (5 min)
4. ✅ **Buy domain** (5 min)
5. ⏳ **Configure DNS** (5 min active, 30 min wait)
6. ✅ **Update Salesforce** (5 min)
7. ✅ **Test with real org** (10 min)

**Total: ~45 minutes to production!**

---

Need help? Let me know which platform you'd like to use and I'll provide detailed step-by-step instructions!
