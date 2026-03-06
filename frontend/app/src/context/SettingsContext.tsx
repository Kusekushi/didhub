import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useApi } from './ApiContext'

export type RelationshipType = {
  value: string
  label: string
  color?: string
}

export const DEFAULT_RELATIONSHIP_TYPES: RelationshipType[] = [
  { value: 'partner', label: 'Partner', color: '#ec4899' },
  { value: 'parent', label: 'Parent', color: '#f97316' },
  { value: 'sibling', label: 'Sibling', color: '#22c55e' },
  { value: 'friend', label: 'Friend', color: '#3b82f6' },
  { value: 'caretaker', label: 'Caretaker', color: '#8b5cf6' },
  { value: 'protector', label: 'Protector', color: '#06b6d4' },
  { value: 'source', label: 'Source', color: '#14b8a6' },
  { value: 'fragment', label: 'Fragment', color: '#64748b' },
  { value: 'twin', label: 'Twin', color: '#f43f5e' },
  { value: 'rival', label: 'Rival', color: '#ef4444' },
  { value: 'mentor', label: 'Mentor', color: '#a855f7' },
  { value: 'other', label: 'Other', color: '#6b7280' },
]

// Relationship types that typically represent many-to-many relationships
export const DEFAULT_MN_RELATIONSHIP_TYPES: string[] = ['partner', 'friend', 'sibling', 'rival']

// Bidirectional types for showing relationships without arrows
export const DEFAULT_BIDIRECTIONAL_TYPES: string[] = ['partner', 'sibling', 'twin', 'friend', 'rival']

interface SettingsContextType {
  relationshipTypes: RelationshipType[]
  mnRelationshipTypes: string[]
  bidirectionalTypes: string[]
  isLoading: boolean
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { client } = useApi()
  const [customTypes, setCustomTypes] = useState<RelationshipType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = async () => {
    try {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      // @ts-expect-error - Codegen types are currently misaligned with the actual API client
      const response = await client.getInstanceSetting({
        path: { key: 'custom_relationship_types' }
      })
      // @ts-expect-error - Codegen types are currently misaligned with the actual API client
      if (response && response.data && response.data.value) {
        // @ts-expect-error - Codegen types are currently misaligned with the actual API client
        const parsed = JSON.parse(response.data.value) as RelationshipType[]
        setCustomTypes(parsed)
      } else {
        setCustomTypes([])
      }
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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
  }, [client])

  const relationshipTypes = useMemo(() => {
    const all = [...DEFAULT_RELATIONSHIP_TYPES]
    for (const ct of customTypes) {
      if (!all.find(t => t.value === ct.value)) {
        all.push(ct)
      }
    }
    return all
  }, [customTypes])

  const mnRelationshipTypes = DEFAULT_MN_RELATIONSHIP_TYPES
  const bidirectionalTypes = DEFAULT_BIDIRECTIONAL_TYPES

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
