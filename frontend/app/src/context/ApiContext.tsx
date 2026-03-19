import React, { createContext, useContext, useCallback } from 'react'
import { ApiClient } from '@didhub/api'
import { useToast } from './ToastContext'
import { normalizeApiError } from '@/lib/errors'

const ApiContext = createContext<ApiClient | null>(null)

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { show: showToast } = useToast()
  const api = new ApiClient('/api')

  const handleApiError = useCallback((error: unknown, context?: string) => {
    const normalized = normalizeApiError(error, context)
    showToast({
      title: normalized.title,
      description: normalized.message,
      variant: 'error',
    })
  }, [showToast])

  const apiWithErrorHandling = Object.assign(api, {
    handleApiError,
  })

  return (
    <ApiContext.Provider value={apiWithErrorHandling as unknown as ApiClient}>
      {children}
    </ApiContext.Provider>
  )
}

export const useApi = () => {
  const api = useContext(ApiContext)
  if (!api) {
    throw new Error('useApi must be used within ApiProvider')
  }
  return api as ApiClient & { handleApiError: (error: unknown, context?: string) => void }
}
