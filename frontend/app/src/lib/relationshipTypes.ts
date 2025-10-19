// Centralized relationship types used across components and pages
export type RelationshipType = {
  value: string
  label: string
  color?: string
}

export const RELATIONSHIP_TYPES: RelationshipType[] = [
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

export default RELATIONSHIP_TYPES

// Relationship types that typically represent many-to-many relationships
export const MN_RELATIONSHIP_TYPES: string[] = ['partner', 'friend', 'sibling', 'rival']

// Bidirectional types for showing relationships without arrows
export const BIDIRECTIONAL_TYPES: string[] = ['partner', 'sibling', 'twin', 'friend', 'rival']
