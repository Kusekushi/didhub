import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useApi } from './ApiContext'
import {
  RELATIONSHIP_TYPES,
  MN_RELATIONSHIP_TYPES,
  BIDIRECTIONAL_TYPES,
  type RelationshipType,
} from '@/lib/relationshipTypes'

export type { RelationshipType }

interface SettingsContextType {
  relationshipTypes: RelationshipType[]
  mnRelationshipTypes: string[]
  bidirectionalTypes: string[]
  isLoading: boolean
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = useApi()
  const [customTypes, setCustomTypes] = useState<RelationshipType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = async () => {
    try {
      const response = await api.getInstanceSetting<{ value?: string }>({
        path: { key: 'custom_relationship_types' }
      })
      if (response && response.data && response.data.value) {
        const parsed = JSON.parse(response.data.value) as RelationshipType[]
        setCustomTypes(parsed)
      } else {
        setCustomTypes([])
      }
    } catch (error) {
      console.warn('Failed to fetch custom_relationship_types, using defaults', error)
      setCustomTypes([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api])

  const relationshipTypes = useMemo(() => {
    const all = [...RELATIONSHIP_TYPES]
    for (const ct of customTypes) {
      if (!all.find(t => t.value === ct.value)) {
        all.push(ct)
      }
    }
    return all
  }, [customTypes])

  const mnRelationshipTypes = MN_RELATIONSHIP_TYPES
  const bidirectionalTypes = BIDIRECTIONAL_TYPES

  return (
    <SettingsContext.Provider value={{
      relationshipTypes,
      mnRelationshipTypes,
      bidirectionalTypes,
      isLoading,
      refresh
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
