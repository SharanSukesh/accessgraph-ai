# Quick Reference Guide

## 🚀 Common Commands

### Docker Operations

```bash
# Start everything
docker-compose up -d

# Start with logs
docker-compose up

# Stop everything
docker-compose down

# Restart a service
docker-compose restart backend

# View logs
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f frontend

# Rebuild and start
docker-compose up -d --build

# Clean everything (⚠️ deletes data)
docker-compose down -v
```

### Using Scripts

```bash
# Make executable first (Linux/Mac)
chmod +x infrastructure/scripts/*.sh

# Start all services
./infrastructure/scripts/start-all.sh

# Stop all services
./infrastructure/scripts/stop-all.sh

# Run migrations
./infrastructure/scripts/run-migrations.sh

# Create migration
./infrastructure/scripts/create-migration.sh "description"

# Start backend locally
./infrastructure/scripts/start-backend.sh

# Start frontend locally
./infrastructure/scripts/start-frontend.sh
```

### Backend Development

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

# Run server
uvicorn app.main:app --reload

# Run tests
pytest tests/ --cov=app

# Lint
ruff check .

# Type check
mypy app

# Format code
black .
```

### Frontend Development

```bash
cd apps/frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Build
npm run build

# Lint
npm run lint

# Type check
npm run type-check
```

### Database Operations

```bash
# PostgreSQL
docker-compose exec postgres psql -U accessgraph -d accessgraph

# Neo4j Cypher Shell
docker-compose exec neo4j cypher-shell -u neo4j -p PASSWORD

# Redis CLI
docker-compose exec redis redis-cli

# Backup PostgreSQL
docker-compose exec postgres pg_dump -U accessgraph > backup.sql

# Restore PostgreSQL
docker-compose exec -T postgres psql -U accessgraph < backup.sql
```

### Migrations

```bash
cd apps/backend

# Create new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# View current version
alembic current

# View migration history
alembic history
```

---

## 📍 Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js application |
| Backend API | http://localhost:8000 | FastAPI service |
| API Docs | http://localhost:8000/docs | Swagger UI |
| ReDoc | http://localhost:8000/redoc | Alternative API docs |
| Health Check | http://localhost:8000/health | Simple health |
| Readiness | http://localhost:8000/health/ready | Full health check |
| Neo4j Browser | http://localhost:7474 | Graph database UI |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |

---

## 🔑 Environment Variables

### Required

```bash
# PostgreSQL
POSTGRES_PASSWORD=your_password

# Neo4j
NEO4J_PASSWORD=your_password

# Backend
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
NEO4J_URI=bolt://localhost:7687
REDIS_URL=redis://localhost:6379/0

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Optional

```bash
BACKEND_LOG_LEVEL=info|debug|warning|error
BACKEND_CORS_ORIGINS=http://localhost:3000,http://example.com
NEXT_PUBLIC_APP_NAME=AccessGraph AI
```

---

## 📁 File Locations

### Configuration Files

```
.env                          # Root environment (Docker)
apps/backend/.env            # Backend environment (local dev)
apps/frontend/.env.local     # Frontend environment (local dev)
docker-compose.yml           # Docker orchestration
```

### Application Code

```
apps/backend/app/main.py              # Backend entry point
apps/frontend/src/app/page.tsx        # Frontend home page
apps/backend/app/core/config.py       # Backend config
apps/backend/app/db/session.py        # Database session
apps/frontend/src/lib/api/client.ts   # API client
```

### Scripts

```
infrastructure/scripts/start-all.sh        # Start services
infrastructure/scripts/stop-all.sh         # Stop services
infrastructure/scripts/run-migrations.sh   # Run migrations
```

### Documentation

```
README.md           # Project overview
SETUP.md           # Setup instructions
ARCHITECTURE.md    # Architecture details
CONTRIBUTING.md    # Contribution guide
PROJECT_SUMMARY.md # Scaffolding summary
```

---

## 🐛 Troubleshooting Quick Fixes

### Port Already in Use

```bash
# Find process using port
lsof -i :3000
lsof -i :8000

# Kill process
kill -9 PID

# Or change port in docker-compose.yml
```

### Backend Won't Connect to DB

```bash
# Check if DB is running
docker-compose ps postgres

# Restart backend
docker-compose restart backend

# View backend logs
docker-compose logs backend
```

### Frontend Can't Reach Backend

```bash
# Check backend is running
curl http://localhost:8000/health

# Check CORS settings in apps/backend/app/core/config.py
# Check NEXT_PUBLIC_API_URL in .env
```

### Docker Issues

```bash
# Restart Docker
# On Mac: Restart Docker Desktop
# On Linux: sudo systemctl restart docker

# Clean Docker cache
docker system prune -a

# Remove all volumes (⚠️ deletes data)
docker-compose down -v
docker volume prune
```

### Migration Issues

```bash
# Check current version
cd apps/backend
alembic current

# Downgrade and retry
alembic downgrade -1
alembic upgrade head

# Generate fresh migration
alembic revision --autogenerate -m "fix"
```

---

## 🧪 Testing Quick Reference

### Backend Tests

```bash
cd apps/backend

# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific test file
pytest tests/test_health.py

# Run with verbose output
pytest -v

# Run and stop on first failure
pytest -x
```

### Frontend Tests (Future)

```bash
cd apps/frontend

# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

---

## 📊 Health Check Responses

### Successful Health Check

```json
{
  "status": "ok",
  "service": "accessgraph-backend",
  "version": "0.1.0"
}
```

### Successful Readiness Check

```json
{
  "status": "ready",
  "service": "accessgraph-backend",
  "version": "0.1.0",
  "checks": {
    "postgres": "healthy",
    "neo4j": "healthy",
    "redis": "healthy"
  }
}
```

### Failed Readiness Check

```json
{
  "status": "not_ready",
  "service": "accessgraph-backend",
  "version": "0.1.0",
  "checks": {
    "postgres": "healthy",
    "neo4j": "unhealthy",
    "redis": "healthy"
  }
}
```

---

## 🔍 Useful Queries

### PostgreSQL

```sql
-- List all tables
\dt

-- Describe table
\d table_name

-- Check connection
SELECT 1;

-- List databases
\l

-- List users
\du
```

### Neo4j Cypher

```cypher
// Check connection
RETURN 1;

// List all node labels
CALL db.labels();

// List all relationship types
CALL db.relationshipTypes();

// Count all nodes
MATCH (n) RETURN count(n);

// Show database info
CALL dbms.components();
```

### Redis

```bash
# Ping
PING

# Get all keys
KEYS *

# Get value
GET key_name

# Delete key
DEL key_name

# Flush all data (⚠️ deletes everything)
FLUSHALL
```

---

## 📦 Package Management

### Python

```bash
# Add dependency
echo "package-name==1.0.0" >> apps/backend/requirements.txt
pip install -r apps/backend/requirements.txt

# Update all packages
pip list --outdated
pip install --upgrade package-name

# Freeze dependencies
pip freeze > apps/backend/requirements.txt
```

### Node.js

```bash
# Add dependency
npm install package-name

# Add dev dependency
npm install --save-dev package-name

# Update dependencies
npm update

# Check outdated
npm outdated

# Install specific version
npm install package-name@1.0.0
```

---

## 🎨 Code Snippets

### Add New Backend Endpoint

```python
# apps/backend/app/api/routes/users.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_database

router = APIRouter()

@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_database)):
    # Your logic here
    return {"users": []}
```

### Add New Frontend Page

```typescript
// apps/frontend/src/app/users/page.tsx
export default function UsersPage() {
  return (
    <div>
      <h1>Users</h1>
    </div>
  )
}
```

### Create Database Model

```python
# apps/backend/app/domain/models.py
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
```

---

## 💡 Pro Tips

1. **Use the scripts** - They handle environment setup automatically
2. **Check logs first** - `docker-compose logs -f` shows everything
3. **Hot reload works** - No need to restart containers for code changes
4. **Use health checks** - Visit `/health/ready` to debug connection issues
5. **Read the docs** - All major topics are covered in markdown files

---

## 🆘 Get Help

1. Check this quick reference
2. Review [SETUP.md](SETUP.md) for detailed setup
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) for system design
4. Check logs: `docker-compose logs -f`
5. Open GitHub issue with logs

---

**Keep this file bookmarked for quick access! 🔖**
