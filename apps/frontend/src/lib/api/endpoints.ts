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
} as const
