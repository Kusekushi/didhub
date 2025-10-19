import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Alter, User, PaginatedUsersResponse, Relationship, CreateRelationshipRequest, UpdateRelationshipRequest } from '@didhub/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Users, UserCheck, Network, Heart, Edit } from 'lucide-react'
import AdvancedAffiliationForm from '@/components/AdvancedAffiliationForm'
import AdvancedSubsystemForm from '@/components/AdvancedSubsystemForm'
import { RELATIONSHIP_TYPES } from '@/lib/relationshipTypes'
import { AdvancedRelationshipForm } from '@/components/AdvancedRelationshipForm'
import { RelationshipEditForm, GroupedPartner } from '@/components/RelationshipEditForm'
import { MN_RELATIONSHIP_TYPES } from '@/lib/relationshipTypes'
import { useToast } from '@/context/ToastContext'
import { useApi } from '@/context/ApiContext'
import { useAuth } from '@/context/AuthContext'

interface Affiliation {
  id: string
  name: string
  description?: string
  systemId: string
  createdAt: string
}

interface Subsystem {
  id: string
  name: string
  description?: string
  systemId: string
  createdAt: string
}

type TabType = 'alters' | 'affiliations' | 'subsystems' | 'relationships'

export default function DIDSystemView() {
  const { userId } = useParams<{ userId?: string }>()
  const api = useApi()
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('alters')

  // Shared state
  const [systems, setSystems] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [selectedSystemId, setSelectedSystemId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Alters state
  const [alters, setAlters] = useState<Alter[]>([])
  // Map of fileId -> url (from GET /files?ids=... or GET /files/{fileId}) for primary uploads
  const [fileDataMap, setFileDataMap] = useState<Record<string, string>>({})
  const [newAlterName, setNewAlterName] = useState('')
  const [creatingAlter, setCreatingAlter] = useState(false)

  // Simple name-only creation state (like alters)
  const [newAffiliationName, setNewAffiliationName] = useState('')
  const [creatingAffiliation, setCreatingAffiliation] = useState(false)
  const [newSubsystemName, setNewSubsystemName] = useState('')
  const [creatingSubsystem, setCreatingSubsystem] = useState(false)

  // Affiliations state
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [createAffiliationDialogOpen, setCreateAffiliationDialogOpen] = useState(false)

  // Subsystems state
  const [subsystems, setSubsystems] = useState<Subsystem[]>([])
  const [createSubsystemDialogOpen, setCreateSubsystemDialogOpen] = useState(false)

  // Relationships state
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [createRelationshipDialogOpen, setCreateRelationshipDialogOpen] = useState(false)
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null)
  const [editingGroup, setEditingGroup] = useState<{
    anchorId?: string
    anchorUserId?: string
    partners: GroupedPartner[]
    direction?: 'forward' | 'reverse'
  } | null>(null)
  // Cache of alters from other systems (for displaying cross-system relationships)
  const [relatedAltersMap, setRelatedAltersMap] = useState<Record<string, Alter>>({})
  // Cache of non-system users referenced in relationships
  const [relatedUsersMap, setRelatedUsersMap] = useState<Record<string, User>>({})
  const [relationshipSearch, setRelationshipSearch] = useState('')

  const { show: showToast } = useToast()

  // Check if user can edit this system (owner or admin)
  const canEditSystem = selectedSystemId === currentUser?.id || isAdmin

  const getInitials = (name: string) => {
    if (!name) return ''
    return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  }

  const handleCreateAlter = async () => {
    if (!newAlterName.trim()) return
    setCreatingAlter(true)
    try {
      await api.createAlter({ body: { name: newAlterName.trim(), systemId: selectedSystemId } })
      setNewAlterName('')
      loadAlters()
      showToast({ title: 'Success', description: 'Alter created successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to create alter', variant: 'error' })
    } finally {
      setCreatingAlter(false)
    }
  }

  const handleCreateAffiliation = async () => {
    if (!newAffiliationName.trim()) return
    setCreatingAffiliation(true)
    try {
      await api.createAffiliation({ body: { name: newAffiliationName.trim(), systemId: selectedSystemId } })
      setNewAffiliationName('')
      loadAffiliations()
      showToast({ title: 'Success', description: 'Affiliation created successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to create affiliation', variant: 'error' })
    } finally {
      setCreatingAffiliation(false)
    }
  }

  const handleCreateSubsystem = async () => {
    if (!newSubsystemName.trim()) return
    setCreatingSubsystem(true)
    try {
      await api.createSubsystem({ body: { name: newSubsystemName.trim(), systemId: selectedSystemId } })
      setNewSubsystemName('')
      loadSubsystems()
      showToast({ title: 'Success', description: 'Subsystem created successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to create subsystem', variant: 'error' })
    } finally {
      setCreatingSubsystem(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (selectedSystemId) {
      loadAlters()
      loadAffiliations()
      loadSubsystems()
      loadRelationships()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSystemId])

  const loadData = async () => {
    try {
      const [systemsResponse, meResponse] = await Promise.all([
        api.getUsers<PaginatedUsersResponse>({ query: { isSystem: true } }),
        api.request<User>('GET', '/auth/me', false, {})
      ])
      setSystems(systemsResponse.data.items)
      setCurrentUser(meResponse.data)
      // Use userId from URL if provided, otherwise use current user
      setSelectedSystemId(userId || meResponse.data.id)
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAlters = async () => {
    try {
      const altersResponse = await api.request<Alter[]>('GET', `/alters?systemId=${selectedSystemId}`, false, {})
      const received = Array.isArray(altersResponse.data) ? altersResponse.data : []
      setAlters(received)
      // Fetch any primary uploads referenced by the alters (batch unique ids)
      const fileIds = Array.from(new Set(received.map(a => (a as Alter & { primaryUploadId?: string }).primaryUploadId).filter(Boolean))) as string[]
      if (fileIds.length > 0) {
        try {
          const idsParam = fileIds.join(',')
          const resp = await api.request<{ file_id: string; url: string }[]>('GET', `/files?ids=${encodeURIComponent(idsParam)}`, false, {})
          if (resp && Array.isArray(resp.data)) {
            const fetched: Record<string, string> = {}
            for (const item of resp.data) {
              if (item && item.file_id && item.url) {
                fetched[item.file_id] = item.url
              }
            }
            setFileDataMap(prev => ({ ...prev, ...fetched }))
          }
        } catch {
          // ignore batch fetch failures
        }
      }
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load alters',
        variant: 'error',
      })
    }
  }

  const loadAffiliations = async () => {
    try {
      const affiliationsResponse = await api.request<{ items: Affiliation[], pagination: unknown }>('GET', `/affiliations?systemId=${selectedSystemId}`, false, {})
      const items = affiliationsResponse.data?.items
      setAffiliations(Array.isArray(items) ? items : [])
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load affiliations',
        variant: 'error',
      })
    }
  }

  const loadSubsystems = async () => {
    try {
      const subsystemsResponse = await api.request<{ items: Subsystem[], pagination: unknown }>('GET', `/subsystems?systemId=${selectedSystemId}`, false, {})
      const items = subsystemsResponse.data?.items
      setSubsystems(Array.isArray(items) ? items : [])
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load subsystems',
        variant: 'error',
      })
    }
  }

  const loadRelationships = async () => {
    try {
      // Load all relationships - we'll filter them client-side to show only those involving our alters
      const relationshipsResponse = await api.listRelationships<Relationship[]>({})
      const rels = Array.isArray(relationshipsResponse.data) ? relationshipsResponse.data : []
      setRelationships(rels)
      
      // Find alters from other systems that we need to load for display
      const currentAlterIds = new Set(alters.map(a => a.id))
      const missingAlterIds = new Set<string>()
      const otherSystemIds = new Set<string>()
      // Track user IDs that aren't in our systems list (likely non-system users)
      const systemUserIds = new Set(systems.map(s => s.id))
      const missingUserIds = new Set<string>()
      
      for (const rel of rels) {
        if (rel.sideAAlterId && !currentAlterIds.has(rel.sideAAlterId)) {
          missingAlterIds.add(rel.sideAAlterId)
          if (rel.sideAUserId) otherSystemIds.add(rel.sideAUserId)
        }
        if (rel.sideBAlterId && !currentAlterIds.has(rel.sideBAlterId)) {
          missingAlterIds.add(rel.sideBAlterId)
          if (rel.sideBUserId) otherSystemIds.add(rel.sideBUserId)
        }
        // Check for user-only references (no alter) that aren't in systems
        if (rel.sideAUserId && !rel.sideAAlterId && !systemUserIds.has(rel.sideAUserId)) {
          missingUserIds.add(rel.sideAUserId)
        }
        if (rel.sideBUserId && !rel.sideBAlterId && !systemUserIds.has(rel.sideBUserId)) {
          missingUserIds.add(rel.sideBUserId)
        }
      }
      
      // Load alters from other systems
      if (otherSystemIds.size > 0) {
        const newRelatedAlters: Record<string, Alter> = { ...relatedAltersMap }
        for (const systemId of otherSystemIds) {
          try {
            const response = await api.request<Alter[]>('GET', `/alters?systemId=${systemId}`, false, {})
            const systemAlters = Array.isArray(response.data) ? response.data : []
            for (const alter of systemAlters) {
              if (missingAlterIds.has(alter.id)) {
                newRelatedAlters[alter.id] = alter
              }
            }
          } catch {
            // Silently fail - we'll just show "Unknown" for these
          }
        }
        setRelatedAltersMap(newRelatedAlters)
      }
      
      // Load non-system users referenced in relationships
      if (missingUserIds.size > 0) {
        const newRelatedUsers: Record<string, User> = { ...relatedUsersMap }
        for (const userId of missingUserIds) {
          if (!newRelatedUsers[userId]) {
            try {
              const response = await api.request<User>('GET', `/users/${userId}`, false, {})
              if (response.data) {
                newRelatedUsers[userId] = response.data
              }
            } catch {
              // Silently fail - we'll just show "Unknown" for these
            }
          }
        }
        setRelatedUsersMap(newRelatedUsers)
      }
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load relationships',
        variant: 'error',
      })
    }
  }

  // Alter handlers

  const handleDeleteAlter = async (alterId: string) => {
    if (!confirm('Are you sure you want to delete this alter?')) return

    try {
      await api.deleteAlter({ path: { alterId } })
      loadAlters()
      showToast({
        title: 'Success',
        description: 'Alter deleted successfully',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to delete alter',
        variant: 'error',
      })
    }
  }

  // Affiliation handlers handled via AdvancedAffiliationForm onSave callbacks

  const handleDeleteAffiliation = async (affiliationId: string) => {
    if (!confirm('Are you sure you want to delete this affiliation?')) return

    try {
      await api.deleteAffiliation({ path: { affiliationId } })
      loadAffiliations()
      showToast({
        title: 'Success',
        description: 'Affiliation deleted successfully',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to delete affiliation',
        variant: 'error',
      })
    }
  }

  // Subsystem handlers handled via AdvancedSubsystemForm onSave callbacks

  const handleDeleteSubsystem = async (subsystemId: string) => {
    if (!confirm('Are you sure you want to delete this subsystem?')) return

    try {
      await api.deleteSubsystem({ path: { subsystemId } })
      loadSubsystems()
      showToast({
        title: 'Success',
        description: 'Subsystem deleted successfully',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to delete subsystem',
        variant: 'error',
      })
    }
  }

  // Relationship handlers

  // Helper to create a relationship
  const createRelationshipEntry = async (data: CreateRelationshipRequest) => {
    // Build the request body with snake_case
    const body: Record<string, unknown> = {
      relation_type: data.relationType,
      past_life: data.pastLife ? 1 : 0,
    }
    if (data.sideAUserId) body.side_a_user_id = data.sideAUserId
    if (data.sideAAlterId) body.side_a_alter_id = data.sideAAlterId
    if (data.sideBUserId) body.side_b_user_id = data.sideBUserId
    if (data.sideBAlterId) body.side_b_alter_id = data.sideBAlterId
    
    // Create the relationship - the database handles uniqueness for bidirectional types
    await api.createRelationship({ body })
  }

  const handleDeleteRelationship = async (relationshipId: string) => {
    if (!confirm('Are you sure you want to delete this relationship?')) return

    try {
      await api.deleteRelationship({ path: { relationshipId } })
      loadRelationships()
      showToast({
        title: 'Success',
        description: 'Relationship deleted successfully',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to delete relationship',
        variant: 'error',
      })
    }
  }

  const handleUpdateRelationship = async (relationshipId: string, data: UpdateRelationshipRequest) => {
    try {
      // Convert camelCase to snake_case for the API
      const body: Record<string, unknown> = {}
      if (data.relationType !== undefined) body.relation_type = data.relationType
      if (data.pastLife !== undefined) body.past_life = data.pastLife ? 1 : 0
      if (data.sideAUserId !== undefined) body.side_a_user_id = data.sideAUserId
      if (data.sideAAlterId !== undefined) body.side_a_alter_id = data.sideAAlterId
      if (data.sideBUserId !== undefined) body.side_b_user_id = data.sideBUserId
      if (data.sideBAlterId !== undefined) body.side_b_alter_id = data.sideBAlterId
      
      await api.updateRelationship({ path: { relationshipId }, body })
      loadRelationships()
      setEditingRelationship(null)
      showToast({
        title: 'Success',
        description: 'Relationship updated successfully',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to update relationship',
        variant: 'error',
      })
    }
  }

  const handleRemoveParticipant = async (relationshipId: string, _side: 'A' | 'B') => {
    // Removing a participant from a relationship means deleting the relationship entry
    // The database stores bidirectional relationships as a single entry, so just delete it
    try {
      await api.deleteRelationship({ path: { relationshipId } })
      loadRelationships()
      setEditingRelationship(null)
      showToast({
        title: 'Success',
        description: 'Participant removed from relationship',
      })
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to remove participant',
        variant: 'error',
      })
    }
  }

  // Helper to get user name by ID
  const getUserName = (userId: string): string => {
    // First check systems
    const system = systems.find(s => s.id === userId)
    if (system) return system.displayName || system.username
    // Then check cached non-system users
    const user = relatedUsersMap[userId]
    if (user) return user.displayName || user.username
    return 'Unknown'
  }

  // Helper to get alter name by ID (checks current system alters and related alters from other systems)
  const getAlterName = (alterId: string): string => {
    // First check current system's alters
    const alter = alters.find(a => a.id === alterId)
    if (alter) return alter.name
    // Then check the cached related alters from other systems
    const relatedAlter = relatedAltersMap[alterId]
    if (relatedAlter) return relatedAlter.name
    return 'Unknown'
  }

  // Helper to render a linked alter name (with fallback to system link if alter not found)
  const renderAlterLink = (alterId: string | undefined, userId: string | undefined) => {
    if (!alterId && !userId) return <span className="text-muted-foreground">Unknown</span>
    
    // First check current system's alters
    const alter = alters.find(a => a.id === alterId)
    if (alter) {
      return (
        <Link to={`/alter/${alter.id}`} className="font-medium text-primary hover:underline">
          {alter.name}
        </Link>
      )
    }
    
    // Then check the cached related alters from other systems
    const relatedAlter = alterId ? relatedAltersMap[alterId] : undefined
    if (relatedAlter) {
      return (
        <Link to={`/alter/${relatedAlter.id}`} className="font-medium text-primary hover:underline">
          {relatedAlter.name}
        </Link>
      )
    }
    
    // If we have a user ID but no alter info, check for the user
    if (userId) {
      // First check systems (system users)
      const system = systems.find(s => s.id === userId)
      if (system) {
        return (
          <Link to={`/system/${userId}`} className="font-medium text-primary hover:underline">
            {system.displayName || system.username}
          </Link>
        )
      }
      
      // Then check cached non-system users
      const nonSystemUser = relatedUsersMap[userId]
      if (nonSystemUser) {
        return (
          <Link to={`/profile/${userId}`} className="font-medium text-primary hover:underline">
            {nonSystemUser.displayName || nonSystemUser.username}
          </Link>
        )
      }
      
      return <span className="text-muted-foreground">Unknown User</span>
    }
    
    return <span className="text-muted-foreground">Unknown</span>
  }

  // Helper to get relationship type label
  const getRelationshipTypeLabel = (relationType: string): string => {
    const type = RELATIONSHIP_TYPES.find(t => t.value === relationType)
    return type?.label || relationType
  }

  // Filter relationships to only those involving alters from this system, and apply search filter
  const systemRelationships = relationships.filter(r => {
    const alterIds = alters.map(a => a.id)
    const involvesSystemAlter = (r.sideAAlterId && alterIds.includes(r.sideAAlterId)) || 
           (r.sideBAlterId && alterIds.includes(r.sideBAlterId))
    
    if (!involvesSystemAlter) return false
    
    // Apply search filter if present
    if (relationshipSearch.trim()) {
      const searchLower = relationshipSearch.toLowerCase().trim()
      const sideAName = getAlterName(r.sideAAlterId || '').toLowerCase()
      const sideBName = getAlterName(r.sideBAlterId || '').toLowerCase()
      const typeLabel = getRelationshipTypeLabel(r.relationType).toLowerCase()
      
      return sideAName.includes(searchLower) || 
             sideBName.includes(searchLower) || 
             typeLabel.includes(searchLower) ||
             r.relationType.toLowerCase().includes(searchLower)
    }
    
    return true
  })

  // Group relationships for a summarized view
  // - m-n (bidirectional): "A → partner → B, C, D" (one anchor, multiple partners)
  // - 1-n (directional): "A → parent → B, C, D" (one source, multiple targets)
  // - n-1 (directional): "A, B, C → parent → D" (multiple sources, one target)
  interface GroupedRelationship {
    key: string
    // For 1-n: anchor is the source, partners are the targets
    // For n-1: anchor is the target, partners are the sources
    anchorId?: string
    anchorUserId?: string
    relationType: string
    // Direction of the relationship arrow in display
    // 'forward': anchor → type → partners (1-n)
    // 'reverse': partners → type → anchor (n-1)
    direction: 'forward' | 'reverse'
    partners: Array<{
      id: string
      alterId?: string
      userId?: string
      relationship: Relationship
    }>
    pastLife: boolean
    createdAt: string
  }

  const groupedRelationships = (() => {
    const groups = new Map<string, GroupedRelationship>()
    const nonGroupable: Relationship[] = []

    // Relationship types that should be grouped
    const GROUPABLE_TYPES = [...MN_RELATIONSHIP_TYPES, 'parent', 'caretaker', 'protector', 'source', 'fragment', 'mentor']

    for (const rel of systemRelationships) {
      // Only group certain relationship types
      if (!GROUPABLE_TYPES.includes(rel.relationType)) {
        nonGroupable.push(rel)
        continue
      }

      const sideAId = rel.sideAAlterId || rel.sideAUserId
      const sideBId = rel.sideBAlterId || rel.sideBUserId

      // For m-n (bidirectional) types, group by either side as anchor
      if (MN_RELATIONSHIP_TYPES.includes(rel.relationType)) {
        const keyA = `fwd:${sideAId}:${rel.relationType}`
        const keyB = `fwd:${sideBId}:${rel.relationType}`
        
        let existingGroup = groups.get(keyA) || groups.get(keyB)
        
        if (existingGroup) {
          const anchorId = existingGroup.anchorId || existingGroup.anchorUserId
          
          if (sideAId === anchorId) {
            const alreadyHas = existingGroup.partners.some(p => (p.alterId || p.userId) === sideBId)
            if (!alreadyHas) {
              existingGroup.partners.push({
                id: rel.id,
                alterId: rel.sideBAlterId,
                userId: rel.sideBUserId,
                relationship: rel,
              })
            }
          } else if (sideBId === anchorId) {
            const alreadyHas = existingGroup.partners.some(p => (p.alterId || p.userId) === sideAId)
            if (!alreadyHas) {
              existingGroup.partners.push({
                id: rel.id,
                alterId: rel.sideAAlterId,
                userId: rel.sideAUserId,
                relationship: rel,
              })
            }
          }
        } else {
          groups.set(keyA, {
            key: keyA,
            anchorId: rel.sideAAlterId,
            anchorUserId: rel.sideAUserId,
            relationType: rel.relationType,
            direction: 'forward',
            partners: [{
              id: rel.id,
              alterId: rel.sideBAlterId,
              userId: rel.sideBUserId,
              relationship: rel,
            }],
            pastLife: rel.pastLife || false,
            createdAt: rel.createdAt,
          })
        }
      } else {
        // For directional types, we can group in two ways:
        // 1. Forward (1-n): Same source → multiple targets (e.g., one parent has multiple children)
        // 2. Reverse (n-1): Multiple sources → same target (e.g., multiple parents for one child)
        
        const keyForward = `fwd:${sideAId}:${rel.relationType}`  // Group by source (side A)
        const keyReverse = `rev:${sideBId}:${rel.relationType}`  // Group by target (side B)
        
        // Check if we already have a group for this relationship
        let existingForward = groups.get(keyForward)
        let existingReverse = groups.get(keyReverse)
        
        if (existingForward) {
          // Add to existing forward group (1-n)
          const alreadyHas = existingForward.partners.some(p => (p.alterId || p.userId) === sideBId)
          if (!alreadyHas) {
            existingForward.partners.push({
              id: rel.id,
              alterId: rel.sideBAlterId,
              userId: rel.sideBUserId,
              relationship: rel,
            })
          }
        } else if (existingReverse) {
          // Add to existing reverse group (n-1)
          const alreadyHas = existingReverse.partners.some(p => (p.alterId || p.userId) === sideAId)
          if (!alreadyHas) {
            existingReverse.partners.push({
              id: rel.id,
              alterId: rel.sideAAlterId,
              userId: rel.sideAUserId,
              relationship: rel,
            })
          }
        } else {
          // Create new forward group (can be merged into reverse later if another rel with same target appears)
          groups.set(keyForward, {
            key: keyForward,
            anchorId: rel.sideAAlterId,
            anchorUserId: rel.sideAUserId,
            relationType: rel.relationType,
            direction: 'forward',
            partners: [{
              id: rel.id,
              alterId: rel.sideBAlterId,
              userId: rel.sideBUserId,
              relationship: rel,
            }],
            pastLife: rel.pastLife || false,
            createdAt: rel.createdAt,
          })
        }
      }
    }

    // Post-process: Convert single-partner forward groups to reverse groups if there's a matching reverse pattern
    // This ensures n-1 relationships are properly grouped (e.g., 2 parents → 1 child)
    const forwardGroups = Array.from(groups.entries()).filter(([k]) => k.startsWith('fwd:'))
    
    for (const [key, group] of forwardGroups) {
      if (group.partners.length === 1 && !MN_RELATIONSHIP_TYPES.includes(group.relationType)) {
        // Check if we should convert this to a reverse group
        const targetId = group.partners[0].alterId || group.partners[0].userId
        const reverseKey = `rev:${targetId}:${group.relationType}`
        
        // Look for other forward groups that point to the same target
        let shouldConvert = false
        for (const [otherKey, otherGroup] of forwardGroups) {
          if (otherKey !== key && otherGroup.relationType === group.relationType) {
            const otherTargetId = otherGroup.partners[0]?.alterId || otherGroup.partners[0]?.userId
            if (otherTargetId === targetId) {
              shouldConvert = true
              break
            }
          }
        }
        
        if (shouldConvert) {
          // Create or add to reverse group
          let reverseGroup = groups.get(reverseKey)
          if (!reverseGroup) {
            reverseGroup = {
              key: reverseKey,
              anchorId: group.partners[0].alterId,
              anchorUserId: group.partners[0].userId,
              relationType: group.relationType,
              direction: 'reverse',
              partners: [],
              pastLife: group.pastLife,
              createdAt: group.createdAt,
            }
            groups.set(reverseKey, reverseGroup)
          }
          
          // Add the source as a partner
          const sourceId = group.anchorId || group.anchorUserId
          const alreadyHas = reverseGroup.partners.some(p => (p.alterId || p.userId) === sourceId)
          if (!alreadyHas) {
            reverseGroup.partners.push({
              id: group.partners[0].id,
              alterId: group.anchorId,
              userId: group.anchorUserId,
              relationship: group.partners[0].relationship,
            })
          }
          
          // Remove the forward group
          groups.delete(key)
        }
      }
    }

    return {
      grouped: Array.from(groups.values()),
      nonGroupable,
    }
  })()

  if (loading) {
    return <div className="p-6">Loading DID system...</div>
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'alters':
        return (
          <div className="space-y-6">
            {/* Simple name-only alter creation */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter alter name..."
                value={newAlterName}
                onChange={(e) => setNewAlterName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAlter()}
                disabled={creatingAlter}
                className="max-w-md"
              />
              <Button onClick={handleCreateAlter} disabled={creatingAlter || !newAlterName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Alter
              </Button>
            </div>

            <ul className="flex flex-col gap-4">
              {Array.isArray(alters) && alters.map((alter) => (
                <li key={alter.id} className="p-4 bg-card rounded-md shadow-sm w-full">
                  <div className="flex items-center justify-between">
                    <Link 
                      to={`/alter/${alter.id}`} 
                      className="flex items-center flex-1 hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
                    >
                      {/* Thumbnail / initials */}
                      {alter.primaryUploadId && fileDataMap[alter.primaryUploadId] ? (
                        <img
                          src={fileDataMap[alter.primaryUploadId]}
                          alt={`${alter.name} image`}
                          className="h-12 w-12 rounded-md object-cover mr-4"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center mr-4 text-sm font-medium text-muted-foreground">
                          {getInitials(alter.name)}
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="text-lg font-semibold">{alter.name}</div>
                        {alter.pronouns && (
                          <div className="text-sm text-muted-foreground">{alter.pronouns}</div>
                        )}
                      </div>
                    </Link>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAlter(alter.id)}
                      className="h-8 w-8 p-0 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {alters.length === 0 && (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No alters found</h3>
                <p className="text-muted-foreground mb-4">
                  {canEditSystem
                    ? "Create your first alter to get started."
                    : "This system doesn't have any alters yet."}
                </p>
                {canEditSystem && (
                  <form
                    className="flex items-center gap-2 justify-center"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const form = e.target as HTMLFormElement
                      const nameInput = form.elements.namedItem('alterName') as HTMLInputElement
                      const name = nameInput.value.trim()
                      if (!name) return
                      await api.createAlter({ body: { name, systemId: selectedSystemId } })
                      nameInput.value = ''
                      loadAlters()
                      showToast({ title: 'Success', description: 'Alter created successfully' })
                    }}
                  >
                    <Input
                      name="alterName"
                      placeholder="Enter alter name"
                      className="w-48"
                    />
                    <Button type="submit">
                      <Plus className="w-4 h-4 mr-2" />
                      Create
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        )

      case 'affiliations':
        return (
          <div className="space-y-6">
            {/* Simple name-only affiliation creation */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter affiliation name..."
                value={newAffiliationName}
                onChange={(e) => setNewAffiliationName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAffiliation()}
                disabled={creatingAffiliation}
                className="max-w-md"
              />
              <Button onClick={handleCreateAffiliation} disabled={creatingAffiliation || !newAffiliationName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Affiliation
              </Button>
            </div>

            <ul className="flex flex-col gap-6">
              {Array.isArray(affiliations) && affiliations.map((affiliation) => (
                <li key={affiliation.id} className="p-4 bg-card rounded-md shadow-sm w-full">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link 
                        to={`/affiliation/${affiliation.id}`}
                        className="text-lg font-semibold text-primary hover:underline"
                      >
                        {affiliation.name}
                      </Link>
                    </div>
                    {(affiliation.systemId === currentUser?.id || isAdmin) && (
                      <div className="flex space-x-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAffiliation(affiliation.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    {affiliation.description && (
                      <p className="text-sm text-muted-foreground mb-3">{affiliation.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(affiliation.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {affiliations.length === 0 && (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <UserCheck className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No affiliations found</h3>
                <p className="text-muted-foreground mb-4">
                  {canEditSystem
                    ? "Create your first affiliation to get started."
                    : "This system doesn't have any affiliations yet."}
                </p>
                {canEditSystem && (
                  <Dialog open={createAffiliationDialogOpen} onOpenChange={setCreateAffiliationDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Affiliation
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Affiliation</DialogTitle>
                        <DialogDescription>
                          Fill in the details to create a new affiliation.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <AdvancedAffiliationForm
                          mode="create"
                          systems={systems}
                          selectedSystemId={selectedSystemId}
                          onCancel={() => setCreateAffiliationDialogOpen(false)}
                          onSave={async (data: { name: string; description?: string; systemId?: string }) => {
                            await api.createAffiliation({ body: { ...data, systemId: data.systemId || selectedSystemId } })
                            setCreateAffiliationDialogOpen(false)
                            loadAffiliations()
                            showToast({ title: 'Success', description: 'Affiliation created successfully' })
                          }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </div>
        )

      case 'subsystems':
        return (
          <div className="space-y-6">
            {/* Simple name-only subsystem creation */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter subsystem name..."
                value={newSubsystemName}
                onChange={(e) => setNewSubsystemName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSubsystem()}
                disabled={creatingSubsystem}
                className="max-w-md"
              />
              <Button onClick={handleCreateSubsystem} disabled={creatingSubsystem || !newSubsystemName.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Subsystem
              </Button>
            </div>

            <ul className="flex flex-col gap-6">
              {Array.isArray(subsystems) && subsystems.map((subsystem) => (
                <li key={subsystem.id} className="p-4 bg-card rounded-md shadow-sm w-full">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link 
                        to={`/subsystem/${subsystem.id}`}
                        className="text-lg font-semibold text-primary hover:underline"
                      >
                        {subsystem.name}
                      </Link>
                    </div>
                    {(subsystem.systemId === currentUser?.id || isAdmin) && (
                      <div className="flex space-x-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSubsystem(subsystem.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3">
                    {subsystem.description && (
                      <p className="text-sm text-muted-foreground mb-3">{subsystem.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(subsystem.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {subsystems.length === 0 && (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Network className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No subsystems found</h3>
                <p className="text-muted-foreground mb-4">
                  {canEditSystem
                    ? "Create your first subsystem to get started."
                    : "This system doesn't have any subsystems yet."}
                </p>
                {canEditSystem && (
                  <Dialog open={createSubsystemDialogOpen} onOpenChange={setCreateSubsystemDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Subsystem
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Subsystem</DialogTitle>
                        <DialogDescription>
                          Fill in the details to create a new subsystem.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <AdvancedSubsystemForm
                          mode="create"
                          systems={systems}
                          selectedSystemId={selectedSystemId}
                          onCancel={() => setCreateSubsystemDialogOpen(false)}
                          onSave={async (data: { name: string; description?: string; systemId?: string }) => {
                            await api.createSubsystem({ body: { ...data, systemId: data.systemId || selectedSystemId } })
                            setCreateSubsystemDialogOpen(false)
                            loadSubsystems()
                            showToast({ title: 'Success', description: 'Subsystem created successfully' })
                          }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}
          </div>
        )

      case 'relationships':
        return (
          <div className="space-y-6">
            {alters.length >= 1 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <Input
                    placeholder="Search relationships by alter name or type..."
                    value={relationshipSearch}
                    onChange={(e) => setRelationshipSearch(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Dialog open={createRelationshipDialogOpen} onOpenChange={setCreateRelationshipDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Relationship
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Relationship</DialogTitle>
                      <DialogDescription>
                        Define relationships between alters. Select source alters on the left and target alters on the right.
                      </DialogDescription>
                    </DialogHeader>
                    <AdvancedRelationshipForm
                      currentSystemAlters={alters}
                      currentSystemId={selectedSystemId}
                      systems={systems}
                      mode="create"
                      onCancel={() => setCreateRelationshipDialogOpen(false)}
                      onSave={async (relationships: CreateRelationshipRequest[]) => {
                        for (const data of relationships) {
                          await createRelationshipEntry(data)
                        }
                        setCreateRelationshipDialogOpen(false)
                        loadRelationships()
                        showToast({ 
                          title: 'Success', 
                          description: relationships.length > 1 
                            ? `${relationships.length} relationships created successfully`
                            : 'Relationship created successfully' 
                        })
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {alters.length < 1 && (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Heart className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No alters yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create at least one alter to start defining relationships.
                </p>
                <Button onClick={() => setActiveTab('alters')}>
                  Go to Alters
                </Button>
              </div>
            )}

            {alters.length >= 1 && (
              <>
                {/* Edit Relationship Dialog */}
                <Dialog open={!!editingRelationship} onOpenChange={(open) => {
                  if (!open) {
                    setEditingRelationship(null)
                    setEditingGroup(null)
                  }
                }}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Edit Relationship{editingGroup && editingGroup.partners.length > 1 ? ' Group' : ''}</DialogTitle>
                      <DialogDescription>
                        {editingRelationship && MN_RELATIONSHIP_TYPES.includes(editingRelationship.relationType)
                          ? editingGroup && editingGroup.partners.length > 1
                            ? "Manage partners in this relationship group."
                            : "Update this relationship or add more partners."
                          : "Update this relationship's details."}
                      </DialogDescription>
                    </DialogHeader>
                    {editingRelationship && (
                      <RelationshipEditForm
                        relationship={editingRelationship}
                        groupedPartners={editingGroup?.partners}
                        anchorId={editingGroup?.anchorId}
                        anchorUserId={editingGroup?.anchorUserId}
                        direction={editingGroup?.direction}
                        getAlterName={getAlterName}
                        getUserName={getUserName}
                        isManyToMany={MN_RELATIONSHIP_TYPES.includes(editingRelationship.relationType)}
                        availableAlters={alters}
                        existingPartnerIds={(() => {
                          // Compute all alter IDs already in relationships of this type with the anchor
                          const anchorId = editingGroup?.anchorId || editingRelationship.sideAAlterId
                          const partnerIds = new Set<string>()
                          
                          // Include anchor
                          if (anchorId) partnerIds.add(anchorId)
                          
                          // Include all partners in the group
                          if (editingGroup) {
                            editingGroup.partners.forEach(p => {
                              if (p.alterId) partnerIds.add(p.alterId)
                            })
                          } else {
                            // Fallback for non-grouped
                            if (editingRelationship.sideAAlterId) partnerIds.add(editingRelationship.sideAAlterId)
                            if (editingRelationship.sideBAlterId) partnerIds.add(editingRelationship.sideBAlterId)
                          }
                          
                          return Array.from(partnerIds)
                        })()}
                        onAddPartners={async (newRelationships) => {
                          for (const rel of newRelationships) {
                            await createRelationshipEntry(rel)
                          }
                          loadRelationships()
                          setEditingRelationship(null)
                          setEditingGroup(null)
                          showToast({
                            title: 'Success',
                            description: `Added ${newRelationships.length} new partner${newRelationships.length > 1 ? 's' : ''} to the relationship`,
                          })
                        }}
                        onSave={async (data) => {
                          await handleUpdateRelationship(editingRelationship.id, data)
                        }}
                        onRemoveParticipant={async (side) => {
                          await handleRemoveParticipant(editingRelationship.id, side)
                        }}
                        onRemovePartner={async (relationshipId) => {
                          try {
                            await api.deleteRelationship({ path: { relationshipId } })
                            loadRelationships()
                            // If this was the last partner, close the dialog
                            if (editingGroup && editingGroup.partners.length <= 1) {
                              setEditingRelationship(null)
                              setEditingGroup(null)
                            } else if (editingGroup) {
                              // Update the group to remove this partner
                              setEditingGroup({
                                ...editingGroup,
                                partners: editingGroup.partners.filter(p => p.id !== relationshipId),
                              })
                            }
                            showToast({
                              title: 'Success',
                              description: 'Partner removed from relationship',
                            })
                          } catch {
                            showToast({
                              title: 'Error',
                              description: 'Failed to remove partner',
                            })
                          }
                        }}
                        onDeleteAll={async () => {
                          // Delete the primary relationship and all grouped partners
                          const relationshipsToDelete = [editingRelationship.id]
                          if (editingGroup) {
                            relationshipsToDelete.push(...editingGroup.partners.map(p => p.id))
                          }
                          
                          try {
                            for (const relId of relationshipsToDelete) {
                              await api.deleteRelationship({ path: { relationshipId: relId } })
                            }
                            loadRelationships()
                            setEditingRelationship(null)
                            setEditingGroup(null)
                            showToast({
                              title: 'Success',
                              description: `Deleted ${relationshipsToDelete.length} relationship${relationshipsToDelete.length > 1 ? 's' : ''}`,
                            })
                          } catch {
                            showToast({
                              title: 'Error',
                              description: 'Failed to delete relationships',
                              variant: 'error',
                            })
                          }
                        }}
                        onCancel={() => {
                          setEditingRelationship(null)
                          setEditingGroup(null)
                        }}
                      />
                    )}
                  </DialogContent>
                </Dialog>

                <ul className="flex flex-col gap-4">
                  {/* Render grouped relationships */}
                  {groupedRelationships.grouped.map((group) => (
                    <li key={group.key} className="p-4 bg-card rounded-md shadow-sm w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {group.direction === 'forward' ? (
                              <>
                                {/* Forward: Anchor → Type → Partners */}
                                {renderAlterLink(group.anchorId, group.anchorUserId)}
                                <span className="text-muted-foreground">→</span>
                                <span className="px-2 py-1 bg-muted rounded text-sm">
                                  {getRelationshipTypeLabel(group.relationType)}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="flex items-center gap-1 flex-wrap">
                                  {group.partners.map((partner, idx) => (
                                    <span key={partner.id} className="inline-flex items-center">
                                      {renderAlterLink(partner.alterId, partner.userId)}
                                      {idx < group.partners.length - 1 && (
                                        <span className="text-muted-foreground mx-1">,</span>
                                      )}
                                    </span>
                                  ))}
                                </span>
                              </>
                            ) : (
                              <>
                                {/* Reverse: Partners → Type → Anchor */}
                                <span className="flex items-center gap-1 flex-wrap">
                                  {group.partners.map((partner, idx) => (
                                    <span key={partner.id} className="inline-flex items-center">
                                      {renderAlterLink(partner.alterId, partner.userId)}
                                      {idx < group.partners.length - 1 && (
                                        <span className="text-muted-foreground mx-1">,</span>
                                      )}
                                    </span>
                                  ))}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="px-2 py-1 bg-muted rounded text-sm">
                                  {getRelationshipTypeLabel(group.relationType)}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                {renderAlterLink(group.anchorId, group.anchorUserId)}
                              </>
                            )}
                            {group.pastLife && (
                              <span className="text-xs text-muted-foreground ml-2">(past life)</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {group.partners.length} {group.direction === 'reverse' ? 'source' : 'target'}{group.partners.length > 1 ? 's' : ''} · Created {new Date(group.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {canEditSystem && (
                          <div className="flex space-x-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRelationship(group.partners[0].relationship)
                                setEditingGroup({
                                  anchorId: group.anchorId,
                                  anchorUserId: group.anchorUserId,
                                  partners: group.partners.map(p => ({
                                    id: p.id,
                                    alterId: p.alterId,
                                    userId: p.userId,
                                  })),
                                  direction: group.direction,
                                })
                              }}
                              className="h-8 w-8 p-0"
                              title="Edit relationship group"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}

                  {/* Render non-groupable relationships (non m-n types) */}
                  {groupedRelationships.nonGroupable.map((relationship) => (
                    <li key={relationship.id} className="p-4 bg-card rounded-md shadow-sm w-full">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {renderAlterLink(relationship.sideAAlterId, relationship.sideAUserId)}
                            <span className="text-muted-foreground">→</span>
                            <span className="px-2 py-1 bg-muted rounded text-sm">
                              {getRelationshipTypeLabel(relationship.relationType)}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            {renderAlterLink(relationship.sideBAlterId, relationship.sideBUserId)}
                            {relationship.pastLife && (
                              <span className="text-xs text-muted-foreground ml-2">(past life)</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Created {new Date(relationship.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {canEditSystem && (
                          <div className="flex space-x-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRelationship(relationship)
                                setEditingGroup(null) // Non-grouped relationship
                              }}
                              className="h-8 w-8 p-0"
                              title="Edit relationship"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRelationship(relationship.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {(groupedRelationships.grouped.length === 0 && groupedRelationships.nonGroupable.length === 0) && (
                  <div className="text-center py-16">
                    <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Heart className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">
                      {relationshipSearch.trim() ? 'No matching relationships' : 'No relationships found'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {relationshipSearch.trim()
                        ? `No relationships match "${relationshipSearch}". Try a different search term.`
                        : canEditSystem
                          ? "Define relationships between your alters to get started."
                          : "This system doesn't have any defined relationships yet."}
                    </p>
                    {relationshipSearch.trim() && (
                      <Button variant="outline" onClick={() => setRelationshipSearch('')}>
                        Clear Search
                      </Button>
                    )}
                    {!relationshipSearch.trim() && canEditSystem && (
                      <Dialog open={createRelationshipDialogOpen} onOpenChange={setCreateRelationshipDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Relationship
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Create New Relationship</DialogTitle>
                            <DialogDescription>
                              Define relationships between alters. Select source alters on the left and target alters on the right.
                            </DialogDescription>
                          </DialogHeader>
                          <AdvancedRelationshipForm
                            currentSystemAlters={alters}
                            currentSystemId={selectedSystemId}
                            systems={systems}
                            mode="create"
                            onCancel={() => setCreateRelationshipDialogOpen(false)}
                            onSave={async (relationships: CreateRelationshipRequest[]) => {
                              for (const data of relationships) {
                                await createRelationshipEntry(data)
                              }
                              setCreateRelationshipDialogOpen(false)
                              loadRelationships()
                              showToast({ 
                                title: 'Success', 
                                description: relationships.length > 1 
                                  ? `${relationships.length} relationships created successfully`
                                  : 'Relationship created successfully' 
                              })
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">DID System</h1>
          <p className="text-muted-foreground">Manage alters, affiliations, and subsystems</p>
        </div>
      </div>

      {/* System Selector */}
      <div className="flex items-end space-x-4 mb-6">
        <div className="flex flex-col space-y-2">
          <Label htmlFor="systemSelect">System</Label>
          {systems.length > 0 && (
            <Select value={selectedSystemId} onValueChange={(e) => setSelectedSystemId(e)}>
              <SelectTrigger>
                  <SelectValue placeholder='Select DID-system' />
              </SelectTrigger>
              <SelectContent>
                  <SelectGroup>
                      <SelectLabel>DID-System</SelectLabel>
                      {Array.isArray(systems) && systems.map((system) => (
                        <SelectItem key={system.id} value={system.id}>
                          {system.username}
                        </SelectItem>
                      ))}
                  </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6 border-b">
        <Button
          variant={activeTab === 'alters' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('alters')}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
        >
          <Users className="w-4 h-4 mr-2" />
          Alters
        </Button>
        <Button
          variant={activeTab === 'relationships' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('relationships')}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
        >
          <Heart className="w-4 h-4 mr-2" />
          Relationships
        </Button>
        <Button
          variant={activeTab === 'affiliations' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('affiliations')}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
        >
          <UserCheck className="w-4 h-4 mr-2" />
          Affiliations
        </Button>
        <Button
          variant={activeTab === 'subsystems' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('subsystems')}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
        >
          <Network className="w-4 h-4 mr-2" />
          Subsystems
        </Button>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  )
}