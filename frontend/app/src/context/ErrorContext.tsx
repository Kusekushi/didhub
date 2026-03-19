import React, { createContext, useCallback, useContext, useState } from 'react'
import type { NormalizedError } from '@/lib/errors'

type ErrorContextType = {
  error: NormalizedError | null
  showError: (error: NormalizedError) => void
  clearError: () => void
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined)

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<NormalizedError | null>(null)

  const showError = useCallback((err: NormalizedError) => {
    setError(err)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return (
    <ErrorContext.Provider value={{ error, showError, clearError }}>
      {children}
    </ErrorContext.Provider>
  )
}

export function useError() {
  const ctx = useContext(ErrorContext)
  if (!ctx) {
    throw new Error('useError must be used within ErrorProvider')
  }
  return ctx
}
