# AccessGraph AI - Backend

## Overview

Production-grade backend service for **AccessGraph AI** - an enterprise access intelligence platform that analyzes Salesforce permissions, detects anomalies, scores risk, and generates recommendations.

### What This Backend Does

1. **Data Ingestion** - Extracts access metadata from Salesforce orgs (or demo fixtures)
2. **Graph Modeling** - Builds Neo4j graph representation of access relationships
3. **Effective Access** - Computes what users can actually access (profile + PS + PSG aggregation)
4. **Anomaly Detection** - Uses IsolationForest ML to find unusual access patterns
5. **Risk Scoring** - Transparent weighted model for user/permission set risk
6. **Recommendations** - Rule-based suggestions for access optimization
7. **REST API** - Clean endpoints for frontend and integrations

## Architecture

```
┌─────────────────┐
│  FastAPI        │  REST API Layer
│  (async)        │
└────────┬────────┘
         │
┌────────┴────────────────────────────┐
│  Service Layer                      │
│  - Effective Access Engine          │
│  - Anomaly Detection (ML)           │
│  - Risk Scoring                     │
│  - Recommendation Engine            │
└──────┬─────────────┬────────────────┘
       │             │
┌──────┴──────┐  ┌──┴──────────┐
│ PostgreSQL  │  │   Neo4j     │
│ (Snapshots) │  │  (Graph)    │
└─────────────┘  └─────────────┘
```

### Module Breakdown

```
app/
├── api/                    # REST API routes
│   └── routes/
│       ├── health.py      # Health checks
│       ├── orgs.py        # Organization & sync management
│       └── users.py       # User access & analysis endpoints
├── core/                   # Configuration & logging
│   ├── config.py          # Environment-based settings
│   └── logging.py         # Structured logging
├── db/                     # Database clients
│   ├── session.py         # PostgreSQL async session
│   ├── neo4j_client.py    # Neo4j driver
│   └── redis_client.py    # Redis client
├── domain/                 # Domain models
│   └── models.py          # 15+ SQLAlchemy models
├── graph/                  # Graph layer
│   ├── builder.py         # Build graph from snapshots
│   ├── repository.py      # Neo4j operations
│   └── schema.py          # Node/relationship types
├── ingestion/              # Data ingestion
│   ├── orchestrator.py    # Sync pipeline coordinator
│   ├── snapshot.py        # Persist to PostgreSQL
│   └── fixture_loader.py  # Load demo data
├── salesforce/             # Salesforce integration
│   ├── client.py          # REST API client
│   ├── oauth.py           # OAuth 2.0 flow
│   └── models.py          # Pydantic schemas
└── services/               # Business logic
    ├── effective_access.py    # Access computation
    ├── anomaly_detection.py   # IsolationForest ML
    ├── risk_scoring.py        # Weighted risk model
    └── recommendations.py     # Rule engine
```

## Quick Start

### Prerequisites

- Python 3.12+
- PostgreSQL 16
- Neo4j 5.16+
- Redis 7 (optional for production)

### 1. Install Dependencies

```bash
cd apps/backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 3. Run Migrations

```bash
alembic upgrade head
```

### 4. Seed Demo Data

```bash
python scripts/seed_demo.py
```

This will:
- Create demo organization
- Load fixture data (8 users with intentional anomalies)
- Build Neo4j graph
- Run anomaly detection
- Calculate risk scores
- Generate recommendations

### 5. Start Server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit: http://localhost:8000/docs

## Demo Mode vs Live Mode

### Demo Mode (Default)

**Enabled when:** `DEMO_MODE=true` in `.env`

**Behavior:**
- Loads data from `fixtures/demo_org.json`
- No Salesforce connection required
- Immediate testing and development
- Intentional anomalies for demonstration

**Demo Data Includes:**
- 8 users across different departments
- 3 roles (Sales Manager, Sales Rep, Support Agent)
- 5 profiles
- 11 permission sets
- 2 permission set groups
- Intentional anomalies:
  - Alice: Over-permissioned (27 permissions vs peer median 9)
  - Bob: Under-permissioned (missing standard PSG)
  - Carol: Sensitive field exposure (SSN access for Support role)

### Live Mode

**Enabled when:** `DEMO_MODE=false` in `.env`

**Required Configuration:**
```bash
SALESFORCE_CLIENT_ID=your_connected_app_client_id
SALESFORCE_CLIENT_SECRET=your_client_secret
SALESFORCE_REDIRECT_URI=http://localhost:8000/auth/salesforce/callback
```

**Workflow:**
1. Create organization via API
2. Connect Salesforce org (OAuth flow - partial MVP)
3. Trigger sync: `POST /orgs/{org_id}/sync`
4. Build graph: `POST /orgs/{org_id}/build-graph`
5. Run analysis: `POST /orgs/{org_id}/analyze`

## Key API Endpoints

### Organizations & Sync

```
POST   /orgs                         # Create organization
GET    /orgs                         # List organizations
POST   /orgs/{org_id}/sync           # Trigger data sync
POST   /orgs/{org_id}/build-graph    # Build Neo4j graph
POST   /orgs/{org_id}/analyze        # Run full analysis
GET    /orgs/{org_id}/sync-jobs      # List sync jobs
```

### Users & Access

```
GET    /orgs/{org_id}/users                                    # List users
GET    /orgs/{org_id}/users/{user_id}                         # Get user
GET    /orgs/{org_id}/users/{user_id}/access/objects          # Object access
GET    /orgs/{org_id}/users/{user_id}/access/fields           # Field access
GET    /orgs/{org_id}/users/{user_id}/explain/object/{object} # Explain access
GET    /orgs/{org_id}/users/{user_id}/risk                    # Risk score
GET    /orgs/{org_id}/users/{user_id}/recommendations         # Recommendations
```

### Anomalies & Recommendations

```
GET    /orgs/{org_id}/anomalies                # List anomalies
GET    /orgs/{org_id}/recommendations          # List recommendations
```

## Running the Full Pipeline

### Manual Step-by-Step

```bash
# 1. Create organization
curl -X POST http://localhost:8000/orgs \
  -H "Content-Type: application/json" \
  -d '{"name": "My Org", "is_demo": true}'

# 2. Sync data (returns org_id)
ORG_ID="your-org-id"
curl -X POST http://localhost:8000/orgs/$ORG_ID/sync

# 3. Build graph
curl -X POST http://localhost:8000/orgs/$ORG_ID/build-graph?rebuild=true

# 4. Run analysis
curl -X POST http://localhost:8000/orgs/$ORG_ID/analyze

# 5. View results
curl http://localhost:8000/orgs/$ORG_ID/anomalies
curl http://localhost:8000/orgs/$ORG_ID/recommendations
```

### Automated (Demo)

```bash
python scripts/seed_demo.py
```

## Effective Access Engine

### How It Works

1. **Aggregates** all permission sources:
   - Profile-backed permission set
   - Direct permission set assignments
   - Permission Set Groups (via components)

2. **Computes** effective permissions:
   - Object-level: Read, Create, Edit, Delete
   - Field-level: Read, Edit

3. **Explains** access paths:
   - Shows chain: User → Profile/PSG → PS → Permission
   - Multiple grant sources if applicable

### Example

```python
# Get effective access
GET /orgs/{org_id}/users/005.../access/objects

# Response:
{
  "user_id": "005000000001AAA",
  "objects": [
    {
      "object": "Opportunity",
      "access": {"read": true, "create": false, "edit": true, "delete": false},
      "granted_by_count": 2
    }
  ]
}

# Explain how user gets access
GET /orgs/{org_id}/users/005.../explain/object/Opportunity

# Response:
{
  "paths": [
    {
      "source_type": "permission_set_group",
      "source_name": "PSG: Sales Manager PSG",
      "permissions": ["Read", "Edit"],
      "steps": [
        "User: Alice Johnson",
        "PermissionSetGroup: Sales_Manager_PSG",
        "PermissionSet: Opportunity_Full",
        "ObjectPermission: Opportunity (Read, Edit)"
      ]
    }
  ]
}
```

## Anomaly Detection

### Algorithm

**IsolationForest** from scikit-learn with engineered features:

**Features:**
- `num_permission_sets` - Count of direct PS assignments
- `num_permission_set_groups` - Count of PSG assignments
- `num_objects_read/edit/delete` - Permission breadth
- `num_fields_read/edit` - Field-level access
- `num_sensitive_objects/fields` - Sensitive data access
- `permission_breadth_score` - Weighted combination

**Peer Comparison:**
1. Primary: Same role
2. Fallback: Same profile
3. Fallback: Org-wide

**Output:**
- Anomaly score (0-1, higher = more anomalous)
- Severity (Info, Low, Medium, High, Critical)
- Top 5 reasons with peer context
- Feature values and deviations

### Example Anomaly

```json
{
  "user_id": "005000000001AAA",
  "anomaly_score": 0.82,
  "severity": "high",
  "reasons": [
    "User has 6 permission sets which is significantly higher than peers",
    "User has access to 2 sensitive fields vs peer median 0",
    "User has delete access to Quote which is unique in role cohort"
  ]
}
```

## Risk Scoring

### Transparent Weighted Model

**Weights (configurable):**
- Access breadth: 20%
- Sensitive objects: 30%
- Edit/delete power: 25%
- Peer deviation: 15%
- Unique access: 10%

**Score Range:** 0-100

**Risk Levels:**
- Low: 0-24
- Medium: 25-49
- High: 50-74
- Critical: 75-100

**Output:**
- Numeric score
- Risk level
- Contributing factors
- Explanation text

## Recommendations

### Rule-Based Engine

**Rules:**
1. **PSG Migration** - User has >3 direct PS → suggest consolidation
2. **Access Review** - Edit permissions exceed peer median × 2
3. **Permission Removal** - Sensitive field access inappropriate for role
4. **Unique Access Review** - Delete access unique to user

**Output:**
- Recommendation type
- Severity
- Title & description
- Rationale
- Impact summary
- Status (pending, accepted, applied, rejected)

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test
pytest tests/test_effective_access.py -v
```

## Database Migrations

```bash
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

## Development

### Code Style

```bash
# Format
black .

# Lint
ruff check .

# Type check
mypy app
```

### Logging

Structured JSON logs in production, human-readable in development.

```python
import logging
logger = logging.getLogger(__name__)

logger.info("Message", extra={"user_id": "123", "action": "sync"})
```

## What's NOT in MVP

### Partial/Scaffold Only
- Custom permissions (data model exists, extraction partial)
- Muting permission sets (not fully modeled)
- Field-level security hierarchy (simplified)
- Real-time monitoring
- Advanced graph algorithms (link prediction)

### Future v2
- ML-based recommendations (currently rule-based)
- Time-series access analysis
- What-if simulation
- Multi-language support
- Advanced caching with Redis
- Background job queue (Celery)
- Multi-org tenant UI
- SSO integration

## Production Hardening TODOs

1. **Security:**
   - Encrypt Salesforce tokens (currently plain text)
   - Implement JWT authentication
   - Add rate limiting
   - Secrets management (Vault)

2. **Performance:**
   - Add Redis caching layer
   - Implement pagination everywhere
   - Optimize graph queries
   - Add database indexes based on query patterns

3. **Reliability:**
   - Background job queue for long-running tasks
   - Retry mechanisms with exponential backoff
   - Circuit breakers for external calls
   - Health check improvements

4. **Monitoring:**
   - Prometheus metrics
   - Distributed tracing (OpenTelemetry)
   - Error tracking (Sentry)
   - Performance monitoring

## Troubleshooting

### Database Connection Errors

```bash
# Check PostgreSQL is running
psql -U accessgraph -d accessgraph

# Verify DATABASE_URL in .env
echo $DATABASE_URL
```

### Neo4j Connection Errors

```bash
# Check Neo4j is running
curl http://localhost:7474

# Verify NEO4J_URI and credentials in .env
```

### Import Errors

```bash
# Ensure virtual environment is activated
source .venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Demo Data Not Loading

```bash
# Verify fixture file exists
ls -la fixtures/demo_org.json

# Check logs for specific errors
python scripts/seed_demo.py 2>&1 | grep ERROR
```

## Support

- **Documentation:** See root README.md
- **API Docs:** http://localhost:8000/docs
- **Architecture:** See ARCHITECTURE.md in root

## License

MIT License - See LICENSE file

---

**Built with:** FastAPI, SQLAlchemy, Neo4j, scikit-learn
