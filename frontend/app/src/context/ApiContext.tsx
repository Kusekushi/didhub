import React, { createContext, useContext } from 'react'
import { ApiClient } from '@didhub/api'

const ApiContext = createContext<ApiClient | null>(null)

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = new ApiClient('/api')

  return (
    <ApiContext.Provider value={api}>
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