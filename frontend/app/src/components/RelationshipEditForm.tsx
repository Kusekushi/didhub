"use client"

import * as React from "react"
import { Alter, Relationship, UpdateRelationshipRequest, CreateRelationshipRequest } from "@didhub/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { AlertTriangle, UserMinus, UserPlus, ChevronDown, ChevronUp } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

import { RELATIONSHIP_TYPES, MN_RELATIONSHIP_TYPES } from '@/lib/relationshipTypes'


/** Partner info for grouped relationship display */
export interface GroupedPartner {
  id: string  // relationship id
  alterId?: string
  userId?: string
}

interface RelationshipEditFormProps {
  /** The relationship being edited (primary relationship of the group) */
  relationship: Relationship
  /** All partners in this relationship group (for m-n relationships) */
  groupedPartners?: GroupedPartner[]
  /** The anchor participant ID (the one that all partners are connected to) */
  anchorId?: string
  anchorUserId?: string
  /** Direction of the grouped relationship ('forward' = anchor→partners, 'reverse' = partners→anchor) */
  direction?: 'forward' | 'reverse'
  /** All available alters for adding new partners */
  availableAlters?: Alter[]
  /** IDs of alters already in relationships with the current participants (to exclude from selection) */
  existingPartnerIds?: string[]
  /** Helper to get alter name by ID */
  getAlterName: (alterId: string) => string
  /** Helper to get user name by ID */
  getUserName: (userId: string) => string
  /** Whether this is an m-n type relationship */
  isManyToMany?: boolean
  /** Callback when relationship is updated */
  onSave: (data: UpdateRelationshipRequest) => Promise<void>
  /** Callback when user wants to remove a partner (by relationship id) */
  onRemoveParticipant: () => Promise<void>
  /** Callback when user wants to remove a specific partner from the group (by relationship id) */
  onRemovePartner?: (relationshipId: string) => Promise<void>
  /** Callback when user wants to add more partners to expand to 1-n */
  onAddPartners?: (newRelationships: CreateRelationshipRequest[]) => Promise<void>
  /** Callback when user wants to delete all relationships in this group */
  onDeleteAll?: () => Promise<void>
  /** Callback when cancelled */
  onCancel?: () => void
  className?: string
}

export function RelationshipEditForm({
  relationship,
  groupedPartners = [],
  anchorId: anchorIdProp,
  anchorUserId: anchorUserIdProp,
  direction = 'forward',
  availableAlters = [],
  existingPartnerIds = [],
  getAlterName,
  getUserName,
  isManyToMany: isManyToManyProp,
  onSave,
  onRemoveParticipant,
  onRemovePartner,
  onAddPartners,
  onDeleteAll,
  onCancel,
  className,
}: RelationshipEditFormProps) {
  const [relationType, setRelationType] = React.useState(relationship.relationType)
  const [pastLife, setPastLife] = React.useState(relationship.pastLife || false)
  const [loading, setLoading] = React.useState(false)
  const [removingPartnerId, setRemovingPartnerId] = React.useState<string | null>(null)
  const [removingSide, setRemovingSide] = React.useState<'A' | 'B' | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  
  // State for adding new partners
  const [showAddPartners, setShowAddPartners] = React.useState(false)
  const [selectedNewPartnerIds, setSelectedNewPartnerIds] = React.useState<string[]>([])

  // Determine if this is a many-to-many type relationship
  const isManyToMany = isManyToManyProp ?? MN_RELATIONSHIP_TYPES.includes(relationship.relationType)

  // Use grouped partners if provided, otherwise fall back to single relationship display
  const hasGroupedPartners = groupedPartners.length > 0
  
  // Get the anchor - either from props or from the relationship's side A
  const anchorId = anchorIdProp || relationship.sideAAlterId
  const anchorUserId = anchorUserIdProp || relationship.sideAUserId
  
  // Get anchor display name
  const anchorName = anchorId 
    ? getAlterName(anchorId)
    : anchorUserId 
      ? getUserName(anchorUserId)
      : "Unknown"

  // For non-grouped display, get the other side
  const sideAId = relationship.sideAAlterId || relationship.sideAUserId
  const sideBId = relationship.sideBAlterId || relationship.sideBUserId

  // Filter available alters to exclude current participants and existing partners
  const selectableAlters = React.useMemo(() => {
    const excludeIds = new Set([
      sideAId,
      sideBId,
      ...existingPartnerIds,
    ].filter(Boolean) as string[])
    
    return availableAlters.filter(alter => !excludeIds.has(alter.id))
  }, [availableAlters, sideAId, sideBId, existingPartnerIds])

  // Get display names for sides
  const sideAName = relationship.sideAAlterId 
    ? getAlterName(relationship.sideAAlterId)
    : relationship.sideAUserId 
      ? getUserName(relationship.sideAUserId)
      : "Unknown"

  const sideBName = relationship.sideBAlterId
    ? getAlterName(relationship.sideBAlterId)
    : relationship.sideBUserId
      ? getUserName(relationship.sideBUserId)
      : "Unknown"

  const handleSave = async () => {
    setLoading(true)
    try {
      await onSave({
        relationType,
        pastLife,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRemovePartner = async (relationshipId: string) => {
    if (!onRemovePartner) return
    setLoading(true)
    try {
      await onRemovePartner(relationshipId)
    } finally {
      setLoading(false)
      setRemovingPartnerId(null)
    }
  }

  const handleAddPartners = async () => {
    if (!onAddPartners || selectedNewPartnerIds.length === 0) return
    
    setLoading(true)
    try {
      // Create new relationships based on direction
      // Forward: anchor is side A, partners are side B (anchor → type → partners)
      // Reverse: anchor is side B, partners are side A (partners → type → anchor)
      const newRelationships: CreateRelationshipRequest[] = selectedNewPartnerIds.map(alterId => {
        if (direction === 'reverse') {
          // Reverse: new partners go on side A, anchor stays on side B
          if (anchorId) {
            return {
              relationType: relationship.relationType,
              pastLife: relationship.pastLife,
              sideAAlterId: alterId,
              sideBAlterId: anchorId,
            }
          } else {
            return {
              relationType: relationship.relationType,
              pastLife: relationship.pastLife,
              sideAAlterId: alterId,
              sideBUserId: anchorUserId,
            }
          }
        } else {
          // Forward: anchor is side A, new partners go on side B
          if (anchorId) {
            return {
              relationType: relationship.relationType,
              pastLife: relationship.pastLife,
              sideAAlterId: anchorId,
              sideBAlterId: alterId,
            }
          } else {
            return {
              relationType: relationship.relationType,
              pastLife: relationship.pastLife,
              sideAUserId: anchorUserId,
              sideBAlterId: alterId,
            }
          }
        }
      })
      
      await onAddPartners(newRelationships)
      setSelectedNewPartnerIds([])
      setShowAddPartners(false)
    } finally {
      setLoading(false)
    }
  }

  const togglePartnerSelection = (alterId: string) => {
    setSelectedNewPartnerIds(prev => 
      prev.includes(alterId) 
        ? prev.filter(id => id !== alterId)
        : [...prev, alterId]
    )
  }

  const handleDeleteAll = async () => {
    if (!onDeleteAll) return
    setLoading(true)
    try {
      await onDeleteAll()
      setShowDeleteConfirm(false)
    } catch {
      // Error handling done by parent
    } finally {
      setLoading(false)
    }
  }

  const hasChanges = relationType !== relationship.relationType || pastLife !== (relationship.pastLife || false)

  return (
    <div className={cn("space-y-6", className)}>
      {/* Relationship Type */}
      <div>
        <Label htmlFor="edit-rel-type">Relationship Type</Label>
        <Select value={relationType} onValueChange={setRelationType}>
          <SelectTrigger id="edit-rel-type">
            <SelectValue placeholder="Select relationship type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Type</SelectLabel>
              {RELATIONSHIP_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Past Life Toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id="edit-rel-past-life"
          checked={pastLife}
          onCheckedChange={setPastLife}
        />
        <Label htmlFor="edit-rel-past-life">Past Life Relationship</Label>
      </div>

      {/* Participants Section */}
      <div className="space-y-3">
        <Label>Participants</Label>
        
        {hasGroupedPartners ? (
          /* Grouped display */
          <div className="space-y-2">
            {direction === 'reverse' ? (
              <>
                {/* Reverse: Partners → Type → Anchor */}
                {/* Partners list (sources) */}
                <div className="space-y-1">
                  {groupedPartners.map((partner) => {
                    const partnerName = partner.alterId 
                      ? getAlterName(partner.alterId)
                      : partner.userId 
                        ? getUserName(partner.userId)
                        : "Unknown"
                    
                    return (
                      <div key={partner.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                        <span className="font-medium">{partnerName}</span>
                        {onRemovePartner && groupedPartners.length > 1 && (
                          removingPartnerId === partner.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-destructive">Remove?</span>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemovePartner(partner.id)}
                                disabled={loading}
                              >
                                Yes
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRemovingPartnerId(null)}
                                disabled={loading}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemovingPartnerId(partner.id)}
                              disabled={loading}
                              className="text-destructive hover:text-destructive"
                            >
                              <UserMinus className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Relationship arrow */}
                <div className="text-center text-muted-foreground text-sm">
                  ↓ {RELATIONSHIP_TYPES.find(t => t.value === relationType)?.label || relationType} ↓
                </div>

                {/* Anchor participant (target) */}
                <div className="p-3 bg-primary/10 rounded-md border border-primary/20">
                  <span className="font-medium">{anchorName}</span>
                  <span className="text-xs text-muted-foreground ml-2">(target)</span>
                </div>
              </>
            ) : (
              <>
                {/* Forward: Anchor → Type → Partners */}
                {/* Anchor participant (source) */}
                <div className="p-3 bg-primary/10 rounded-md border border-primary/20">
                  <span className="font-medium">{anchorName}</span>
                  <span className="text-xs text-muted-foreground ml-2">(source)</span>
                </div>

                {/* Relationship arrow */}
                <div className="text-center text-muted-foreground text-sm">
                  ↓ {RELATIONSHIP_TYPES.find(t => t.value === relationType)?.label || relationType} ↓
                </div>

                {/* Partners list (targets) */}
                <div className="space-y-1">
                  {groupedPartners.map((partner) => {
                    const partnerName = partner.alterId 
                      ? getAlterName(partner.alterId)
                      : partner.userId 
                        ? getUserName(partner.userId)
                        : "Unknown"
                    
                    return (
                      <div key={partner.id} className="flex items-center justify-between p-3 bg-muted rounded-md">
                        <span className="font-medium">{partnerName}</span>
                        {isManyToMany && onRemovePartner && groupedPartners.length > 1 && (
                          removingPartnerId === partner.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-destructive">Remove?</span>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemovePartner(partner.id)}
                                disabled={loading}
                              >
                                Yes
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRemovingPartnerId(null)}
                                disabled={loading}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemovingPartnerId(partner.id)}
                              disabled={loading}
                              className="text-destructive hover:text-destructive"
                            >
                              <UserMinus className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            
            {groupedPartners.length > 1 && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground mt-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Removing a {direction === 'reverse' ? 'source' : 'target'} will delete that specific relationship entry.
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Legacy display: side A → side B */
          <div className="space-y-2">
            {/* Side A */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <span className="font-medium">{sideAName}</span>
            </div>

            {/* Relationship arrow */}
            <div className="text-center text-muted-foreground text-sm">
              ↓ {RELATIONSHIP_TYPES.find(t => t.value === relationType)?.label || relationType} ↓
            </div>

              {/* Side B */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <span className="font-medium">{sideBName}</span>
                {onRemoveParticipant && (
                  removingSide === 'B' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-destructive">Remove?</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          setLoading(true)
                          try {
                            await onRemoveParticipant()
                          } finally {
                            setLoading(false)
                            setRemovingSide(null)
                          }
                        }}
                        disabled={loading}
                      >
                        Yes
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemovingSide(null)}
                        disabled={loading}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemovingSide('B')}
                      disabled={loading}
                      className="text-destructive hover:text-destructive"
                    >
                      <UserMinus className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  )
                )}
              </div>
          </div>
        )}
      </div>

      {/* Add Partners Section - to expand relationships */}
      {hasGroupedPartners && onAddPartners && selectableAlters.length > 0 && (
        <div className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddPartners(!showAddPartners)}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {direction === 'reverse' ? 'Add More Sources' : 'Add More Targets'}
            </span>
            {showAddPartners ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>

          {showAddPartners && (
            <div className="space-y-3 p-3 border rounded-md bg-muted/30">
              <div className="space-y-2">
                <Label>
                  {direction === 'reverse' 
                    ? `Select additional sources for "${anchorName}"`
                    : `Select additional targets for "${anchorName}"`
                  }
                </Label>
                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2 bg-background">
                  {selectableAlters.map(alter => (
                    <div 
                      key={alter.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => togglePartnerSelection(alter.id)}
                    >
                      <Checkbox
                        checked={selectedNewPartnerIds.includes(alter.id)}
                        onCheckedChange={() => togglePartnerSelection(alter.id)}
                      />
                      <span className="text-sm">{alter.name}</span>
                      {alter.pronouns && (
                        <span className="text-xs text-muted-foreground">({alter.pronouns})</span>
                      )}
                    </div>
                  ))}
                </div>
                {selectedNewPartnerIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedNewPartnerIds.length} {direction === 'reverse' ? 'source' : 'target'}{selectedNewPartnerIds.length > 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <Button
                onClick={handleAddPartners}
                disabled={loading || selectedNewPartnerIds.length === 0}
                className="w-full"
              >
                {loading ? "Adding..." : `Add ${selectedNewPartnerIds.length || ''} ${direction === 'reverse' ? 'Source' : 'Target'}${selectedNewPartnerIds.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center">
        {/* Delete Button with Confirmation */}
        {onDeleteAll && (
          <div className="flex items-center gap-2">
            {!showDeleteConfirm ? (
              <Button 
                variant="destructive" 
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
              >
                Delete {hasGroupedPartners ? 'All' : 'Relationship'}
              </Button>
            ) : (
              <>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteAll}
                  disabled={loading}
                >
                  {loading ? "Deleting..." : "Confirm Delete"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={loading}
                >
                  Cancel Delete
                </Button>
              </>
            )}
          </div>
        )}
        
        {/* Save/Cancel Buttons */}
        <div className="flex space-x-2 ml-auto">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !hasChanges}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
