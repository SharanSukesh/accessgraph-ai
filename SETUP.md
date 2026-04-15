# AccessGraph AI - Setup Guide

## 🎯 Quick Setup (5 minutes)

### Step 1: Clone and Configure

```bash
# If not already done
git clone https://github.com/your-org/accessgraph-ai.git
cd accessgraph-ai

# Create environment file
cp .env.example .env

# Edit .env file (use your favorite editor)
# IMPORTANT: Change default passwords!
nano .env
```

**Minimum required changes in `.env`:**
```bash
POSTGRES_PASSWORD=your_secure_password_here
NEO4J_PASSWORD=your_secure_password_here
```

### Step 2: Start Services

```bash
# Make scripts executable (Linux/Mac only)
chmod +x infrastructure/scripts/*.sh

# Start all services
./infrastructure/scripts/start-all.sh

# Or use Docker Compose directly
docker-compose up -d
```

**Wait 30-60 seconds for services to initialize.**

### Step 3: Verify

Open your browser:

1. **Frontend**: http://localhost:3000
   - Should show dashboard with health checks
   - All services should be "healthy" (green)

2. **Backend API**: http://localhost:8000
   - Should show: `{"service":"AccessGraph AI","version":"0.1.0","status":"running","docs":"/docs"}`

3. **API Documentation**: http://localhost:8000/docs
   - Interactive Swagger UI
   - Try the `/health` endpoint

4. **Neo4j Browser**: http://localhost:7474
   - Login with credentials from `.env`
   - Run test query: `RETURN 1`

### Step 4: Check Logs

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

**Success indicators:**
- Backend: `INFO: Application startup complete`
- Frontend: `Ready in X ms`
- No error messages in logs

---

## 🔧 Local Development Setup (No Docker)

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 16
- Neo4j 5.16
- Redis 7

### Backend Setup

```bash
cd apps/backend

# Create virtual environment
python -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate

# Activate (Windows)
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your local database URLs

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Backend should be running on http://localhost:8000**

### Frontend Setup

```bash
# From root directory
npm install

# Start frontend
cd apps/frontend
npm run dev
```

**Frontend should be running on http://localhost:3000**

---

## 🐳 Docker Compose Architecture

When you run `docker-compose up`, the following happens:

### 1. Infrastructure Services Start

```
PostgreSQL (postgres:16-alpine)
├─ Creates database: accessgraph
├─ Port: 5432
└─ Volume: postgres_data (persistent)

Neo4j (neo4j:5.16-community)
├─ Installs APOC & GDS plugins
├─ Ports: 7474 (HTTP), 7687 (Bolt)
└─ Volume: neo4j_data (persistent)

Redis (redis:7-alpine)
├─ Port: 6379
└─ Volume: redis_data (persistent)
```

### 2. Application Services Start

```
Backend (FastAPI)
├─ Waits for: postgres, neo4j, redis (health checks)
├─ Port: 8000
├─ Volume: ./apps/backend (hot-reload)
└─ Command: uvicorn app.main:app --reload

Frontend (Next.js)
├─ Waits for: backend
├─ Port: 3000
├─ Volume: ./apps/frontend (hot-reload)
└─ Command: npm run dev
```

### 3. Network

All services on isolated network: `accessgraph-network`

---

## 🔍 Troubleshooting

### Services Won't Start

**Error: Port already in use**
```bash
# Check what's using the port
lsof -i :3000  # or :8000, :5432, etc.

# Change port in docker-compose.yml
ports:
  - "3001:3000"  # Change left side
```

**Error: Cannot connect to Docker daemon**
```bash
# Start Docker Desktop
# Or on Linux:
sudo systemctl start docker
```

### Database Connection Issues

**Backend can't connect to PostgreSQL**
```bash
# Check if PostgreSQL is healthy
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Test connection manually
docker-compose exec postgres psql -U accessgraph -d accessgraph
```

**Backend can't connect to Neo4j**
```bash
# Check Neo4j status
docker-compose ps neo4j

# Check Neo4j logs
docker-compose logs neo4j

# Common issue: Neo4j takes 20-30s to fully start
# Solution: Wait, then restart backend
docker-compose restart backend
```

### Frontend Issues

**Frontend shows "Failed to fetch"**
- Check backend is running: http://localhost:8000/health
- Check CORS configuration in backend
- Check `NEXT_PUBLIC_API_URL` in `.env`

**Hot reload not working**
```bash
# Rebuild frontend container
docker-compose build frontend
docker-compose up -d frontend
```

### Clean Slate

**Reset everything (⚠️ deletes data)**
```bash
# Stop and remove containers + volumes
docker-compose down -v

# Remove all images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

---

## 📊 Verify Installation

### Health Check Checklist

Run through this checklist to verify everything works:

- [ ] Docker containers running: `docker-compose ps`
- [ ] Backend health: http://localhost:8000/health
- [ ] Backend readiness: http://localhost:8000/health/ready
- [ ] Frontend loads: http://localhost:3000
- [ ] API docs: http://localhost:8000/docs
- [ ] Neo4j browser: http://localhost:7474
- [ ] PostgreSQL accessible: `docker-compose exec postgres psql -U accessgraph`
- [ ] Redis accessible: `docker-compose exec redis redis-cli ping`
- [ ] All health checks "healthy" on frontend dashboard

### Test Basic Functionality

**1. Test Backend API**
```bash
# Health check
curl http://localhost:8000/health

# Expected response:
# {"status":"ok","service":"accessgraph-backend","version":"0.1.0"}

# Readiness check
curl http://localhost:8000/health/ready

# Expected: All dependencies "healthy"
```

**2. Test Frontend**
- Navigate to http://localhost:3000
- Toggle dark/light theme
- Click sidebar items (pages don't exist yet, expected)
- Verify health check cards show "healthy"

**3. Test Database Connections**
```bash
# PostgreSQL
docker-compose exec postgres psql -U accessgraph -d accessgraph -c "SELECT 1;"

# Neo4j
docker-compose exec neo4j cypher-shell -u neo4j -p YOUR_PASSWORD "RETURN 1;"

# Redis
docker-compose exec redis redis-cli ping
# Should respond: PONG
```

---

## 🚀 Next Steps After Setup

1. **Explore the API**
   - Visit http://localhost:8000/docs
   - Try the `/health` and `/health/ready` endpoints

2. **Customize Configuration**
   - Review `.env` file
   - Adjust resource limits in `docker-compose.yml`

3. **Start Development**
   - Read [CONTRIBUTING.md](CONTRIBUTING.md)
   - Review [ARCHITECTURE.md](ARCHITECTURE.md)
   - Check [README.md](README.md) for next implementation steps

4. **Create Your First Migration**
   ```bash
   ./infrastructure/scripts/create-migration.sh "initial schema"
   ./infrastructure/scripts/run-migrations.sh
   ```

---

## 💡 Tips

**Development Workflow:**
1. Make changes to code
2. Backend: Auto-reloads (see logs)
3. Frontend: Hot reloads (refresh browser if needed)
4. Check logs: `docker-compose logs -f`

**Useful Commands:**
```bash
# Restart a service
docker-compose restart backend

# View logs
docker-compose logs -f backend frontend

# Execute command in container
docker-compose exec backend bash
docker-compose exec frontend sh

# Stop all services
./infrastructure/scripts/stop-all.sh

# Clean up
docker-compose down -v
```

**Performance Tips:**
- Allocate more memory to Docker Desktop (8GB+ recommended)
- Use Docker volumes for persistence
- Enable BuildKit for faster builds: `export DOCKER_BUILDKIT=1`

---

## 🆘 Getting Help

**Issues?**
1. Check logs: `docker-compose logs -f`
2. Review this guide's troubleshooting section
3. Search [GitHub Issues](https://github.com/your-org/accessgraph-ai/issues)
4. Open a new issue with logs and error messages

**Documentation:**
- [README.md](README.md) - Project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute

---

**Happy coding! 🎉**
