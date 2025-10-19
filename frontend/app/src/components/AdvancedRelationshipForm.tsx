"use client"

import * as React from "react"
import { Alter, User, CreateRelationshipRequest } from "@didhub/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/ui/combobox"
import { AlterSelectionTable } from "@/components/AlterSelectionTable"
import { cn } from "@/lib/utils"
import { useApi } from "@/context/ApiContext"
import { ArrowRight, Users, User as UserIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { RELATIONSHIP_TYPES } from '@/lib/relationshipTypes'

interface AdvancedRelationshipFormProps {
  /** The current system's alters (pre-loaded, used for source side) */
  currentSystemAlters: Alter[]
  /** The current system ID */
  currentSystemId: string
  /** All available systems */
  systems: User[]
  mode?: "create" | "edit"
  onSave: (relationships: CreateRelationshipRequest[]) => Promise<void>
  onCancel?: () => void
  className?: string
}

export function AdvancedRelationshipForm({
  currentSystemAlters,
  currentSystemId,
  systems,
  mode = "create",
  onSave,
  onCancel,
  className,
}: AdvancedRelationshipFormProps) {
  const api = useApi()

  // Form state
  const [relationType, setRelationType] = React.useState<string>("")
  const [pastLife, setPastLife] = React.useState(false)

  // Source side mode: "alter" or "user"
  const [sourceMode, setSourceMode] = React.useState<"alter" | "user">("alter")
  const [sourceAlterIds, setSourceAlterIds] = React.useState<string[]>([])
  const [sourceUserId, setSourceUserId] = React.useState<string>("")

  // Target side mode: "alter" or "user"
  const [targetMode, setTargetMode] = React.useState<"alter" | "user">("alter")
  const [targetSystemId, setTargetSystemId] = React.useState<string>(currentSystemId)
  const [targetAlters, setTargetAlters] = React.useState<Alter[]>([])
  const [targetAlterIds, setTargetAlterIds] = React.useState<string[]>([])
  const [targetUserId, setTargetUserId] = React.useState<string>("")
  const [loadingTargetAlters, setLoadingTargetAlters] = React.useState(false)

  // Non-system users for user-mode selection
  const [nonSystemUsers, setNonSystemUsers] = React.useState<User[]>([])
  const [loadingNonSystemUsers, setLoadingNonSystemUsers] = React.useState(false)

  const [loading, setLoading] = React.useState(false)

  // Load non-system users when user mode is selected
  React.useEffect(() => {
    const loadNonSystemUsers = async () => {
      if (sourceMode !== "user" && targetMode !== "user") {
        return
      }
      if (nonSystemUsers.length > 0) {
        return // Already loaded
      }
      
      setLoadingNonSystemUsers(true)
      try {
        const response = await api.request<{ items: User[] }>(
          "GET",
          "/users?isSystem=false",
          false,
          {}
        )
        const items = response.data?.items || response.data
        setNonSystemUsers(Array.isArray(items) ? items : [])
      } catch {
        setNonSystemUsers([])
      } finally {
        setLoadingNonSystemUsers(false)
      }
    }

    loadNonSystemUsers()
  }, [sourceMode, targetMode, api, nonSystemUsers.length])

  // Reset selections when mode changes
  React.useEffect(() => {
    setSourceAlterIds([])
    setSourceUserId("")
  }, [sourceMode])

  React.useEffect(() => {
    setTargetAlterIds([])
    setTargetUserId("")
  }, [targetMode])

  // When target system changes, load alters for that system
  React.useEffect(() => {
    const loadTargetAlters = async () => {
      if (!targetSystemId) {
        setTargetAlters([])
        return
      }

      // If target is current system, use the pre-loaded alters
      if (targetSystemId === currentSystemId) {
        setTargetAlters(currentSystemAlters)
        return
      }

      setLoadingTargetAlters(true)
      try {
        const response = await api.request<Alter[]>(
          "GET",
          `/alters?systemId=${targetSystemId}`,
          false,
          {}
        )
        setTargetAlters(Array.isArray(response.data) ? response.data : [])
      } catch {
        setTargetAlters([])
      } finally {
        setLoadingTargetAlters(false)
      }
    }

    loadTargetAlters()
    // Clear target selection when system changes
    setTargetAlterIds([])
  }, [targetSystemId, currentSystemId, currentSystemAlters, api])

  // System options for combobox (for alter mode - selecting which system's alters to show)
  const systemOptions = React.useMemo(() => {
    return systems.map((s) => ({
      value: s.id,
      label: s.displayName || s.username,
    }))
  }, [systems])

  // Non-system user options for combobox (for user mode - selecting a non-system user)
  const userOptions = React.useMemo(() => {
    return nonSystemUsers.map((u) => ({
      value: u.id,
      label: u.displayName || u.username,
    }))
  }, [nonSystemUsers])

  // Validation
  const isValid = React.useMemo(() => {
    if (!relationType) return false
    
    // Source validation
    if (sourceMode === "alter" && sourceAlterIds.length === 0) return false
    if (sourceMode === "user" && !sourceUserId) return false
    
    // Target validation
    if (targetMode === "alter" && targetAlterIds.length === 0) return false
    if (targetMode === "user" && !targetUserId) return false

    // Check for self-relationships
    if (sourceMode === "user" && targetMode === "user" && sourceUserId === targetUserId) {
      return false
    }
    
    if (sourceMode === "alter" && targetMode === "alter" && targetSystemId === currentSystemId) {
      const hasSelfRelationship = sourceAlterIds.some((id) =>
        targetAlterIds.includes(id)
      )
      if (hasSelfRelationship && sourceAlterIds.length === 1 && targetAlterIds.length === 1) {
        return false
      }
    }

    return true
  }, [relationType, sourceMode, sourceAlterIds, sourceUserId, targetMode, targetAlterIds, targetUserId, targetSystemId, currentSystemId])

  // Build preview text
  const getPreviewText = () => {
    let sourceText = ""
    let targetText = ""
    let relationshipCount = 1
    
    if (sourceMode === "user") {
      if (!sourceUserId) return null
      const user = nonSystemUsers.find(u => u.id === sourceUserId)
      sourceText = user?.displayName || user?.username || "Unknown User"
    } else {
      if (sourceAlterIds.length === 0) return null
      const sourceNames = sourceAlterIds
        .map((id) => currentSystemAlters.find((a) => a.id === id)?.name)
        .filter(Boolean)
      if (sourceNames.length === 0) return null
      sourceText = sourceNames.length > 2 
        ? `${sourceNames.slice(0, 2).join(", ")} and ${sourceNames.length - 2} more`
        : sourceNames.join(" & ")
    }
    
    if (targetMode === "user") {
      if (!targetUserId) return null
      const user = nonSystemUsers.find(u => u.id === targetUserId)
      targetText = user?.displayName || user?.username || "Unknown User"
    } else {
      if (targetAlterIds.length === 0) return null
      const targetNames = targetAlterIds
        .map((id) => targetAlters.find((a) => a.id === id)?.name)
        .filter(Boolean)
      if (targetNames.length === 0) return null
      targetText = targetNames.length > 2 
        ? `${targetNames.slice(0, 2).join(", ")} and ${targetNames.length - 2} more`
        : targetNames.join(" & ")
    }

    const typeLabel = RELATIONSHIP_TYPES.find((t) => t.value === relationType)?.label || relationType

    // Calculate relationship count
    const sourceCount = sourceMode === "user" ? 1 : sourceAlterIds.length
    const targetCount = targetMode === "user" ? 1 : targetAlterIds.length
    relationshipCount = sourceCount * targetCount

    const relationshipText = relationshipCount > 1 ? `${relationshipCount} relationships` : "1 relationship"

    return {
      summary: `${sourceText} → ${typeLabel} → ${targetText}`,
      count: relationshipText,
    }
  }

  const handleSave = async () => {
    if (!isValid) return

    setLoading(true)
    try {
      // Create all relationship combinations
      const relationships: CreateRelationshipRequest[] = []
      
      // Get source items (user ID or alter IDs)
      const sourceItems = sourceMode === "user" 
        ? [{ type: "user" as const, id: sourceUserId }]
        : sourceAlterIds.map(id => ({ type: "alter" as const, id }))
      
      // Get target items (user ID or alter IDs)  
      const targetItems = targetMode === "user"
        ? [{ type: "user" as const, id: targetUserId }]
        : targetAlterIds.map(id => ({ type: "alter" as const, id }))

      for (const source of sourceItems) {
        for (const target of targetItems) {
          // Skip self-relationships (same ID on both sides)
          if (source.type === target.type && source.id === target.id) continue
          
          // The database schema requires either user_id OR alter_id per side, not both
          const request: CreateRelationshipRequest = {
            relationType,
            pastLife,
          }
          
          if (source.type === "user") {
            request.sideAUserId = source.id
          } else {
            request.sideAAlterId = source.id
          }
          
          if (target.type === "user") {
            request.sideBUserId = target.id
          } else {
            request.sideBAlterId = target.id
          }
          
          relationships.push(request)
        }
      }

      if (relationships.length === 0) {
        return
      }

      await onSave(relationships)
    } finally {
      setLoading(false)
    }
  }

  const preview = getPreviewText()

  // Filter out source alters from target if same system
  const availableTargetAlters = React.useMemo(() => {
    if (targetSystemId !== currentSystemId) return targetAlters
    // Allow all alters but show a warning for same-alter selections
    return targetAlters
  }, [targetAlters, targetSystemId, currentSystemId])

  return (
    <div className={cn("space-y-6", className)}>
      {/* Relationship Type */}
      <div>
        <Label htmlFor="rel-type">Relationship Type *</Label>
        <Select value={relationType} onValueChange={setRelationType}>
          <SelectTrigger id="rel-type">
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

      {/* Source and Target Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Side */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Source *</Label>
            <Tabs value={sourceMode} onValueChange={(v) => setSourceMode(v as "alter" | "user")}>
              <TabsList className="h-7">
                <TabsTrigger value="alter" className="text-xs px-2 py-1 h-5 gap-1">
                  <Users className="w-3 h-3" />
                  Alters
                </TabsTrigger>
                <TabsTrigger value="user" className="text-xs px-2 py-1 h-5 gap-1">
                  <UserIcon className="w-3 h-3" />
                  User
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {sourceMode === "alter" ? (
            <>
              <span className="text-xs text-muted-foreground">
                {sourceAlterIds.length} selected
              </span>
              <div className="rounded-md border p-3 bg-muted/30">
                <AlterSelectionTable
                  alters={currentSystemAlters}
                  selectedAlterIds={sourceAlterIds}
                  onSelectionChange={setSourceAlterIds}
                />
              </div>
            </>
          ) : (
            loadingNonSystemUsers ? (
              <div className="text-sm text-muted-foreground">Loading users...</div>
            ) : (
              <Combobox
                options={userOptions}
                value={sourceUserId}
                onValueChange={setSourceUserId}
                placeholder="Select user..."
                searchPlaceholder="Search users..."
                emptyText="No users found."
              />
            )
          )}
        </div>

        {/* Arrow indicator for larger screens */}
        <div className="hidden lg:flex items-center justify-center absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {/* This is positioned via parent relative positioning */}
        </div>

        {/* Target Side */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Target *</Label>
            <Tabs value={targetMode} onValueChange={(v) => setTargetMode(v as "alter" | "user")}>
              <TabsList className="h-7">
                <TabsTrigger value="alter" className="text-xs px-2 py-1 h-5 gap-1">
                  <Users className="w-3 h-3" />
                  Alters
                </TabsTrigger>
                <TabsTrigger value="user" className="text-xs px-2 py-1 h-5 gap-1">
                  <UserIcon className="w-3 h-3" />
                  User
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {targetMode === "alter" ? (
            <>
              {/* System selector */}
              <Combobox
                options={systemOptions}
                value={targetSystemId}
                onValueChange={setTargetSystemId}
                placeholder="Select system..."
                searchPlaceholder="Search systems..."
                emptyText="No systems found."
              />

              <span className="text-xs text-muted-foreground">
                {targetAlterIds.length} selected
              </span>

              {/* Target alters table */}
              <div className="rounded-md border p-3 bg-muted/30">
                {loadingTargetAlters ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">Loading alters...</div>
                  </div>
                ) : availableTargetAlters.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-muted-foreground">
                      {targetSystemId ? "No alters in this system" : "Select a system first"}
                    </div>
                  </div>
                ) : (
                  <AlterSelectionTable
                    alters={availableTargetAlters}
                    selectedAlterIds={targetAlterIds}
                    onSelectionChange={setTargetAlterIds}
                  />
                )}
              </div>
            </>
          ) : (
            loadingNonSystemUsers ? (
              <div className="text-sm text-muted-foreground">Loading users...</div>
            ) : (
              <Combobox
                options={userOptions}
                value={targetUserId}
                onValueChange={setTargetUserId}
                placeholder="Select user..."
                searchPlaceholder="Search users..."
                emptyText="No users found."
              />
            )
          )}
        </div>
      </div>

      {/* Relationship Preview */}
      {preview && (
        <div className="p-4 bg-muted rounded-md space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{preview.summary}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            This will create {preview.count}
            {pastLife && " (past life)"}
          </div>
        </div>
      )}

      {/* Past Life Toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id="rel-past-life"
          checked={pastLife}
          onCheckedChange={setPastLife}
        />
        <Label htmlFor="rel-past-life">Past Life Relationship</Label>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={loading || !isValid}>
          {loading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
            ? `Create Relationship${(sourceMode === "user" ? 1 : sourceAlterIds.length) * (targetMode === "user" ? 1 : targetAlterIds.length) > 1 ? "s" : ""}`
            : "Save"}
        </Button>
      </div>
    </div>
  )
}

