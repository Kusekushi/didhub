import React, { createContext, useContext, useCallback, useMemo } from 'react'
import { ApiClient } from '@didhub/api'
import { useToast } from './ToastContext'
import { normalizeApiError } from '@/lib/errors'

const ApiContext = createContext<(ApiClient & { handleApiError: (error: unknown, context?: string) => void }) | null>(null)

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { show: showToast } = useToast()

  const handleApiError = useCallback((error: unknown, context?: string) => {
    const normalized = normalizeApiError(error, context)
    showToast({
      title: normalized.title,
      description: normalized.message,
      variant: 'error',
    })
  }, [showToast])

  const apiWithErrorHandling = useMemo(() => {
    const api = new ApiClient('/api')
    return Object.assign(api, {
      handleApiError,
    })
  }, [handleApiError])

  return (
    <ApiContext.Provider value={apiWithErrorHandling}>
      {children}
    </ApiContext.Provider>
  )
}

export const useApi = () => {
  const api = useContext(ApiContext)
  if (!api) {
    throw new Error('useApi must be used within ApiProvider')
  }
  return api
}
