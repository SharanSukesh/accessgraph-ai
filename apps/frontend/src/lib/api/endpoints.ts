/**
 * API Endpoints
 * Centralized endpoint definitions
 */

export const endpoints = {
  // Health
  health: '/health',
  healthReady: '/health/ready',

  // Organizations
  orgs: '/orgs',
  org: (orgId: string) => `/orgs/${orgId}`,
  syncOrg: (orgId: string) => `/orgs/${orgId}/sync`,
  syncJobs: (orgId: string) => `/orgs/${orgId}/sync-jobs`,
  buildGraph: (orgId: string) => `/orgs/${orgId}/build-graph`,
  analyze: (orgId: string) => `/orgs/${orgId}/analyze`,

  // Users
  users: (orgId: string) => `/orgs/${orgId}/users`,
  user: (orgId: string, userId: string) => `/orgs/${orgId}/users/${userId}`,
  userObjectAccess: (orgId: string, userId: string) =>
    `/orgs/${orgId}/users/${userId}/access/objects`,
  userFieldAccess: (orgId: string, userId: string) =>
    `/orgs/${orgId}/users/${userId}/access/fields`,
  userObjectExplanation: (orgId: string, userId: string, objectName: string) =>
    `/orgs/${orgId}/users/${userId}/explain/object/${objectName}`,
  userFieldExplanation: (orgId: string, userId: string, fieldApiName: string) =>
    `/orgs/${orgId}/users/${userId}/explain/field/${fieldApiName}`,
  userRisk: (orgId: string, userId: string) => `/orgs/${orgId}/users/${userId}/risk`,
  userAnomalies: (orgId: string, userId: string) => `/orgs/${orgId}/users/${userId}/anomalies`,
  userRecommendations: (orgId: string, userId: string) =>
    `/orgs/${orgId}/users/${userId}/recommendations`,

  // Anomalies
  anomalies: (orgId: string) => `/orgs/${orgId}/anomalies`,
  topAnomalousUsers: (orgId: string) => `/orgs/${orgId}/anomalies/users/top`,

  // Objects & Fields
  objects: (orgId: string) => `/orgs/${orgId}/objects`,
  object: (orgId: string, objectName: string) => `/orgs/${orgId}/objects/${objectName}`,
  objectUsers: (orgId: string, objectName: string) =>
    `/orgs/${orgId}/objects/${objectName}/users-with-access`,
  fields: (orgId: string) => `/orgs/${orgId}/fields`,
  field: (orgId: string, fieldApiName: string) => `/orgs/${orgId}/fields/${fieldApiName}`,
  fieldUsers: (orgId: string, fieldApiName: string) =>
    `/orgs/${orgId}/fields/${fieldApiName}/users-with-access`,

  // Graph
  userGraph: (orgId: string, userId: string) => `/orgs/${orgId}/graph/user/${userId}`,

  // Recommendations
  recommendations: (orgId: string) => `/orgs/${orgId}/recommendations`,
  recommendation: (recId: string) => `/recommendations/${recId}`,

  // Equity (GAEA-driven recommendation track)
  equityDiagnostic: (orgId: string) => `/orgs/${orgId}/equity/diagnostic`,
  equityGenerate: (orgId: string) => `/orgs/${orgId}/equity/recommendations/generate`,
  equityHistory: (orgId: string) => `/orgs/${orgId}/equity/history`,
  equityUser: (orgId: string, userSfId: string) => `/orgs/${orgId}/equity/users/${userSfId}`,

  // Reporting Graph editor — drag-and-drop manager / delegated-approver
  // editor. POST /apply writes through to Salesforce User records.
  reportingGraph: (orgId: string) => `/orgs/${orgId}/reporting-graph`,
  reportingGraphApply: (orgId: string) => `/orgs/${orgId}/reporting-graph/apply`,

  // Org Analyzer — consulting-grade org-health diagnostics + PDF report.
  orgAnalyzerRun: (orgId: string) => `/orgs/${orgId}/org-analyzer/run`,
  orgAnalyzerLatest: (orgId: string) => `/orgs/${orgId}/org-analyzer/latest`,
  orgAnalyzerFindings: (orgId: string) => `/orgs/${orgId}/org-analyzer/findings`,
  orgAnalyzerFinding: (orgId: string, findingId: string) =>
    `/orgs/${orgId}/org-analyzer/findings/${findingId}`,
  orgAnalyzerIgnoreFinding: (orgId: string, findingId: string) =>
    `/orgs/${orgId}/org-analyzer/findings/${findingId}/ignore`,
  orgAnalyzerUnignoreFinding: (orgId: string, findingId: string) =>
    `/orgs/${orgId}/org-analyzer/findings/${findingId}/unignore`,
  orgAnalyzerHistory: (orgId: string) => `/orgs/${orgId}/org-analyzer/history`,
  orgAnalyzerReportPdf: (orgId: string) => `/orgs/${orgId}/org-analyzer/report.pdf`,
  orgAnalyzerPriceBook: (orgId: string) => `/orgs/${orgId}/org-analyzer/price-book`,
  // v1.8 — CSV export, apply-fix, brand settings
  orgAnalyzerFindingsCsv: (orgId: string) => `/orgs/${orgId}/org-analyzer/findings.csv`,
  orgAnalyzerApplyFix: (orgId: string, findingId: string) =>
    `/orgs/${orgId}/org-analyzer/findings/${findingId}/apply-fix`,
  orgAnalyzerBrand: (orgId: string) => `/orgs/${orgId}/org-analyzer/brand`,
  orgAnalyzerBrandLogo: (orgId: string) => `/orgs/${orgId}/org-analyzer/brand/logo`,

  // Data Quality — per-object health scoring
  dataQualityRun: (orgId: string) => `/orgs/${orgId}/data-quality/run`,
  dataQualityLatest: (orgId: string) => `/orgs/${orgId}/data-quality/latest`,
  dataQualityObjects: (orgId: string) => `/orgs/${orgId}/data-quality/objects`,
  dataQualityObject: (orgId: string, objectName: string) =>
    `/orgs/${orgId}/data-quality/objects/${objectName}`,
  dataQualityHistory: (orgId: string) => `/orgs/${orgId}/data-quality/history`,

  // Change-risk radar — SetupAuditTrail ingest + blast-radius scoring
  changeRiskRun: (orgId: string) => `/orgs/${orgId}/change-risk/run`,
  changeRiskLatest: (orgId: string) => `/orgs/${orgId}/change-risk/latest`,
  changeRiskEvents: (orgId: string) => `/orgs/${orgId}/change-risk/events`,
  changeRiskEvent: (orgId: string, eventId: string) =>
    `/orgs/${orgId}/change-risk/events/${eventId}`,
  changeRiskHistory: (orgId: string) => `/orgs/${orgId}/change-risk/history`,

  // Managed-package sprawl — AppExchange inventory + usage tiering
  packageSprawlRun: (orgId: string) => `/orgs/${orgId}/package-sprawl/run`,
  packageSprawlLatest: (orgId: string) => `/orgs/${orgId}/package-sprawl/latest`,
  packageSprawlPackages: (orgId: string) =>
    `/orgs/${orgId}/package-sprawl/packages`,
  packageSprawlHistory: (orgId: string) =>
    `/orgs/${orgId}/package-sprawl/history`,

  // Restructure Studio — GAEA Optimal Org Restructure
  restructureRun: (orgId: string) => `/orgs/${orgId}/restructure/run`,
  restructureLatest: (orgId: string) => `/orgs/${orgId}/restructure/latest`,
  restructureMoves: (orgId: string) => `/orgs/${orgId}/restructure/moves`,
  restructureMove: (orgId: string, moveId: string) =>
    `/orgs/${orgId}/restructure/moves/${moveId}`,
  restructureMoveDeepAnalyze: (orgId: string, moveId: string) =>
    `/orgs/${orgId}/restructure/moves/${moveId}/deep-analyze`,
  restructurePlans: (orgId: string) => `/orgs/${orgId}/restructure/plans`,
  restructurePlan: (orgId: string, planId: string) =>
    `/orgs/${orgId}/restructure/plans/${planId}`,
  restructurePlanExport: (orgId: string, planId: string) =>
    `/orgs/${orgId}/restructure/plans/${planId}/export.csv`,
  restructureConstraints: (orgId: string) =>
    `/orgs/${orgId}/restructure/constraints`,
  restructureConstraint: (orgId: string, constraintId: string) =>
    `/orgs/${orgId}/restructure/constraints/${constraintId}`,
} as const
