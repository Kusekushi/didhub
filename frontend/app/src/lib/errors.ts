/**
 * Unified error types for frontend error handling.
 * API errors → Toast, Runtime errors → Modal with bug report
 */

/** Error categories for routing to the right UI */
export type ErrorCategory = 'api' | 'runtime' | 'unhandled_rejection' | 'window_error'

/** Shape of an API error from our backend */
export interface ApiError {
  code?: string
  message: string
  status?: number
}

/** Normalized error info for the error boundary/modal */
export interface NormalizedError {
  id: string
  category: ErrorCategory
  title: string
  message: string
  stack?: string
  cause?: string
  timestamp: Date
  /** For API errors */
  status?: number
  /** For API errors */
  code?: string
  /** User action that triggered the error (if known) */
  context?: string
}

/**
 * Generate a unique error ID for tracking
 */
export function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Normalize an unknown error into a NormalizedError
 */
export function normalizeError(
  error: unknown,
  category: ErrorCategory,
  context?: string
): NormalizedError {
  const id = generateErrorId()
  const timestamp = new Date()

  if (error instanceof Error) {
    return {
      id,
      category,
      title: getErrorTitle(error, category),
      message: error.message || 'An unexpected error occurred',
      stack: error.stack,
      cause: error.cause?.toString(),
      timestamp,
      context,
    }
  }

  if (typeof error === 'string') {
    return {
      id,
      category,
      title: getErrorTitleFromString(error, category),
      message: error,
      timestamp,
      context,
    }
  }

  return {
    id,
    category,
    title: getErrorTitleFromString(String(error), category),
    message: String(error),
    timestamp,
    context,
  }
}

/**
 * Normalize an API error response into a NormalizedError
 */
export function normalizeApiError(
  error: unknown,
  context?: string
): NormalizedError {
  const id = generateErrorId()
  const timestamp = new Date()

  let title = 'API Error'
  let message = 'An unexpected error occurred'
  let status: number | undefined
  let code: string | undefined

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>
    message = (err.message as string) || message
    status = err.status as number | undefined
    code = err.code as string | undefined

    // Try to extract from response body if available
    if (err.response) {
      const resp = err.response as { status?: number; data?: { message?: string; code?: string } }
      status = resp.status ?? status
      const data = resp.data
      if (typeof data === 'object' && data !== null) {
        message = data.message || message
        code = data.code || code
      }
    }
  } else if (typeof error === 'string') {
    message = error
  }

  // Generate user-friendly title from status code
  if (status) {
    title = getApiErrorTitle(status)
  }

  return {
    id,
    category: 'api',
    title,
    message,
    timestamp,
    status,
    code,
    context,
  }
}

/**
 * Get user-friendly error title based on category
 */
function getErrorTitle(error: Error, category: ErrorCategory): string {
  if (category === 'runtime' || category === 'window_error') {
    return 'Something went wrong'
  }
  if (category === 'unhandled_rejection') {
    return 'Unhandled Promise Rejection'
  }
  return 'Error'
}

function getErrorTitleFromString(message: string, category: ErrorCategory): string {
  if (category === 'runtime' || category === 'window_error') {
    return 'Something went wrong'
  }
  if (category === 'unhandled_rejection') {
    return 'Unhandled Promise Rejection'
  }
  return 'Error'
}

/**
 * Get user-friendly API error title from status code
 */
function getApiErrorTitle(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid Request'
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Access Denied'
    case 404:
      return 'Not Found'
    case 409:
      return 'Conflict'
    case 422:
      return 'Validation Error'
    case 429:
      return 'Too Many Requests'
    case 500:
      return 'Server Error'
    case 502:
      return 'Service Unavailable'
    case 503:
      return 'Service Unavailable'
    default:
      return status >= 500 ? 'Server Error' : 'Request Failed'
  }
}

/**
 * Format error for bug report (copy-friendly)
 */
export function formatErrorForReport(error: NormalizedError): string {
  const lines: string[] = [
    `Error ID: ${error.id}`,
    `Category: ${error.category}`,
    `Timestamp: ${error.timestamp.toISOString()}`,
    `Title: ${error.title}`,
    `Message: ${error.message}`,
  ]

  if (error.status) {
    lines.push(`Status: ${error.status}`)
  }

  if (error.code) {
    lines.push(`Code: ${error.code}`)
  }

  if (error.context) {
    lines.push(`Context: ${error.context}`)
  }

  if (error.stack) {
    lines.push('\nStack Trace:')
    lines.push(error.stack)
  }

  return lines.join('\n')
}
