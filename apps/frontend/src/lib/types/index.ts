/**
 * Frontend type definitions
 * Re-exports shared types and adds frontend-specific types
 */

// Re-export shared types
export * from '@accessgraph/shared-types'

// Frontend-specific types can be added here
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
