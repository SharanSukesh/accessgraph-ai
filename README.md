# AccessGraph AI

> **Enterprise Access Intelligence Platform**
> Visualize, analyze, and secure your organization's access landscape with AI-powered insights.

[![CI](https://github.com/your-org/accessgraph-ai/workflows/CI/badge.svg)](https://github.com/your-org/accessgraph-ai/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 🎯 Overview

**AccessGraph AI** is a modern, production-grade platform for analyzing and visualizing enterprise access patterns. It combines graph database technology, machine learning, and intuitive UI to help security teams:

- 🕸️ **Visualize** complex access relationships across your organization
- 🔍 **Detect** anomalous access patterns and security risks
- ⚠️ **Assess** risk scores for users, roles, and permissions
- 💡 **Recommend** intelligent remediation actions
- 🔗 **Integrate** seamlessly with Salesforce and other platforms

---

## 🏗️ Architecture

This is a **monorepo** containing:

```
accessgraph-ai/
├── apps/
│   ├── backend/          # Python FastAPI service
│   └── frontend/         # Next.js TypeScript application
├── packages/
│   ├── shared-types/     # TypeScript API contracts
│   └── shared-config/    # Shared constants and configuration
└── infrastructure/       # Docker, scripts, CI/CD
```

### Tech Stack

**Backend:**
- Python 3.12
- FastAPI (async web framework)
- SQLAlchemy + PostgreSQL (relational data)
- Neo4j (graph database)
- Redis (caching & queues)
- Alembic (database migrations)

**Frontend:**
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- React Server Components

**Infrastructure:**
- Docker & Docker Compose
- GitHub Actions (CI/CD)
- Monorepo workspace structure

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Docker** (20.10+) and **Docker Compose** (2.0+)
- **Node.js** (18+) and **npm** (9+)
- **Python** (3.12+) - for local development
- **Git**

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/accessgraph-ai.git
cd accessgraph-ai
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
# At minimum, update database passwords
```

### 3. Start All Services (Docker)

```bash
# Make scripts executable (Linux/Mac)
chmod +x infrastructure/scripts/*.sh

# Start everything
./infrastructure/scripts/start-all.sh

# Or use Docker Compose directly
docker-compose up -d
```

**Services will be available at:**

| Service      | URL                          |
|--------------|------------------------------|
| Frontend     | http://localhost:3000        |
| Backend API  | http://localhost:8000        |
| API Docs     | http://localhost:8000/docs   |
| Neo4j UI     | http://localhost:7474        |
| PostgreSQL   | localhost:5432               |
| Redis        | localhost:6379               |

### 4. Verify Setup

Visit http://localhost:3000 - you should see the dashboard with health checks showing all services as "healthy".

---

## 💻 Development

### Running Services Individually

**Backend (Python/FastAPI):**

```bash
# Create virtual environment
cd apps/backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload

# Or use the script
cd ../..
./infrastructure/scripts/start-backend.sh
```

**Frontend (Next.js):**

```bash
# Install dependencies
npm install

# Start dev server
cd apps/frontend
npm run dev

# Or use the script
cd ../..
./infrastructure/scripts/start-frontend.sh
```

### Database Migrations

**Create a new migration:**

```bash
./infrastructure/scripts/create-migration.sh "add user table"
```

**Apply migrations:**

```bash
./infrastructure/scripts/run-migrations.sh
```

**Rollback migration:**

```bash
cd apps/backend
alembic downgrade -1
```

---

## 📁 Project Structure

### Backend (`apps/backend`)

```
apps/backend/
├── app/
│   ├── api/              # API routes and endpoints
│   │   ├── routes/       # Route handlers (health, users, etc.)
│   │   └── deps.py       # Dependency injection
│   ├── core/             # Core configuration
│   │   ├── config.py     # Environment-based settings
│   │   └── logging.py    # Structured logging setup
│   ├── db/               # Database layer
│   │   ├── session.py    # PostgreSQL session management
│   │   ├── neo4j_client.py  # Neo4j client
│   │   ├── redis_client.py  # Redis client
│   │   └── base.py       # SQLAlchemy base models
│   ├── domain/           # Domain models (future)
│   ├── services/         # Business logic (future)
│   └── main.py           # FastAPI application entry
├── alembic/              # Database migrations
├── tests/                # Test suite
├── Dockerfile
├── requirements.txt
└── alembic.ini
```

### Frontend (`apps/frontend`)

```
apps/frontend/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── layout.tsx    # Root layout
│   │   ├── page.tsx      # Home page
│   │   └── globals.css   # Global styles
│   ├── components/       # React components
│   │   ├── layout/       # Layout components (Navbar, Sidebar)
│   │   └── shared/       # Reusable components (ThemeToggle)
│   └── lib/              # Utilities
│       ├── api/          # API client
│       └── types/        # Type definitions
├── public/               # Static assets
├── Dockerfile
├── package.json
├── next.config.js
└── tailwind.config.ts
```

### Shared Packages

**`packages/shared-types`** - TypeScript type definitions shared between frontend and backend API contracts.

**`packages/shared-config`** - Constants, enums, and configuration shared across services.

---

## 🌍 Environment Variables

### Root `.env` (Docker Compose)

```bash
# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=accessgraph
POSTGRES_USER=accessgraph
POSTGRES_PASSWORD=change_me_in_production

# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=change_me_in_production

# Redis
REDIS_URL=redis://redis:6379/0

# Backend
BACKEND_URL=http://localhost:8000
BACKEND_CORS_ORIGINS=http://localhost:3000

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_NAME=AccessGraph AI
```

See [`.env.example`](.env.example) for complete list.

---

## 🧪 Testing

**Backend tests:**

```bash
cd apps/backend
pytest tests/ --cov=app
```

**Frontend tests:**

```bash
cd apps/frontend
npm run test
```

**Type checking:**

```bash
# Backend
cd apps/backend
mypy app

# Frontend
cd apps/frontend
npm run type-check
```

---

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose build --no-cache

# Remove volumes (⚠️ deletes data)
docker-compose down -v

# Execute command in container
docker-compose exec backend bash
docker-compose exec frontend sh
```

---

## 🛠️ Useful Scripts

| Script | Description |
|--------|-------------|
| `infrastructure/scripts/start-all.sh` | Start all services with Docker |
| `infrastructure/scripts/stop-all.sh` | Stop all Docker services |
| `infrastructure/scripts/start-backend.sh` | Run backend locally (no Docker) |
| `infrastructure/scripts/start-frontend.sh` | Run frontend locally (no Docker) |
| `infrastructure/scripts/run-migrations.sh` | Apply database migrations |
| `infrastructure/scripts/create-migration.sh` | Create new migration file |

---

## 🚧 What's NOT Implemented Yet

This is a **scaffolded foundation**. The following are intentionally left for future implementation:

### Backend
- ❌ Business logic (graph processing, risk scoring)
- ❌ Salesforce integration/ingestion
- ❌ Anomaly detection algorithms
- ❌ Recommendation engine
- ❌ Authentication & authorization
- ❌ Real API endpoints beyond health checks

### Frontend
- ❌ Dashboard pages (users, organizations, graph visualization)
- ❌ Risk analysis UI
- ❌ Anomaly detection dashboard
- ❌ Settings and configuration pages
- ❌ Authentication flows
- ❌ Graph visualization components

### Infrastructure
- ❌ Production deployment configuration
- ❌ Kubernetes manifests
- ❌ Monitoring & observability (Prometheus, Grafana)
- ❌ Load balancing & scaling

---

## 🎯 Next Steps

After scaffolding is complete, implement in this order:

1. **Backend Foundation**
   - Define SQLAlchemy models for Org, User, Permission
   - Create CRUD endpoints for basic entities
   - Set up authentication (JWT)

2. **Graph Layer**
   - Design Neo4j schema
   - Implement graph ingestion from Salesforce
   - Create graph query utilities

3. **Risk Analysis**
   - Implement risk scoring algorithms
   - Build anomaly detection service
   - Create recommendation engine

4. **Frontend Dashboard**
   - Build organization dashboard
   - Implement user management UI
   - Create graph visualization component

5. **Integration**
   - Salesforce OAuth & API integration
   - Real-time data sync
   - Webhook handlers

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙋 Support

- **Documentation:** [Coming soon]
- **Issues:** [GitHub Issues](https://github.com/your-org/accessgraph-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-org/accessgraph-ai/discussions)

---

## 🎉 Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/)
- [Next.js](https://nextjs.org/)
- [Neo4j](https://neo4j.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Made with ❤️ for enterprise security teams**
