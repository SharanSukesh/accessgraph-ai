/**
 * Graph Visualization Types
 */

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  properties: NodeProperties
  metadata?: Record<string, any>
}

export enum NodeType {
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  RESOURCE = 'resource',
  GROUP = 'group',
  ORGANIZATION = 'organization',
}

export interface NodeProperties {
  name: string
  description?: string
  status?: string
  riskScore?: number
  createdAt?: Date
  [key: string]: any
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string
  properties: EdgeProperties
  weight?: number
}

export enum EdgeType {
  HAS_ROLE = 'has_role',
  HAS_PERMISSION = 'has_permission',
  MEMBER_OF = 'member_of',
  REPORTS_TO = 'reports_to',
  GRANTS_ACCESS = 'grants_access',
  INHERITS_FROM = 'inherits_from',
  CAN_ACCESS = 'can_access',
}

export interface EdgeProperties {
  grantedAt?: Date
  grantedBy?: string
  expiresAt?: Date
  direct?: boolean
  [key: string]: any
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata: GraphMetadata
}

export interface GraphMetadata {
  nodeCount: number
  edgeCount: number
  depth: number
  generatedAt: Date
  filters?: GraphFilters
}

export interface GraphFilters {
  nodeTypes?: NodeType[]
  edgeTypes?: EdgeType[]
  userId?: string
  riskLevel?: string
  dateRange?: {
    start: Date
    end: Date
  }
}

export interface GraphQuery {
  centerNodeId?: string
  depth?: number
  filters?: GraphFilters
  limit?: number
}

export interface PathAnalysis {
  source: string
  target: string
  paths: AccessPath[]
  shortestPath: AccessPath
  totalPaths: number
}

export interface AccessPath {
  nodes: string[]
  edges: string[]
  length: number
  risk: number
  type: 'direct' | 'indirect' | 'transitive'
}
