# AccessGraph AI - Frontend

> Enterprise Access Intelligence Platform for Salesforce

A modern, graph-native admin console for visualizing, analyzing, and securing Salesforce access relationships. Built with Next.js 14, TypeScript, and TanStack Query.

## 🎯 What This Does

AccessGraph AI helps security teams, administrators, and auditors:

- **Visualize Access Relationships** - Interactive graph showing users, roles, profiles, permission sets, and access grants
- **Explain Access** - Understand why users have access to specific objects and fields
- **Detect Anomalies** - Machine learning-powered detection of unusual access patterns
- **Score Risk** - Transparent, explainable risk scoring for all users
- **Generate Recommendations** - Actionable remediation suggestions for access optimization

This is the **frontend application** that connects to the AccessGraph AI backend REST API.

## 🏗️ Architecture

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS + Radix UI
- **State**: TanStack Query (React Query)
- **Graphs**: Cytoscape.js
- **Charts**: Recharts
- **Icons**: Lucide React
- **Animation**: Framer Motion
- **Validation**: Zod

### Project Structure

```
apps/frontend/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout with providers
│   │   ├── page.tsx                  # Landing/home page
│   │   ├── providers.tsx             # TanStack Query + Theme providers
│   │   ├── onboarding/               # Onboarding flow
│   │   └── orgs/[orgId]/            # Org-scoped routes
│   │       ├── dashboard/           # Executive dashboard
│   │       ├── users/               # User list & detail
│   │       │   └── [userId]/       # User detail tabs
│   │       ├── objects/             # Object access views
│   │       ├── fields/              # Field access views
│   │       ├── anomalies/           # Anomaly management
│   │       ├── recommendations/     # Remediation center
│   │       └── graph/               # Graph explorer
│   │
│   ├── components/                   # React components
│   │   ├── layout/                  # App shell components
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── OrgSelector.tsx
│   │   │   └── Breadcrumbs.tsx
│   │   ├── dashboard/               # Dashboard-specific
│   │   ├── users/                   # User components
│   │   ├── access/                  # Access visualization
│   │   ├── graph/                   # Graph components
│   │   │   ├── GraphVisualization.tsx
│   │   │   ├── GraphLegend.tsx
│   │   │   ├── GraphControls.tsx
│   │   │   └── GraphDetailPanel.tsx
│   │   ├── anomalies/               # Anomaly components
│   │   ├── recommendations/         # Recommendation components
│   │   └── shared/                  # Reusable UI components
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── DataTable.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorState.tsx
│   │       ├── LoadingSkeleton.tsx
│   │       ├── MetricCard.tsx
│   │       └── ThemeToggle.tsx
│   │
│   ├── lib/                          # Core library code
│   │   ├── api/                     # API layer
│   │   │   ├── client.ts            # Base API client
│   │   │   ├── endpoints.ts         # Endpoint definitions
│   │   │   ├── hooks/               # TanStack Query hooks
│   │   │   │   ├── useOrgs.ts
│   │   │   │   ├── useUsers.ts
│   │   │   │   ├── useAnomalies.ts
│   │   │   │   ├── useRecommendations.ts
│   │   │   │   ├── useGraph.ts
│   │   │   │   └── useSync.ts
│   │   │   └── schemas/             # Zod validation schemas
│   │   │
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useDebounce.ts
│   │   │   ├── useLocalStorage.ts
│   │   │   └── useUrlState.ts
│   │   │
│   │   ├── types/                   # TypeScript types
│   │   │   ├── index.ts             # Re-exports shared types
│   │   │   └── salesforce.ts        # Salesforce-specific types
│   │   │
│   │   ├── utils/                   # Utility functions
│   │   │   ├── cn.ts                # Class name merger
│   │   │   ├── formatters.ts        # Date, number formatters
│   │   │   ├── filters.ts           # Data filtering
│   │   │   ├── exports.ts           # CSV export helpers
│   │   │   └── graph-transforms.ts  # Graph data transformers
│   │   │
│   │   └── constants/               # App constants
│   │       └── index.ts             # Risk levels, routes, etc.
│   │
│   └── styles/
│       └── globals.css              # Global styles
│
├── public/                           # Static assets
├── tests/                            # Test files
│   ├── components/
│   ├── hooks/
│   └── utils/
│
├── .env.local.example                # Environment variables template
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind configuration
├── tsconfig.json                     # TypeScript configuration
├── vitest.config.ts                  # Test configuration
├── package.json                      # Dependencies
└── README.md                         # This file
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Backend API running (default: http://localhost:8000)
- (Optional) PostgreSQL, Neo4j, Redis for full backend functionality

### Installation

1. **Install dependencies**:

```bash
cd apps/frontend
npm install
```

2. **Configure environment**:

```bash
cp .env.local.example .env.local
# Edit .env.local with your settings
```

3. **Run development server**:

```bash
npm run dev
```

4. **Open in browser**:

```
http://localhost:3000
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `http://localhost:8000` |
| `NEXT_PUBLIC_DEMO_MODE` | Enable demo mode fallback | `false` |
| `NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS` | Show React Query devtools | `true` |
| `NEXT_PUBLIC_GRAPH_MAX_NODES` | Max graph nodes before warning | `500` |
| `NEXT_PUBLIC_ENABLE_GRAPH_EXPORT` | Enable graph PNG/JSON export | `true` |
| `NEXT_PUBLIC_ENABLE_CSV_EXPORT` | Enable CSV exports | `true` |

## 📖 Routes & Pages

### Landing & Onboarding

- `/` - Smart landing page (routes to org dashboard or onboarding)
- `/onboarding` - Product introduction and org connection

### Organization Dashboard

- `/orgs/[orgId]/dashboard` - Executive overview with:
  - Key metrics (users, high-risk users, anomalies)
  - Risk distribution chart
  - Top anomalous users
  - Recent sync status
  - Top recommendations

### Users

- `/orgs/[orgId]/users` - User list with:
  - Search and filtering
  - Risk indicators
  - Sortable columns
  - Anomaly badges

- `/orgs/[orgId]/users/[userId]` - User detail with tabs:
  - **Overview**: Summary, stats, top risks
  - **Object Access**: Permissions table with explanations
  - **Field Access**: Field-level permissions with sensitivity
  - **Graph**: Interactive relationship visualization
  - **Explanations**: Why user has specific access
  - **Recommendations**: Personalized remediation suggestions

### Objects & Fields

- `/orgs/[orgId]/objects` - Object browser
- `/orgs/[orgId]/objects/[objectName]` - Users with access to object
- `/orgs/[orgId]/fields` - Sensitive fields browser
- `/orgs/[orgId]/fields/[fieldApiName]` - Users with field access

### Anomalies & Recommendations

- `/orgs/[orgId]/anomalies` - Anomaly dashboard with:
  - Severity filtering
  - Anomaly type filtering
  - User drill-down
  - Explanation panels

- `/orgs/[orgId]/recommendations` - Remediation center with:
  - Priority-based grouping
  - Bulk actions
  - CSV export
  - Review tracking

### Graph Explorer

- `/orgs/[orgId]/graph` - Dedicated graph exploration
- `/orgs/[orgId]/graph/[userId]` - User-centered graph view

## 🎨 Component Library

### Shared Components

Built on Radix UI primitives with Tailwind styling:

- `Badge` - Risk, severity, status badges
- `Button` - Primary, secondary, ghost variants
- `Card` - Content containers
- `DataTable` - Sortable, filterable tables
- `Dialog` - Modal dialogs
- `EmptyState` - No data states
- `ErrorState` - Error boundaries
- `LoadingSkeleton` - Loading states
- `MetricCard` - Dashboard metrics
- `Tabs` - Tab navigation
- `Tooltip` - Contextual hints

### Graph Components

- `GraphVisualization` - Cytoscape.js wrapper
- `GraphLegend` - Node type legend
- `GraphControls` - Zoom, fit, layout controls
- `GraphDetailPanel` - Node detail sidebar
- `PathHighlighter` - Explanation path visualization

### Specialized Components

- `OrgSelector` - Organization switcher
- `SyncButton` - Trigger sync with status
- `RiskBadge` - Color-coded risk levels
- `SeverityBadge` - Anomaly severity
- `AccessBadge` - Permission indicators
- `SensitivityBadge` - Field sensitivity
- `ExplanationPathCard` - Grant path display
- `RecommendationCard` - Remediation cards
- `AnomalyCard` - Anomaly display

## 🔌 API Integration

### TanStack Query Hooks

All API calls use React Query for caching, refetching, and optimistic updates:

```typescript
// Organizations
useOrgs()                                    // List orgs
useOrg(orgId)                                // Get org detail
useSyncOrg(orgId)                            // Trigger sync
useSyncJobs(orgId)                           // Sync history

// Users
useUsers(orgId, filters)                     // List users with filters
useUser(orgId, userId)                       // User detail
useUserObjectAccess(orgId, userId)           // Object permissions
useUserFieldAccess(orgId, userId)            // Field permissions
useUserRisk(orgId, userId)                   // Risk score
useUserRecommendations(orgId, userId)        // User recommendations
useUserGraph(orgId, userId)                  // User graph data

// Anomalies
useAnomalies(orgId, filters)                 // List anomalies
useTopAnomalousUsers(orgId)                  // Top anomalies

// Recommendations
useRecommendations(orgId, filters)           // List recommendations

// Objects & Fields
useObjectUsers(orgId, objectName)            // Users with object access
useFieldUsers(orgId, fieldApiName)           // Users with field access

// Explanations
useObjectExplanation(orgId, userId, object)  // Why user has object access
useFieldExplanation(orgId, userId, field)    // Why user has field access
```

### Example Usage

```typescript
import { useUsers } from '@/lib/api/hooks/useUsers'

function UsersPage() {
  const { data, isLoading, error } = useUsers(orgId, {
    search: 'john',
    riskLevel: 'high',
    isActive: true,
  })

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorState error={error} />

  return <UserTable users={data.users} />
}
```

## 📊 Graph Visualization

### Features

- **Node Types**: User, Role, Profile, PermissionSet, PermissionSetGroup, Object, Field
- **Interactive**: Click, drag, zoom, pan
- **Layouts**: Hierarchical, force-directed, circular
- **Filtering**: Show/hide node types
- **Path Highlighting**: Explanation path emphasis
- **Export**: PNG image or JSON data

### Implementation

```typescript
import { GraphVisualization } from '@/components/graph/GraphVisualization'

function UserGraphTab() {
  const { data } = useUserGraph(orgId, userId)

  return (
    <GraphVisualization
      graph={data.graph}
      centerNodeId={userId}
      onNodeSelect={handleNodeSelect}
      filters={{ nodeTypes: ['user', 'permission_set'] }}
    />
  )
}
```

## 🧪 Testing

### Run Tests

```bash
npm test                 # Run all tests
npm run test:ui         # Run with UI
npm run test:coverage   # Generate coverage report
```

### Test Structure

```
tests/
├── components/
│   ├── Badge.test.tsx
│   ├── DataTable.test.tsx
│   └── GraphVisualization.test.tsx
├── hooks/
│   └── useUsers.test.tsx
└── utils/
    ├── formatters.test.ts
    └── graph-transforms.test.ts
```

## 🌙 Dark Mode

Dark mode is fully supported using next-themes:

- System preference detection
- Manual toggle
- Persisted preference
- Consistent theme across all components

Toggle via the theme switcher in the top navbar or programmatically:

```typescript
import { useTheme } from 'next-themes'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle</button>
}
```

## 📤 Data Export

### CSV Export

All major views support CSV export:

```typescript
import { exportToCSV } from '@/lib/utils/exports'

const handleExport = () => {
  exportToCSV(data, 'users-export.csv', {
    columns: ['name', 'email', 'riskScore', 'anomalyCount'],
    headers: ['Name', 'Email', 'Risk Score', 'Anomalies'],
  })
}
```

### Graph Export

Export graphs as PNG images or JSON data:

```typescript
<GraphControls
  onExportPNG={handlePNGExport}
  onExportJSON={handleJSONExport}
/>
```

## 🎭 Demo Mode

When `NEXT_PUBLIC_DEMO_MODE=true`, the app operates with:

- Sample data fallback
- Graceful API error handling
- Realistic demo experience
- Clear "Demo" indicators

This allows the frontend to function even when:
- Backend is unavailable
- Neo4j graph is not running
- ML anomaly detection is disabled

## 🔧 Development

### Code Quality

```bash
npm run lint          # ESLint
npm run type-check    # TypeScript
npm run format        # Prettier (if configured)
```

### Build

```bash
npm run build         # Production build
npm run start         # Start production server
```

### Monorepo Context

This frontend is part of the AccessGraph AI monorepo:

```
.
├── apps/
│   ├── backend/      # Python FastAPI backend
│   └── frontend/     # This Next.js app
└── packages/
    ├── shared-types/ # Shared TypeScript types
    └── shared-config/# Shared configuration
```

## 🗺️ Implementation Status

### ✅ Complete

- [x] Dependencies and configuration
- [x] TanStack Query setup
- [x] Type system extensions
- [x] Constants and utilities
- [x] API client foundation
- [x] Core component library (badges, buttons, cards)
- [x] Layout shell (navbar, sidebar)
- [x] Theme provider with dark mode
- [x] Environment configuration

### 🚧 In Progress

The following need to be implemented based on this architecture:

#### API Hooks (lib/api/hooks/)
- [ ] useOrgs.ts
- [ ] useUsers.ts
- [ ] useAnomalies.ts
- [ ] useRecommendations.ts
- [ ] useGraph.ts
- [ ] useSync.ts

#### Pages (app/orgs/[orgId]/)
- [ ] dashboard/page.tsx
- [ ] users/page.tsx
- [ ] users/[userId]/page.tsx
- [ ] objects/page.tsx
- [ ] fields/page.tsx
- [ ] anomalies/page.tsx
- [ ] recommendations/page.tsx
- [ ] graph/page.tsx

#### Components
- [ ] Graph visualization (Cytoscape.js integration)
- [ ] Data tables with sorting/filtering
- [ ] Charts (Recharts integration)
- [ ] Export functionality
- [ ] Advanced filters

#### Utils
- [ ] Graph data transformers
- [ ] Export helpers (CSV, PNG, JSON)
- [ ] Formatter utilities
- [ ] Filter/sort utilities

#### Tests
- [ ] Component tests
- [ ] Hook tests
- [ ] Utility tests
- [ ] E2E tests (optional)

## 📝 Implementation Guide

To complete the remaining implementation:

### 1. Create API Hooks

Example pattern:

```typescript
// lib/api/hooks/useUsers.ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

export function useUsers(orgId: string, filters?: UserFilters) {
  return useQuery({
    queryKey: ['users', orgId, filters],
    queryFn: () => apiClient.get(endpoints.users(orgId), { params: filters }),
    enabled: !!orgId,
  })
}
```

### 2. Build Pages

Example pattern:

```typescript
// app/orgs/[orgId]/users/page.tsx
'use client'

import { useUsers } from '@/lib/api/hooks/useUsers'
import { DataTable } from '@/components/shared/DataTable'
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton'

export default function UsersPage({ params }: { params: { orgId: string } }) {
  const { data, isLoading } = useUsers(params.orgId)

  if (isLoading) return <LoadingSkeleton />

  return (
    <div>
      <h1>Users</h1>
      <DataTable data={data.users} columns={userColumns} />
    </div>
  )
}
```

### 3. Implement Graph Visualization

Use Cytoscape.js:

```typescript
// components/graph/GraphVisualization.tsx
import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'

cytoscape.use(coseBilkent)

export function GraphVisualization({ graph, onNodeSelect }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      elements: graph,
      style: [...graphStyles],
      layout: { name: 'cose-bilkent' },
    })

    cy.on('tap', 'node', (event) => {
      onNodeSelect(event.target.data())
    })

    return () => cy.destroy()
  }, [graph])

  return <div ref={containerRef} className="h-full w-full" />
}
```

## 🤝 Contributing

1. Follow the established patterns
2. Use TypeScript strictly
3. Add tests for new features
4. Update this README for significant changes
5. Ensure dark mode compatibility

## 📚 Resources

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [Radix UI](https://www.radix-ui.com/)
- [Cytoscape.js](https://js.cytoscape.org/)
- [Tailwind CSS](https://tailwindcss.com/)

## 📄 License

Part of the AccessGraph AI platform.

---

**Built with ❤️ for security teams, admins, and auditors**
