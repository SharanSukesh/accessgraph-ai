/**
 * API Client
 * Type-safe fetch wrapper for backend API calls
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Debug: Log API URL on client side
if (typeof window !== 'undefined') {
  console.log('API_BASE_URL:', API_BASE_URL)
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | boolean>
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<T> {
    const { params, ...fetchConfig } = config

    // Build URL with query parameters
    let url = `${this.baseUrl}${endpoint}`
    if (params) {
      const queryString = new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          acc[key] = String(value)
          return acc
        }, {} as Record<string, string>)
      ).toString()
      url += `?${queryString}`
    }

    // Default headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchConfig.headers,
    }

    // Debug logging
    if (typeof window !== 'undefined' && endpoint.includes('anomalies')) {
      console.log('API Request:', { url, params, method: fetchConfig.method || 'GET' })
    }

    try {
      const response = await fetch(url, {
        ...fetchConfig,
        headers,
      })

      // Handle non-OK responses
      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
        } catch {
          errorData = { message: response.statusText }
        }

        console.error('API Error:', { url, status: response.status, errorData })

        throw new ApiError(
          errorData.detail || errorData.message || 'Request failed',
          response.status,
          errorData
        )
      }

      // Parse JSON response
      const data = await response.json()

      // Debug logging for anomalies endpoint
      if (typeof window !== 'undefined' && endpoint.includes('anomalies')) {
        console.log('API Response:', { url, data, dataLength: Array.isArray(data) ? data.length : 'not an array' })
      }

      return data as T
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }

      // Network or other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error',
        0
      )
    }
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'GET' })
  }

  async post<T>(
    endpoint: string,
    data?: any,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async put<T>(
    endpoint: string,
    data?: any,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async patch<T>(
    endpoint: string,
    data?: any,
    config?: RequestConfig
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<T> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' })
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL)
