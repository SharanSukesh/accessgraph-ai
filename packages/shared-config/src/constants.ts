/**
 * Application Constants
 */

// API Configuration
export const API_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  REQUEST_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
} as const

// Risk Scoring
export const RISK_THRESHOLDS = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 90,
} as const

export const RISK_WEIGHTS = {
  EXCESSIVE_PERMISSIONS: 0.3,
  DORMANT_ACCOUNT: 0.2,
  UNUSUAL_ACCESS_PATTERN: 0.25,
  PRIVILEGE_ESCALATION: 0.4,
  EXTERNAL_SHARING: 0.35,
  COMPLIANCE_VIOLATION: 0.5,
} as const

// Anomaly Detection
export const ANOMALY_CONFIG = {
  CONFIDENCE_THRESHOLD: 0.7,
  DETECTION_WINDOW_DAYS: 30,
  BASELINE_PERIOD_DAYS: 90,
  MIN_DATA_POINTS: 10,
} as const

export const ANOMALY_SEVERITY_SCORES = {
  INFO: 0,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 100,
} as const

// Graph Visualization
export const GRAPH_CONFIG = {
  MAX_NODES: 500,
  DEFAULT_DEPTH: 2,
  MAX_DEPTH: 5,
  LAYOUT_ALGORITHM: 'force-directed',
} as const

// Permissions
export const PERMISSION_CATEGORIES = {
  READ: ['read', 'view', 'list', 'get'],
  WRITE: ['write', 'create', 'update', 'edit'],
  DELETE: ['delete', 'remove', 'destroy'],
  ADMIN: ['admin', 'manage', 'configure', 'administrate'],
} as const

// Date/Time
export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  DISPLAY_WITH_TIME: 'MMM dd, yyyy HH:mm',
  ISO: 'yyyy-MM-dd',
  TIMESTAMP: 'yyyy-MM-dd HH:mm:ss',
} as const

export const TIME_WINDOWS = {
  LAST_24_HOURS: 24 * 60 * 60 * 1000,
  LAST_7_DAYS: 7 * 24 * 60 * 60 * 1000,
  LAST_30_DAYS: 30 * 24 * 60 * 60 * 1000,
  LAST_90_DAYS: 90 * 24 * 60 * 60 * 1000,
} as const

// Feature Flags
export const FEATURES = {
  ANOMALY_DETECTION: true,
  RISK_SCORING: true,
  RECOMMENDATIONS: true,
  GRAPH_VISUALIZATION: true,
  SALESFORCE_INTEGRATION: true,
  REAL_TIME_MONITORING: false, // Future feature
  ML_PREDICTIONS: false, // Future feature
} as const

// Environment Keys
export const ENV_KEYS = {
  API_URL: 'NEXT_PUBLIC_API_URL',
  APP_NAME: 'NEXT_PUBLIC_APP_NAME',
  DATABASE_URL: 'DATABASE_URL',
  NEO4J_URI: 'NEO4J_URI',
  REDIS_URL: 'REDIS_URL',
} as const

// Status Colors (for UI)
export const STATUS_COLORS = {
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
} as const

export const SEVERITY_COLORS = {
  info: 'blue',
  low: 'green',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
} as const
