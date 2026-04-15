# AccessGraph AI - Architecture Documentation

## System Overview

AccessGraph AI is a modern, microservices-based platform for enterprise access intelligence. The system is designed with scalability, maintainability, and developer experience in mind.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│              Next.js 14 + TypeScript + Tailwind             │
│                    (Port 3000)                               │
└────────────────┬────────────────────────────────────────────┘
                 │ REST API
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
│              FastAPI + Python 3.12                           │
│                    (Port 8000)                               │
└─────┬──────────────┬──────────────┬────────────────────────┘
      │              │              │
      ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Neo4j   │  │  Redis   │
│(Port 5432│  │(Port 7687│  │(Port 6379│
└──────────┘  └──────────┘  └──────────┘
```

## Component Breakdown

### 1. Frontend (Next.js)

**Technology:** Next.js 14 with App Router, TypeScript, Tailwind CSS

**Responsibilities:**
- User interface and experience
- Client-side state management
- API consumption via type-safe client
- Server-side rendering for optimal performance

**Key Features:**
- Dark/light theme support
- Responsive design
- Type-safe API client
- Shared component library

**Directory Structure:**
```
src/
├── app/              # Next.js App Router pages
├── components/       # React components
│   ├── layout/      # Layout components
│   └── shared/      # Reusable components
└── lib/             # Utilities
    ├── api/         # API client
    └── types/       # Type definitions
```

### 2. Backend (FastAPI)

**Technology:** Python 3.12, FastAPI, async/await

**Responsibilities:**
- RESTful API endpoints
- Business logic orchestration
- Data validation and serialization
- Database operations coordination
- Graph queries and analysis

**Key Features:**
- Async request handling
- Automatic API documentation (OpenAPI)
- Dependency injection
- Structured logging
- Environment-based configuration

**Directory Structure:**
```
app/
├── api/              # API layer
│   ├── routes/      # Endpoint handlers
│   └── deps.py      # Dependencies
├── core/            # Core configuration
│   ├── config.py   # Settings
│   └── logging.py  # Logging setup
├── db/              # Database layer
│   ├── session.py  # PostgreSQL
│   ├── neo4j_client.py  # Neo4j
│   └── redis_client.py  # Redis
├── domain/          # Domain models
├── services/        # Business logic
└── main.py          # Application entry
```

### 3. PostgreSQL Database

**Purpose:** Primary relational data store

**Stores:**
- Organizations
- Users
- Permissions
- Audit logs
- System configuration

**Migration Tool:** Alembic

**Connection:** Async via SQLAlchemy + asyncpg

### 4. Neo4j Graph Database

**Purpose:** Graph-based access relationships

**Stores:**
- User → Role relationships
- Role → Permission relationships
- Hierarchical structures
- Access paths
- Risk propagation graphs

**Query Language:** Cypher

**Connection:** Async Python driver

### 5. Redis Cache

**Purpose:** Caching and job queues

**Uses:**
- API response caching
- Session storage (future)
- Background job queues (future)
- Rate limiting (future)

**Connection:** redis-py (async)

## Data Flow

### 1. User Request Flow

```
User Browser
    ↓
Next.js Frontend (SSR/CSR)
    ↓
API Client (fetch wrapper)
    ↓
FastAPI Backend
    ↓
┌─────────────────────────┐
│ Dependency Injection    │
│ - Database Session      │
│ - Neo4j Client          │
│ - Redis Client          │
└─────────────────────────┘
    ↓
Business Logic (Services)
    ↓
Database Queries
    ↓
Response (JSON)
```

### 2. Data Ingestion Flow (Future)

```
Salesforce API
    ↓
Background Job (Celery/ARQ)
    ↓
ETL Pipeline
    ↓
┌──────────────┬──────────────┐
│ PostgreSQL   │    Neo4j     │
│ (Entities)   │ (Relationships)
└──────────────┴──────────────┘
    ↓
Risk Calculation
    ↓
Anomaly Detection
    ↓
Recommendations
```

## Security Architecture

### Authentication (Future Implementation)

- **Method:** JWT tokens
- **Storage:** HTTP-only cookies
- **Refresh:** Refresh token rotation
- **Authorization:** Role-based access control (RBAC)

### Data Protection

- **Encryption at rest:** Database-level encryption
- **Encryption in transit:** TLS/HTTPS
- **Secrets management:** Environment variables + Vault (future)

### API Security

- **CORS:** Configured origins
- **Rate limiting:** Redis-based (future)
- **Input validation:** Pydantic models
- **SQL injection:** Parameterized queries via SQLAlchemy

## Scalability Considerations

### Horizontal Scaling

**Backend:**
- Stateless design
- Load balancer ready
- Session storage in Redis

**Frontend:**
- Vercel/Netlify deployment
- CDN for static assets
- Server-side rendering caching

**Database:**
- PostgreSQL read replicas
- Connection pooling
- Neo4j clustering (enterprise)

### Vertical Scaling

- Async I/O for high concurrency
- Database indexes
- Query optimization
- Caching strategies

## Development Workflow

### 1. Local Development

```bash
# Start all services
docker-compose up -d

# Or run individually
./infrastructure/scripts/start-backend.sh
./infrastructure/scripts/start-frontend.sh
```

### 2. Code Changes

- Backend: Auto-reload via uvicorn
- Frontend: Hot module replacement
- Shared types: Instant propagation via workspace

### 3. Database Changes

```bash
# Create migration
./infrastructure/scripts/create-migration.sh "description"

# Apply migration
./infrastructure/scripts/run-migrations.sh
```

### 4. Testing

- Backend: pytest with coverage
- Frontend: Jest + React Testing Library (future)
- E2E: Playwright (future)

## Deployment Architecture (Future)

### Production Stack

```
Load Balancer (AWS ALB / Nginx)
    ↓
┌────────────────────────────────┐
│ Frontend (Vercel/CloudFront)   │
└────────────────────────────────┘
    ↓
┌────────────────────────────────┐
│ Backend (ECS/Kubernetes)       │
│ - Auto-scaling                 │
│ - Health checks                │
└────────────────────────────────┘
    ↓
┌──────────┬──────────┬──────────┐
│ RDS      │ Neo4j    │ElastiCache│
│PostgreSQL│ Aura     │  Redis    │
└──────────┴──────────┴──────────┘
```

### Monitoring

- **Metrics:** Prometheus + Grafana
- **Logging:** ELK Stack / CloudWatch
- **Tracing:** OpenTelemetry
- **Alerts:** PagerDuty / Opsgenie

## Design Decisions

### Why Monorepo?

- **Shared types** between frontend and backend
- **Atomic changes** across services
- **Simplified** dependency management
- **Better** developer experience

### Why FastAPI?

- **Async** support for high performance
- **Automatic** API documentation
- **Type safety** with Pydantic
- **Modern** Python patterns

### Why Next.js?

- **Server-side rendering** for SEO and performance
- **App Router** for modern React patterns
- **Built-in** API routes (future use)
- **Excellent** developer experience

### Why Neo4j?

- **Graph queries** are natural for access relationships
- **Traversal performance** for complex paths
- **Visualization** support
- **Rich** query language (Cypher)

## Future Enhancements

1. **GraphQL API** (alternative to REST)
2. **Real-time updates** (WebSockets)
3. **ML models** for anomaly detection
4. **Multi-tenancy** support
5. **Plugin system** for extensibility

---

**Document Version:** 1.0
**Last Updated:** 2026-04-15
